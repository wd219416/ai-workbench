import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { currentUser } from "@/lib/auth";
import { submitVideo } from "@/lib/engines/video";
import { validateVideo } from "@/lib/validate";
import { get, run, uploadDir } from "@/lib/db";
import { startScheduler } from "@/lib/scheduler";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  startScheduler(); // 确保后台任务轮询兜底在跑
  const body = await req.json();
  const { engine, assetId, businessLineId, promptCn } = body;
  const v = validateVideo(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const { prompt, duration, ratio } = v.cleaned!;

  // 首帧图：素材 id -> 本地文件 -> base64（引擎服务器访问不到内网地址，必须随请求提交）
  let imageB64: string | undefined;
  if (assetId) {
    const a = get<{ file_path: string }>("SELECT file_path FROM assets WHERE id=?", Number(assetId));
    if (a?.file_path) {
      const p = path.join(uploadDir(), a.file_path);
      if (fs.existsSync(p)) imageB64 = fs.readFileSync(p).toString("base64");
    }
  }

  const reply = await submitVideo(engine, { prompt, imageUrl: imageB64, duration: Number(duration) || 5, ratio });
  const status = reply.status === "submitted" ? "processing" : reply.status;
  const r = run(
    "INSERT INTO tasks(kind,engine,engine_task_id,status,input,output,error,created_by) VALUES(?,?,?,?,?,?,?,?)",
    "video", engine, reply.engineTaskId ?? null, status,
    JSON.stringify({ prompt, assetId, duration, ratio, businessLineId, promptCn, isI2V: !!imageB64 }),
    "{}", reply.message ?? null, u.id
  );
  return NextResponse.json({ taskId: Number(r.lastInsertRowid), ...reply });
}
