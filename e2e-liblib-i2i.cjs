// e2e-liblib-i2i.cjs — HTTP 端到端测试 Liblib 图生图
// 登录 → 上传参考图 → 出图(带 refAssetId) → 轮询任务
const fs = require("node:fs");
const path = require("node:path");

const base = "http://localhost:3100";
const REF_IMG = process.argv[2] || path.join(__dirname, "data", "uploads", "1788413303150_2dg1pl.png");

(async () => {
  // 1) 登录
  const login = await fetch(base + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const setCookie = login.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  console.log("[login]", login.status, cookie ? "cookie ok" : "NO COOKIE");
  if (!cookie) { console.log(await login.text()); return; }

  // 2) 上传参考图到素材库
  const buf = fs.readFileSync(REF_IMG);
  const fd = new FormData();
  fd.append("image", new Blob([buf], { type: "image/png" }), "ref-e2e.png");
  fd.append("kind", "ref");
  const up = await fetch(base + "/api/upload", { method: "POST", headers: { cookie }, body: fd });
  const upJson = await up.json();
  console.log("[upload]", up.status, "assetId=", upJson.assetId);
  if (!upJson.assetId) { console.log(upJson); return; }

  // 3) 出图（engine=liblib + refAssetId 触发图生图）
  const gen = await fetch(base + "/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      engine: "liblib", refAssetId: upJson.assetId,
      prompt: "transform into cyberpunk style, neon lighting, sci-fi product photography, high detail",
      width: 1024, height: 1024, n: 1,
    }),
  });
  const genJson = await gen.json();
  console.log("[generate]", gen.status, JSON.stringify(genJson).slice(0, 300));
  const taskId = genJson.taskId;
  if (!taskId) return;

  // 4) 轮询任务（GET /api/tasks/[id] 会驱动 pollImage）
  for (let i = 1; i <= 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const tr = await fetch(base + `/api/tasks/${taskId}`, { headers: { cookie } });
    const t = await tr.json();
    const out = (() => { try { return JSON.parse(t.output || "{}"); } catch { return {}; } })();
    console.log(`[poll ${i}] status=${t.status} error=${t.error || ""} files=${(out.files || []).length}`);
    if (t.status !== "processing") {
      if (out.files?.length) console.log("✅ 图生图端到端成功:", out.files.map((f) => base + f).join("\n  "));
      else console.log("❌ 结果:", JSON.stringify(t).slice(0, 300));
      return;
    }
  }
  console.log("⏳ 超时未完成");
})();
