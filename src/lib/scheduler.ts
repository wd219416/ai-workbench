import path from "node:path";
import fs from "node:fs";
import { all, get, run, getSetting, uploadDir } from "./db";
import { submitVideo } from "./engines/video";

/**
 * 发布计划调度器（进程内，60s 一跳）：
 * scheduled 且到点 → 用计划内容做提示词 + 素材首帧自动生成视频 → generating（挂 task_id）
 * generating → 跟任务状态：done→ready（待发布），failed→failed
 */
async function tick() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;

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
