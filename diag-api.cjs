#!/usr/bin/env node
/**
 * diag-api.cjs — API 全端点冒烟测试（阶段二）
 * 覆盖：未登录鉴权拦截(401) + 本地功能正常/异常 + 管理员权限隔离(403)
 * 不依赖外部 LLM/引擎，不产生付费（出图/视频只走 comfyui 预留 / jimeng 跳转）。
 * 用法：node diag-api.cjs [BASE]   （默认 http://localhost:3100）
 */
const BASE = process.argv[2] || "http://localhost:3100";
const ADMIN = { username: "admin", password: "admin123" };

let cookie = "";
let pass = 0, fail = 0;
const results = [];

function check(name, cond, detail = "") {
  const line = (cond ? "  ✅ " : "  ❌ ") + name + (detail ? "  —  " + detail : "");
  console.log(line);
  if (cond) pass++; else { fail++; results.push(line); }
}

async function req(method, path, { body, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (form) { payload = form; }
  else if (body !== undefined && method !== "GET" && method !== "HEAD") {
    headers["content-type"] = "application/json"; payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const m = setCookie.match(/wb_session=([^;]+)/);
    if (m) cookie = "wb_session=" + m[1];
  }
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function login(username, password) {
  cookie = ""; // 清 cookie，避免旧 cookie 干扰
  const r = await req("POST", "/api/auth/login", { body: { username, password } });
  return r;
}

async function main() {
  console.log("════════════════════════════════════════");
  console.log("  API 全端点冒烟测试  " + new Date().toLocaleString("zh-CN"));
  console.log("  目标：" + BASE);
  console.log("════════════════════════════════════════\n");

  // ── A. 未登录鉴权拦截 ─────────────────────────
  console.log("【A】未登录鉴权拦截（应全部 401）");
  const guarded = [
    ["GET", "/api/auth/me"], ["GET", "/api/meta"],
    ["POST", "/api/image/generate"], ["POST", "/api/video/generate"],
    ["POST", "/api/prompt/generate"], ["POST", "/api/prompt/optimize"],
    ["POST", "/api/prompt/reverse"],
    ["GET", "/api/pricing"], ["PUT", "/api/pricing"],
    ["GET", "/api/settings"], ["PUT", "/api/settings"], ["POST", "/api/settings/test"],
    ["GET", "/api/service"], ["POST", "/api/service"],
    ["GET", "/api/tasks"], ["GET", "/api/tasks/1"],
    ["GET", "/api/assets"], ["DELETE", "/api/assets"],
    ["POST", "/api/upload"],
    ["GET", "/api/file/nonexist.png"],
    ["GET", "/api/kb/products"], ["POST", "/api/kb/products"],
    ["GET", "/api/plans"], ["POST", "/api/plans"],
    ["GET", "/api/users"], ["POST", "/api/users"],
  ];
  cookie = "";
  for (const [m, p] of guarded) {
    const r = await req(m, p, { body: {} });
    check(`${m} ${p}`, r.status === 401, `HTTP ${r.status}`);
  }

  // ── B. 登录 ───────────────────────────────────
  console.log("\n【B】登录");
  let r = await login("admin", "wrong-password");
  check("错误密码拒绝", r.status === 401, `HTTP ${r.status}`);
  r = await login(ADMIN.username, ADMIN.password);
  check("admin 登录成功", r.status === 200 && r.data?.role === "admin", `HTTP ${r.status} role=${r.data?.role}`);

  // ── C. auth / meta ────────────────────────────
  console.log("\n【C】auth / meta");
  r = await req("GET", "/api/auth/me");
  check("me 返回用户", r.status === 200 && !!r.data?.username, `HTTP ${r.status} user=${r.data?.username}`);
  r = await req("GET", "/api/meta");
  check("meta 返回业务线", r.status === 200 && Array.isArray(r.data?.lines) && r.data.lines.length >= 2, `lines=${r.data?.lines?.length}`);
  check("meta 含出图引擎", r.status === 200 && Array.isArray(r.data?.imageEngines) && r.data.imageEngines.length >= 4, `imageEngines=${r.data?.imageEngines?.length}`);
  check("meta 含视频引擎", r.status === 200 && Array.isArray(r.data?.videoEngines) && r.data.videoEngines.length >= 2, `videoEngines=${r.data?.videoEngines?.length}`);

  // ── D. 出图 / 出视频（校验拦截，不付费） ─────────
  console.log("\n【D】出图 / 出视频（参数校验，不触发付费）");
  r = await req("POST", "/api/image/generate", { body: { engine: "kling" } });
  check("出图缺提示词 → 400", r.status === 400, `HTTP ${r.status}`);
  r = await req("POST", "/api/image/generate", { body: { engine: "nope", prompt: "x" } });
  check("出图未知引擎 → 400", r.status === 400 && /未知/.test(r.data?.error || ""), `HTTP ${r.status} ${r.data?.error}`);
  r = await req("POST", "/api/image/generate", { body: { engine: "comfyui", prompt: "测试", n: 2, width: 800, height: 800 } });
  check("出图 comfyui 合法 → 200 reserved", r.status === 200 && r.data?.status === "reserved", `HTTP ${r.status} status=${r.data?.status}`);

  r = await req("POST", "/api/video/generate", { body: { engine: "kling" } });
  check("视频缺提示词 → 400", r.status === 400, `HTTP ${r.status}`);
  r = await req("POST", "/api/video/generate", { body: { engine: "lovart", prompt: "x" } });
  check("视频未知引擎 → 400", r.status === 400 && /未知/.test(r.data?.error || ""), `HTTP ${r.status} ${r.data?.error}`);
  r = await req("POST", "/api/video/generate", { body: { engine: "jimeng", prompt: "测试", duration: 5, ratio: "9:16" } });
  check("视频 jimeng → 200 跳转提示", r.status === 200 && r.data?.status === "error" && /跳转/.test(r.data?.message || ""), `HTTP ${r.status} ${r.data?.message}`);

  // ── E. prompt 三个 ─────────────────────────────
  console.log("\n【E】提示词 prompt（只测本地校验）");
  r = await req("POST", "/api/prompt/generate", { body: {} });
  check("生成缺 form.requirement → 400", r.status === 400, `HTTP ${r.status}`);
  r = await req("POST", "/api/prompt/reverse", { form: new FormData() });
  check("反推缺图片 → 400", r.status === 400, `HTTP ${r.status}`);

  // ── F. pricing ────────────────────────────────
  console.log("\n【F】计费表 pricing");
  r = await req("GET", "/api/pricing");
  check("列表 → 200 数组", r.status === 200 && Array.isArray(r.data) && r.data.length > 0, `rows=${r.data?.length}`);
  r = await req("GET", "/api/pricing?engine=kling&model=kling-v2");
  check("单查命中", r.status === 200 && r.data?.found === true, `found=${r.data?.found}`);
  r = await req("GET", "/api/pricing?engine=xxx&model=yyy");
  check("单查未命中 found=false", r.status === 200 && r.data?.found === false, `found=${r.data?.found}`);
  r = await req("PUT", "/api/pricing", { body: {} });
  check("改价缺 id → 400", r.status === 400, `HTTP ${r.status}`);

  // ── G. settings ───────────────────────────────
  console.log("\n【G】设置 settings");
  r = await req("GET", "/api/settings");
  const masked = r.data?.settings?.lovart_ak || "";
  const secretLeak = masked && !masked.includes("****") && masked.length > 8;
  check("返回掩码后的设置", r.status === 200 && !!r.data?.settings, `HTTP ${r.status}`);
  check("敏感 KEY 无明文泄露", r.status === 200 && !secretLeak, `lovart_ak=${masked || "(空)"}`);
  r = await req("POST", "/api/settings/test", { body: { group: "unknown-group" } });
  check("未知分组 → 400", r.status === 400, `HTTP ${r.status}`);

  // ── H. service ────────────────────────────────
  console.log("\n【H】品牌客服 service");
  r = await req("GET", "/api/service");
  check("列表 → 200 数组", r.status === 200 && Array.isArray(r.data), `rows=${r.data?.length}`);
  r = await req("POST", "/api/service", { body: {} });
  check("缺 content → 400", r.status === 400, `HTTP ${r.status}`);
  let svcId = null;
  r = await req("POST", "/api/service", { body: { kind: "咨询", content: "冒烟测试-待删" } });
  check("新增记录 → 200", r.status === 200 && !!r.data?.id, `id=${r.data?.id}`);
  svcId = r.data?.id;
  if (svcId) {
    r = await req("PUT", "/api/service", { body: { id: svcId, status: "replied" } });
    check("改状态 → 200", r.status === 200, `HTTP ${r.status}`);
    r = await req("DELETE", "/api/service", { body: { id: svcId } });
    check("删记录 → 200", r.status === 200, `HTTP ${r.status}`);
  }

  // ── I. tasks ──────────────────────────────────
  console.log("\n【I】任务 tasks");
  r = await req("GET", "/api/tasks");
  check("列表 → 200 数组", r.status === 200 && Array.isArray(r.data), `rows=${r.data?.length}`);
  r = await req("GET", "/api/tasks/999999");
  check("不存在任务 → 404", r.status === 404, `HTTP ${r.status}`);

  // ── J. assets / upload / file ─────────────────
  console.log("\n【J】素材 assets / 上传 / 文件服务");
  r = await req("GET", "/api/assets");
  check("素材列表 → 200", r.status === 200 && Array.isArray(r.data), `rows=${r.data?.length}`);
  r = await req("DELETE", "/api/assets", { body: { id: 999999 } });
  check("删不存在素材 → 404", r.status === 404, `HTTP ${r.status}`);
  r = await req("POST", "/api/upload", { form: new FormData() });
  check("上传缺文件 → 400", r.status === 400, `HTTP ${r.status}`);
  r = await req("GET", "/api/file/nonexist.png");
  check("文件不存在 → 404", r.status === 404, `HTTP ${r.status}`);

  // ── K. kb ─────────────────────────────────────
  console.log("\n【K】知识库 kb");
  r = await req("GET", "/api/kb/products");
  check("products → 200", r.status === 200 && Array.isArray(r.data), `rows=${r.data?.length}`);
  r = await req("GET", "/api/kb/unknown");
  check("未知分区 → 404", r.status === 404, `HTTP ${r.status}`);
  let kbId = null;
  r = await req("POST", "/api/kb/products", { body: { name: "冒烟测试-待删" } });
  check("新增产品 → 200", r.status === 200 && !!r.data?.id, `id=${r.data?.id}`);
  kbId = r.data?.id;
  if (kbId) {
    r = await req("DELETE", "/api/kb/products", { body: { id: kbId } });
    check("删产品 → 200", r.status === 200, `HTTP ${r.status}`);
  }

  // ── L. plans ──────────────────────────────────
  console.log("\n【L】发布计划 plans");
  r = await req("GET", "/api/plans");
  check("列表 → 200", r.status === 200 && Array.isArray(r.data), `rows=${r.data?.length}`);
  r = await req("POST", "/api/plans", { body: {} });
  check("缺参数 → 400", r.status === 400, `HTTP ${r.status}`);

  // ── M. users + 权限隔离 403 ───────────────────
  console.log("\n【M】用户管理 + 权限隔离(403)");
  r = await req("GET", "/api/users");
  check("用户列表(admin) → 200", r.status === 200 && Array.isArray(r.data), `rows=${r.data?.length}`);
  r = await req("POST", "/api/users", { body: {} });
  check("建用户缺参数 → 400", r.status === 400, `HTTP ${r.status}`);
  r = await req("POST", "/api/users", { body: { username: "admin", password: "x123456" } });
  check("重复用户名 → 400", r.status === 400, `HTTP ${r.status}`);

  // 创建 member 用户测 403
  let memberId = null;
  r = await req("POST", "/api/users", { body: { username: "smoke_member", password: "member123" } });
  if (r.status === 200) {
    const list = await req("GET", "/api/users");
    const m = list.data?.find((u) => u.username === "smoke_member");
    memberId = m?.id;
    // 切到 member 登录
    await login("smoke_member", "member123");
    const r1 = await req("GET", "/api/settings");
    const r2 = await req("GET", "/api/users");
    const r3 = await req("PUT", "/api/pricing", { body: { id: 1, unit_price: 1 } });
    const r4 = await req("POST", "/api/settings/test", { body: { group: "deepseek" } });
    check("member 访问 settings → 403", r1.status === 403, `HTTP ${r1.status}`);
    check("member 访问 users → 403", r2.status === 403, `HTTP ${r2.status}`);
    check("member 改 pricing → 403", r3.status === 403, `HTTP ${r3.status}`);
    check("member 测 settings/test → 403", r4.status === 403, `HTTP ${r4.status}`);
    // 切回 admin
    await login(ADMIN.username, ADMIN.password);
  } else {
    check("创建 member 用户", false, `HTTP ${r.status} ${r.data?.error}`);
  }
  // 清理 member
  if (memberId) {
    r = await req("DELETE", "/api/users", { body: { id: memberId } });
    check("清理 member 用户", r.status === 200, `HTTP ${r.status}`);
  }

  // ── 汇总 ──────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log(`  通过 ${pass} ｜ 失败 ${fail} ｜ 共 ${pass + fail}`);
  console.log("════════════════════════════════════════");
  if (fail > 0) {
    console.log("\n失败明细：");
    results.filter((x) => x.includes("❌")).forEach((x) => console.log(x));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("脚本异常：", e); process.exit(2); });
