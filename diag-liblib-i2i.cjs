// diag-liblib-i2i.cjs — Liblib 图生图端到端探测（上传拿URL → img2img → 轮询）
// 依据官方 JS SDK（gravitywp/liblib-javascript）实现 uploadFile + img2img 全流程
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB = path.join(__dirname, "data", "workbench.db");
const KEY_FILE = path.join(__dirname, "data", "fieldkey.bin");
const IMG = process.argv[2] || path.join(__dirname, "data", "uploads", "1788413303150_2dg1pl.png");

function loadKey() { return fs.readFileSync(KEY_FILE); }
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

async function post(uri, body) {
  const res = await fetch(`${base}${uri}?${sign(uri)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let data = {}; try { data = JSON.parse(text); } catch {}
  return { res, data, text };
}

async function uploadImage(filePath) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename).replace(".", "");
  const name = filename.slice(0, filename.length - ext.length - 1);
  // 1) 获取 OSS 直传签名
  const r = await post("/api/generate/upload/signature", { name, extension: ext });
  const sd = r.data?.data || r.data;
  console.log(`\n[upload/signature] HTTP ${r.res.status} code=${r.data?.code} msg=${r.data?.msg || ""}`);
  console.log("  signData keys:", sd ? Object.keys(sd) : "none");
  if (sd) console.log("  postUrl=", sd.postUrl, "\n  key=", sd.key);
  if (!sd?.postUrl) throw new Error("未返回 postUrl: " + r.text.slice(0, 200));
  // 2) FormData 直传 OSS
  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: `image/${ext}` });
  // 注意：签名接口返回的是驼峰 xOss* 字段（SDK 里误写为小写 xoss*）
  const form = new FormData();
  form.append("x-oss-signature", sd.xOssSignature);
  form.append("x-oss-date", sd.xOssDate);
  form.append("x-oss-signature-version", sd.xOssSignatureVersion);
  form.append("policy", sd.policy);
  form.append("key", sd.key);
  form.append("x-oss-credential", sd.xOssCredential);
  form.append("x-oss-expires", String(sd.xOssExpires));
  form.append("file", blob, filename);
  const up = await fetch(sd.postUrl, { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
  const upText = await up.text();
  console.log(`[oss upload] HTTP ${up.status} ${upText.slice(0, 120)}`);
  if (!up.ok) throw new Error("OSS 上传失败 " + up.status + " " + upText.slice(0, 200));
  const url = new URL(sd.key, sd.postUrl).toString();
  console.log("  ✅ 图片URL:", url);
  return url;
}

(async () => {
  try {
    const imgUrl = await uploadImage(IMG);

    // 图生图提交
    const prompt = "transform into cyberpunk style, neon lighting, sci-fi product photography";
    const gp = {
      prompt, width: 1024, height: 1024, steps: 20, cfgScale: 7, seed: -1, imgCount: 1,
      sourceImage: imgUrl, resizeMode: 0, resizedWidth: 1024, resizedHeight: 1024, denoisingStrength: 0.6,
    };
    const r = await post("/api/generate/webui/img2img", { templateUuid: "9c7d531dc75f476aa833b3d452b8f7ad", generateParams: gp });
    const uuid = r.data?.data?.generateUuid;
    console.log(`\n[img2img] HTTP ${r.res.status} code=${r.data?.code} uuid=${uuid || "none"} msg=${r.data?.msg || ""}`);
    if (!uuid) { console.log("  ❌ 未拿到 uuid，原始返回:", r.text.slice(0, 300)); return; }

    // 轮询
    for (let i = 1; i <= 25; i++) {
      await new Promise((r2) => setTimeout(r2, 3000));
      const s = await post("/api/generate/webui/status", { generateUuid: uuid });
      const d = s.data?.data || {};
      console.log(`  [poll ${i}] generateStatus=${d.generateStatus} images=${(d.images || []).length} pointsCost=${d.pointsCost} balance=${d.accountBalance}`);
      if (d.generateStatus === 5) {
        const urls = (d.images || []).map((x) => x?.imageUrl).filter(Boolean);
        console.log("  ✅ 图生图成功:", urls);
        return;
      }
      if ([6, 7].includes(d.generateStatus)) { console.log("  ❌ 失败:", d.generateMsg || d.msg); return; }
    }
  } catch (e) {
    console.error("❌ 异常:", e.message);
  }
})();
