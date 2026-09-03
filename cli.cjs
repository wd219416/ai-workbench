#!/usr/bin/env node
/**
 * ai-workbench CLI —— 把工作台生产能力（出图/视频/提示词/合规）封装成命令行薄封装
 * 零依赖，用 Node 内置 fetch，调用本地 http://localhost:3100 的 API。
 *
 * 用法：
 *   node cli.cjs engines                      列出出图/视频引擎
 *   node cli.cjs image "提示词" --engine lovart --n 2 --wait   出图并等待完成
 *   node cli.cjs video "提示词" --engine kling --duration 5 --ratio 9:16 --wait
 *   node cli.cjs prompt "大白话需求"           生成中英提示词
 *   node cli.cjs compliance "文案"             广告法合规检查
 *   node cli.cjs poll <taskId>                 查询任务状态
 *   node cli.cjs tasks [limit]                 列出最近任务
 *
 * 通用选项：
 *   --base http://localhost:3100   服务地址（或环境变量 WB_BASE）
 *   --user admin --pass admin123   登录账号
 *
 * 注意：中文提示词含空格时请用引号包裹。
 */

const BASE = process.env.WB_BASE || "http://localhost:3100";

// ---------- 参数解析 ----------
function parseArgv(argv) {
  const opts = { user: "admin", pass: "admin123", wait: false, engine: undefined, n: undefined, negative: undefined, duration: undefined, ratio: undefined, templateId: undefined, limit: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") opts.base = argv[++i];
    else if (a === "--user") opts.user = argv[++i];
    else if (a === "--pass") opts.pass = argv[++i];
    else if (a === "--engine") opts.engine = argv[++i];
    else if (a === "--n") opts.n = Number(argv[++i]);
    else if (a === "--negative") opts.negative = argv[++i];
    else if (a === "--duration") opts.duration = Number(argv[++i]);
    else if (a === "--ratio") opts.ratio = argv[++i];
    else if (a === "--template-id") opts.templateId = Number(argv[++i]);
    else if (a === "--wait") opts.wait = true;
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (!a.startsWith("--")) positional.push(a);
  }
  return { opts, positional };
}

// ---------- HTTP ----------
let cookie = "";

async function login(base, user, pass) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (res.status !== 200) throw new Error(`登录失败（HTTP ${res.status}）`);
  const sc = res.headers.get("set-cookie") || "";
  cookie = sc.split(";")[0] || "";
  if (!cookie) throw new Error("登录未返回 session cookie");
}

