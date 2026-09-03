import path from "node:path";

/**
 * 数据目录（workbench.db / fieldkey.bin / secret.txt / uploads 所在）。
 *
 * 关键：Next `output: "standalone"` 模式下，standalone 的 server.js 会执行
 * `process.chdir(__dirname)` 把 cwd 切到 `.next/standalone/`，导致 `process.cwd()`
 * 指向错误位置、读写到 standalone 内的 trace 快照（数据分裂、加密密钥错位）。
 *
 * 因此 standalone 启动脚本会注入 `WORKBENCH_DATA_DIR`（项目根 data 绝对路径），
 * 本函数优先读取它；其余场景（next dev / next start）回退到 cwd/data。
 */
export function dataDir(): string {
  return process.env.WORKBENCH_DATA_DIR || path.join(process.cwd(), "data");
}
