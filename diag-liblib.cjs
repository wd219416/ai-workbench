// diag-liblib.cjs — 修正轮询判断：generateStatus 5=成功 6/7=失败，其余继续
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB = path.join(__dirname, "data", "workbench.db");
const KEY_FILE = path.join(__dirname, "data", "fieldkey.bin");

function loadKey() { const b = fs.readFileSync(KEY_FILE); return b; }
function decField(stored) {
  if (!stored || !stored.startsWith("enc:")) return stored;
  const buf = Buffer.from(stored.slice(4), "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(buf.length - 16), ct = buf.subarray(12, buf.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", loadKey(), iv);
  d.setAuthTag(Buffer.from(tag));
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
const db = new DatabaseSync(DB);
const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'liblib_%'").all();
const cfg = {}; for (const r of rows) cfg[r.key] = decField(r.value);
db.close();
const ak = cfg.liblib_ak || "", sk = cfg.liblib_sk || "";
const base = (cfg.liblib_base || "https://openapi.liblibai.cloud").replace(/\/$/, "");

function sign(uri) {
  const ts = String(Date.now()), nonce = crypto.randomUUID().replaceAll("-", "");
  const sig = crypto.createHmac("sha1", sk).update(`${uri}&${ts}&${nonce}`).digest("base64url");
  return new URLSearchParams({ AccessKey: ak, Signature: sig, Timestamp: ts, SignatureNonce: nonce }).toString();
}
async function post(path, body) {
  const res = await fetch(`${base}${path}?${sign(path)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let data = {}; try { data = JSON.parse(text); } catch {}
  return data;
}
const T2I = "e10adc3949ba59abbe56e057f20f883e";

(async () => {
  const prompt = "一只木质花盆，暖色木纹，极简家居风格，电商产品图，白底棚拍";
  const d = await post("/api/generate/webui/text2img", {
    templateUuid: T2I,
    generateParams: { prompt, width: 1024, height: 1024, steps: 20, cfgScale: 7, seed: -1, imgCount: 1 },
  });
  const uuid = d?.data?.generateUuid;
  console.log("提交返回:", JSON.stringify(d));
  if (!uuid) return;
  console.log("generateUuid:", uuid);

  for (let i = 1; i <= 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await post("/api/generate/webui/status", { generateUuid: uuid });
    const dd = s?.data || {};
    const st = dd.generateStatus, pct = dd.percentCompleted;
    console.log(`[poll ${i}] generateStatus=${st} percent=${pct}% images=${(dd.images||[]).length} cost=${dd.pointsCost} balance=${dd.accountBalance}`);
    if (st === 5) { console.log("\n=== 成功，图片URL:", JSON.stringify(dd.images)); break; }
    if (st === 6 || st === 7) { console.log("\n=== 失败:", JSON.stringify(dd.generateMsg || dd.failReason)); break; }
  }
})();
