import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { currentUser } from "@/lib/auth";
import { submitVideo } from "@/lib/engines/video";
import { get, run, uploadDir } from "@/lib/db";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const { engine, prompt, assetId, duration, ratio, businessLineId, promptCn } = body;
  if (!prompt) return NextResponse.json({ error: "缺提示词" }, { status: 400 });

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
