// diag-db.cjs —— 数据库只读体检（自检工具，与 diag-network.cjs 并列）
// 用法：node diag-db.cjs
// 检查：表清单/行数、settings 敏感 KEY 加密+可解密性、引擎 KEY 配置状态、关键表抽样
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const DB = path.join(ROOT, "data", "workbench.db");
const KEY_FILE = path.join(ROOT, "data", "fieldkey.bin");

function loadKey() {
  const b = fs.readFileSync(KEY_FILE);
  if (b.length !== 32) throw new Error("fieldkey.bin 长度 != 32");
  return b;
}
const isSensitive = (k) => /(_key|_sk|_ak|_token)$/.test(k);
function decField(stored) {
  if (!stored || !stored.startsWith("enc:")) return stored;
  try {
    const buf = Buffer.from(stored.slice(4), "base64");
    const iv = buf.subarray(0, 12), tag = buf.subarray(buf.length - 16), ct = buf.subarray(12, buf.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", loadKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch { return "<解密失败>"; }
}
const mask = (s) => (s && s.length > 8 ? s.slice(0, 4) + "…" + s.slice(-4) : (s ? "***" : "（空）"));

const db = new DatabaseSync(DB);
const out = [];

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
out.push(`## 表清单（共 ${tables.length} 张）`);
for (const t of tables) {
  const c = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  out.push(`- ${t}: ${c} 行`);
}

out.push("\n## settings 敏感 KEY（加密 + 可解密性）");
const rows = db.prepare("SELECT key,value FROM settings WHERE key NOT LIKE 'sqlite%' ORDER BY key").all();
let sensOk = 0, sensPlain = 0, sensBad = 0;
for (const r of rows) {
  if (!isSensitive(r.key)) continue;
  const stored = r.value;
  if (!stored) continue;
  if (!stored.startsWith("enc:")) { sensPlain++; out.push(`- [明文!] ${r.key} = ${mask(stored)}`); continue; }
  const plain = decField(stored);
  if (plain === "<解密失败>") { sensBad++; out.push(`- [解密失败!] ${r.key}`); continue; }
  sensOk++;
  out.push(`- ${r.key} = ${mask(plain)} ${plain ? "✅" : "（空值）"}`);
}
out.push(`\n敏感 KEY 统计：加密可解 ${sensOk} | 明文未加密 ${sensPlain} | 解密失败 ${sensBad}`);

out.push("\n## 引擎 KEY 配置状态（解密后）");
const engKeys = {
  lovart: ["lovart_ak", "lovart_sk"],
  kling: ["kling_ak", "kling_sk"],
  wanxiang: ["wanxiang_key", "qwen_key"],
  jimeng: ["jimeng_key"],
  vidu: ["vidu_key"],
  deepseek: ["deepseek_key"],
  qwen_vl: ["qwen_key"],
};
for (const [eng, keys] of Object.entries(engKeys)) {
  const vals = keys.map((k) => {
    const r = rows.find((x) => x.key === k);
    return r ? decField(r.value) : "";
  }).filter(Boolean);
  out.push(`- ${eng}: ${vals.length ? "已配 ✅（" + vals.map(mask).join("/") + "）" : "未配 ❌"}`);
}

out.push("\n## 关键表抽样");
const users = db.prepare("SELECT username,role,created_at FROM users").all();
out.push("users: " + users.map((u) => `${u.username}(${u.role})`).join(", "));
const tasks = db.prepare("SELECT kind,engine,status,COUNT(*) c FROM tasks GROUP BY kind,engine,status ORDER BY c DESC LIMIT 12").all();
out.push("tasks 分布: " + tasks.map((t) => `${t.kind}/${t.engine}/${t.status}=${t.c}`).join(", "));
const pricing = db.prepare("SELECT COUNT(*) c FROM engine_pricing").get().c;
out.push(`engine_pricing: ${pricing} 条`);
const assets = db.prepare("SELECT COUNT(*) c FROM assets").get().c;
out.push(`assets: ${assets} 条`);

console.log(out.join("\n"));
