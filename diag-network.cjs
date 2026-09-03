// 出图链路自检：检测代理端口 + TUN 状态 + LOVART/海外服务连通
// 用法：node diag-network.cjs
// 作用：出图失败时先跑它，一眼看清是「没代理/端口变了/没开TUN」哪一环的问题
const net = require("node:net");

const PROXY_PORTS = [7890, 7897, 7891, 10809, 1080, 10808, 58071, 33210, 20171];
const TARGETS = [
  ["LOVART", "https://lgw.lovart.ai/v1/openapi/mode/query"],
  ["Google", "https://www.google.com/generate_204"],
  ["可灵", "https://api-beijing.klingai.com"],
  ["GitHub", "https://api.github.com"],
];

function tcpProbe(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: 1500 });
    let done = false;
    const finish = (v) => { if (!done) { done = true; s.destroy(); resolve(v); } };
    s.on("connect", () => finish(true));
    s.on("timeout", () => finish(false));
    s.on("error", () => finish(false));
  });
}

async function httpProbe(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(6000) });
    return { ok: true, status: res.status, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, err: (e.cause?.code || e.name || "error"), ms: Date.now() - start };
  }
}

(async () => {
  console.log("════════════════════════════════════════");
  console.log("  出图链路自检  " + new Date().toLocaleString("zh-CN"));
  console.log("════════════════════════════════════════");

  // 1. 代理端口探测
  console.log("\n[1/3] 本地代理端口探测");
  let livePort = null;
  for (const p of PROXY_PORTS) {
    const alive = await tcpProbe(p);
    if (alive && !livePort) livePort = p;
    console.log(`    ${String(p).padEnd(6)} ${alive ? "✅ 存活" : "· 无响应"}`);
  }
  console.log(livePort
    ? `    → 发现代理端口：${livePort}`
    : "    → ⚠️ 未发现任何代理端口（代理软件可能没开）");

  // 2. 海外服务直连（判断 TUN 是否生效）
  console.log("\n[2/3] 海外服务直连（判断 TUN/全局模式是否生效）");
  let tunOk = 0;
  for (const [name, url] of TARGETS) {
    const r = await httpProbe(url);
    if (r.ok) tunOk++;
    console.log(`    ${name.padEnd(8)} ${r.ok ? `✅ HTTP ${r.status} (${r.ms}ms)` : `❌ ${r.err} (${r.ms}ms)`}`);
  }

  // 3. 结论
  console.log("\n[3/3] 诊断结论");
  if (tunOk >= 3) {
    console.log("    ✅ TUN 模式已生效，出图链路可用，直接出图即可。");
  } else if (tunOk >= 1) {
    console.log("    ⚠️ 部分海外服务可达（可能节点不稳），建议确认 TUN 模式与节点。");
  } else {
    console.log("    ❌ node 无法直连任何海外服务 → TUN 模式未开启。");
    if (livePort) {
      console.log(`    → 已有 HTTP 代理端口 ${livePort}，但 Next.js 服务端 fetch 不认 HTTP_PROXY 环境变量。`);
      console.log("    → 解决：打开 Clash Verge 的「TUN 模式 / 服务模式」并安装 Service Mode，让 node 流量也走代理。");
    } else {
      console.log("    → 解决：先打开代理软件（Clash Verge），再开启 TUN 模式。");
    }
  }
  console.log("\n════════════════════════════════════════");
})().catch((e) => { console.error("自检脚本异常:", e); process.exit(1); });
