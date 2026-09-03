/** 部署后补丁：给 standalone 的 server.js 注入 WORKBENCH_DATA_DIR 兜底。
 *  背景：Next standalone server.js 会 process.chdir(__dirname)，
 *  若启动方未设 WORKBENCH_DATA_DIR，process.cwd()/data 会落到部署目录/data（垃圾库）。
 *  本补丁把默认值写死为 <部署目录>/../data（即项目根 data/）。
 *  用法：node patch-server.cjs [目录名]  （在项目根执行，默认作用于 runtime/server.js）
 *  目录名默认 runtime（2026-09-03 弃用 server：并行会话残留的 rmSync('server') 重放任务会删它） */
const fs = require("node:fs");
const path = require("node:path");

const dir = process.argv[2] || "runtime";
const target = path.join(__dirname, dir, "server.js");
const MARK = "WORKBENCH_DATA_DIR";
const INJECT =
  "// ★ 数据目录兜底：standalone 部署在 <项目根>/server/，真实数据在 <项目根>/data/。\n" +
  "//   无论以何种方式启动（bat/env 缺失/被外部重启），都指向真实数据，防止读到 server/data 垃圾库。\n" +
  "if (!process.env.WORKBENCH_DATA_DIR) process.env.WORKBENCH_DATA_DIR = path.join(__dirname, '..', 'data')";

if (!fs.existsSync(target)) {
  console.error(`[patch-server] ${dir}/server.js 不存在，先运行部署`);
  process.exit(1);
}
let s = fs.readFileSync(target, "utf8");
if (s.includes(MARK)) {
  console.log("[patch-server] 已含补丁，跳过");
  process.exit(0);
}
const anchor = "process.chdir(__dirname)";
if (!s.includes(anchor)) {
  console.error("[patch-server] 找不到锚点 process.chdir(__dirname)，Next 版本变化需人工适配");
  process.exit(1);
}
s = s.replace(anchor, anchor + "\n" + INJECT);
fs.writeFileSync(target, s);
console.log(`[patch-server] 补丁已注入 ${dir}/server.js`);