async function api(base, path, { method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers["Cookie"] = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (res.status === 401) throw new Error("未登录或会话过期，请检查账号");
  return { status: res.status, json };
}

// ---------- 命令实现 ----------
async function cmdEngines(base) {
  const { json } = await api(base, "/api/meta");
  console.log("== 出图引擎 ==");
  for (const e of json.imageEngines || []) console.log(`  ${e.code.padEnd(10)} ${e.name}  (${e.keyHint})`);
  console.log("== 视频引擎 ==");
  for (const e of json.videoEngines || []) console.log(`  ${e.code.padEnd(10)} ${e.name}  (${e.keyHint})`);
}

async function cmdImage(base, opts, positional) {
  const prompt = positional.join(" ");
  if (!prompt) throw new Error("缺提示词：node cli.cjs image \"提示词\"");
  const engine = opts.engine || "lovart";
  const n = opts.n || 1;

  const makeBody = () => {
    const body = { engine, prompt };
    if (opts.n) body.n = opts.n;
    if (opts.negative) body.negative = opts.negative;
    if (opts.ratio) { const [w, h] = opts.ratio.split(":").map(Number); if (w && h) { body.width = w * 64; body.height = h * 64; } }
    return body;
  };

  // LOVART 走 /chat 对话接口，一次 thread 只出 1 张；n>1 时拆成多次提交
  if (engine === "lovart" && n > 1) {
    console.log(`LOVART 单次只出 1 张，拆成 ${n} 次提交：`);
    const taskIds = [];
    for (let i = 0; i < n; i++) {
      const { status, json } = await api(base, "/api/image/generate", { method: "POST", body: makeBody() });
      if (status !== 200) throw new Error(`出图失败：${json.error || status}`);
      if (json.status === "done") { printFiles(json.files, base); continue; }
      taskIds.push(json.taskId);
      console.log(`  [${i + 1}/${n}] 已提交任务 #${json.taskId}`);
    }
    if (opts.wait && taskIds.length) await Promise.all(taskIds.map((id) => waitTask(base, id)));
    return;
  }

  const { status, json } = await api(base, "/api/image/generate", { method: "POST", body: makeBody() });
  if (status !== 200) throw new Error(`出图失败：${json.error || status}`);
  if (json.status === "done") { printFiles(json.files, base); return; }
  console.log(`已提交任务 #${json.taskId}（${json.status}）`);
  if (opts.wait) await waitTask(base, json.taskId);
}

async function cmdVideo(base, opts, positional) {
  const prompt = positional.join(" ");
  if (!prompt) throw new Error("缺提示词：node cli.cjs video \"提示词\"");
  const engine = opts.engine || "kling";
  const body = { engine, prompt };
  if (opts.duration) body.duration = opts.duration;
  if (opts.ratio) body.ratio = opts.ratio;
  const { status, json } = await api(base, "/api/video/generate", { method: "POST", body });
  if (status !== 200) throw new Error(`视频生成失败：${json.error || status}`);
  if (json.status === "done") { printFiles(json.files, base); return; }
  console.log(`已提交任务 #${json.taskId}（${json.status}）`);
  if (opts.wait) await waitTask(base, json.taskId);
}

async function cmdPrompt(base, opts, positional) {
  const requirement = positional.join(" ");
  if (!requirement) throw new Error("缺需求：node cli.cjs prompt \"需求\"");
  const body = { form: { requirement } };
  if (opts.templateId) body.templateId = opts.templateId;
  const { status, json } = await api(base, "/api/prompt/generate", { method: "POST", body });
  if (status !== 200) throw new Error(`提示词生成失败：${json.error || status}`);
  console.log(`[中文] ${json.cn || json.prompt_cn || ""}`);
  console.log(`[英文] ${json.en || json.prompt_en || ""}`);
  if (json.negative) console.log(`[负面] ${json.negative}`);
  if (json.compliance && json.compliance.hits?.length) {
    console.log(`[合规⚠️] 命中 ${json.compliance.hits.length} 处：${json.compliance.hits.map((h) => h.word).join("、")}`);
  } else {
    console.log("[合规] 通过 ✅");
  }
}

async function cmdCompliance(base, positional) {
  const text = positional.join(" ");
  if (!text) throw new Error("缺文案：node cli.cjs compliance \"文案\"");
  const { status, json } = await api(base, "/api/compliance/check", { method: "POST", body: { text } });
  if (status !== 200) throw new Error(`合规检查失败：${json.error || status}`);
  const hits = json.hits || [];
  if (!hits.length) { console.log("合规 ✅ 未命中违禁词"); return; }
  console.log(`⚠️ 命中 ${hits.length} 处：`);
  for (const h of hits) console.log(`  [${h.category || ""}] ${h.word}${h.suggestion ? ` → 建议：${h.suggestion}` : ""}`);
}

async function cmdPoll(base, positional) {
  const id = Number(positional[0]);
  if (!id) throw new Error("缺任务 id：node cli.cjs poll <taskId>");
  await showTask(base, id);
}

async function cmdTasks(base, positional) {
  const limit = Number(positional[0]) || 10;
  const { json } = await api(base, `/api/tasks?limit=${limit}`);
  const list = Array.isArray(json) ? json : json.tasks || [];
  if (!list.length) { console.log("暂无任务"); return; }
  for (const t of list) {
    const input = safeParse(t.input);
    const title = input?.promptCn || input?.prompt || "";
    console.log(`#${String(t.id).padStart(3)} ${(t.status || "").padEnd(10)} ${t.kind?.padEnd(5)} ${t.engine?.padEnd(8)} ${String(title).slice(0, 40)}`);
  }
}

// ---------- 辅助 ----------
function safeParse(s) { try { return JSON.parse(s || "{}"); } catch { return {}; } }

function printFiles(files, base) {
  for (const f of files || []) {
    const url = f.startsWith("/") ? `${base}${f}` : `${base}/api/file/${f}`;
    console.log(`  产出：${url}`);
  }
}

async function showTask(base, id) {
  const { status, json } = await api(base, `/api/tasks/${id}`);
  if (status === 404) throw new Error(`任务 #${id} 不存在`);
  const st = json.status || "unknown";
  console.log(`任务 #${id} 状态：${st}`);
  if (json.error) console.log(`  错误：${json.error}`);
  if (st === "done") {
    const out = safeParse(json.output);
    printFiles(out.files || json.files, base);
  }
  return json;
}

async function waitTask(base, id, { timeoutMs = 10 * 60 * 1000, intervalMs = 8000 } = {}) {
  const start = Date.now();
  process.stdout.write("等待完成");
  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs);
    const j = await showTask(base, id);
    process.stdout.write(".");
    if (j.status === "done" || j.status === "failed" || j.status === "error") {
      console.log("");
      return j;
    }
  }
  console.log("\n⚠️ 超时，任务仍在处理中，稍后可用 node cli.cjs poll " + id + " 查询");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- 主入口 ----------
const HELP = `ai-workbench CLI
用法：node cli.cjs <command> [args] [options]

命令：
  engines                        列出出图/视频引擎
  image <提示词> [--engine] [--n] [--negative] [--ratio W:H] [--wait]   出图
  video <提示词> [--engine] [--duration] [--ratio] [--wait]              出视频
  prompt <需求> [--template-id N]  生成中英提示词
  compliance <文案>               广告法合规检查
  poll <taskId>                   查询任务状态
  tasks [limit]                   列出最近任务

通用选项：--base --user --pass（默认 admin/admin123）
`;

async function main() {
  const { opts, positional } = parseArgv(process.argv.slice(2));
  if (opts.help || !positional.length) { console.log(HELP); return; }
  const base = opts.base || BASE;
  const cmd = positional[0];
  const args = positional.slice(1);

  await login(base, opts.user, opts.pass);

  switch (cmd) {
    case "engines": await cmdEngines(base); break;
    case "image": await cmdImage(base, opts, args); break;
    case "video": await cmdVideo(base, opts, args); break;
    case "prompt": await cmdPrompt(base, opts, args); break;
    case "compliance": await cmdCompliance(base, args); break;
    case "poll": await cmdPoll(base, args); break;
    case "tasks": await cmdTasks(base, args); break;
    default: console.error(`未知命令：${cmd}\n${HELP}`); process.exit(1);
  }
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
