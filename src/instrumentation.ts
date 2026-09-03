/**
 * Next.js 服务启动钩子（instrumentation）：
 * 解决 P2-9「断点续跑」——之前 startScheduler() 是懒启动（依赖 meta/image/video/plans 请求触发），
 * 服务重启后若无人访问，processing 任务就没人轮询收口、永久卡死。
 * 这里在 Node 服务启动时主动拉起调度器，让重启后卡在 processing 的任务自动恢复轮询。
 *
 * 注意：`next build` 阶段（phase-production-build）不启动，避免静态分析阶段访问数据库。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // edge runtime 不支持 node:sqlite
  if (process.env.NEXT_PHASE === "phase-production-build") return; // build 阶段不碰 DB

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
