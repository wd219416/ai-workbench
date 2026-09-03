import path from "node:path";
import fs from "node:fs";
import { all, get, run, getSetting, uploadDir } from "./db";
import { submitVideo, pollVideo } from "./engines/video";
import { pollImage } from "./engines/image";
import { persistFiles } from "./persist";

/**
 * 全局任务轮询兜底（修复 P1-1）：
 * 之前任务 processing→done/failed 只靠前端页面调 GET /api/tasks/[id] 触发轮询，
 * 前端一关页面/切走，任务就永久卡在 processing（引擎侧早生成了，图 URL 拿不回来落库）。
 * 这里由调度器每轮兜底：扫描所有 processing 任务逐个 poll，把终态收口。
 *
 * 安全约束（对齐 clipforge「付费任务不重试」铁律）：
 * - 只「查询」不「重新提交」，poll 是幂等只读，不产生二次计费
 * - done / failed 才落库；error 视为网络抖动，保留 processing 留待下轮/前端重试，不误杀
 * - 超时兜底：processing 超过 2 小时判 error（引擎侧异常 / task_id 丢失）
 */
async function sweepTasks() {
  // 3a) 超时兜底
  run(
    "UPDATE tasks SET status='error', error='生成超时（引擎侧无响应超过 2 小时）', updated_at=datetime('now','localtime') WHERE status='processing' AND updated_at <= datetime('now','localtime','-2 hours')"
  );

  // 3b) 轮询收口
  const processing = all<{ id: number; kind: string; engine: string; engine_task_id: string; input: string; created_by: number | null }>(
    "SELECT id,kind,engine,engine_task_id,input,created_by FROM tasks WHERE status='processing' AND engine_task_id IS NOT NULL"
  );
  for (const t of processing) {
    try {
      const input = { ...JSON.parse(t.input || "{}"), engine: t.engine };
      const polled = t.kind === "image"
        ? await pollImage(t.engine, t.engine_task_id)
        : await pollVideo(t.engine, t.engine_task_id, !!input.isI2V);
      if (polled.status === "processing") continue;
      if (polled.status === "error") continue; // 网络抖动不误杀
      let files = (polled as { images?: string[]; videos?: string[] }).images ?? (polled as { videos?: string[] }).videos ?? [];
      if (polled.status === "done" && files.length) {
        files = await persistFiles(files, t.kind, input, t.created_by ?? 1);
      }
      run(
        "UPDATE tasks SET status=?, output=?, error=?, updated_at=datetime('now','localtime') WHERE id=?",
        polled.status, JSON.stringify({ files }), polled.message ?? null, t.id
      );
    } catch {
      // 单任务异常不中断整体收口
    }
  }
}

/**
 * 发布计划调度器（进程内，60s 一跳）：
 * scheduled 且到点 → 用计划内容做提示词 + 素材首帧自动生成视频 → generating（挂 task_id）
 * generating → 跟任务状态：done→ready（待发布），failed→failed
 */
async function tick() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;

  // 0) 全局任务轮询兜底：先把卡在 processing 的任务收口
  await sweepTasks().catch(() => {});

  // 1) 到点计划 → 生成视频
  const due = all<{ id: number; asset_id: number | null; content: string; created_by?: number }>(
    "SELECT * FROM publish_plans WHERE status='scheduled' AND scheduled_at<=?", nowStr
  );
  for (const p of due) {
    try {
      let imageB64: string | undefined;
      if (p.asset_id) {
        const a = get<{ file_path: string }>("SELECT file_path FROM assets WHERE id=?", p.asset_id);
        if (a?.file_path) {
          const fp = path.join(uploadDir(), a.file_path);
          if (fs.existsSync(fp)) imageB64 = fs.readFileSync(fp).toString("base64");
        }
      }
      const engine = getSetting("default_video_engine") || "kling";
      const reply = await submitVideo(engine, { prompt: p.content, imageUrl: imageB64, duration: 5, ratio: "9:16" });
      if (reply.status === "submitted") {
        const r = run(
          "INSERT INTO tasks(kind,engine,engine_task_id,status,input,output,error,created_by) VALUES(?,?,?,?,?,?,?,?)",
          "video", engine, reply.engineTaskId ?? null, "processing",
          JSON.stringify({ prompt: p.content, assetId: p.asset_id, isI2V: !!imageB64, planId: p.id }), "{}", null, 1
        );
        run("UPDATE publish_plans SET status='generating', task_id=? WHERE id=?", Number(r.lastInsertRowid), p.id);
      } else {
        run("UPDATE publish_plans SET status='failed' WHERE id=?", p.id);
      }
    } catch {
      run("UPDATE publish_plans SET status='failed' WHERE id=?", p.id);
    }
  }

  // 2) 生成中的计划 → 跟任务终态
  const gen = all<{ id: number; task_id: number }>("SELECT id,task_id FROM publish_plans WHERE status='generating' AND task_id IS NOT NULL");
  for (const p of gen) {
    const t = get<{ status: string }>("SELECT status FROM tasks WHERE id=?", p.task_id);
    if (t?.status === "done") run("UPDATE publish_plans SET status='ready' WHERE id=?", p.id);
    else if (t?.status === "failed" || t?.status === "error") run("UPDATE publish_plans SET status='failed' WHERE id=?", p.id);
  }
}

export function startScheduler() {
  const g = globalThis as unknown as { __wb_sched?: NodeJS.Timeout };
  if (g.__wb_sched) return;
  tick().catch(() => {});
  g.__wb_sched = setInterval(() => tick().catch(() => {}), 60_000);
}
