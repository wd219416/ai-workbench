import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { currentUser } from "@/lib/auth";
import { submitImage } from "@/lib/engines/image";
import { persistFiles } from "@/lib/persist";
import { get, run, uploadDir } from "@/lib/db";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const { engine, prompt, negative, width, height, n, refAssetId, businessLineId, channelId, contentTypeId, promptCn } = body;
  if (!prompt) return NextResponse.json({ error: "缺提示词" }, { status: 400 });

  // 实景合成/图生图：参考图素材 id -> 服务器本地文件路径
  let refImagePath: string | undefined;
  if (refAssetId) {
    const a = get<{ file_path: string }>("SELECT file_path FROM assets WHERE id=?", Number(refAssetId));
    if (a?.file_path) {
      const p = path.join(uploadDir(), a.file_path);
      if (fs.existsSync(p)) refImagePath = p;
    }
  }

  const reply = await submitImage(engine, { prompt, negative, width, height, n: Number(n) || 1, refImagePath });
  const input = { prompt, negative, width, height, n, refAssetId, businessLineId, channelId, contentTypeId, promptCn };

  // 同步引擎（即梦/Seedream）直接出图：立刻落盘入素材库，任务直接 done
  if (reply.status === "done" && reply.images?.length) {
    const files = await persistFiles(reply.images, "image", { ...input, engine }, u.id);
    const r = run(
      "INSERT INTO tasks(kind,engine,engine_task_id,status,input,output,error,created_by) VALUES(?,?,?,?,?,?,?,?)",
      "image", engine, null, "done", JSON.stringify(input), JSON.stringify({ files }), null, u.id
    );
    return NextResponse.json({ taskId: Number(r.lastInsertRowid), ...reply, files });
  }

  const status = reply.status === "submitted" ? "processing" : reply.status;
  const r = run(
    "INSERT INTO tasks(kind,engine,engine_task_id,status,input,output,error,created_by) VALUES(?,?,?,?,?,?,?,?)",
    "image", engine, reply.engineTaskId ?? null, status,
    JSON.stringify(input),
    "{}", reply.message ?? null, u.id
  );
  return NextResponse.json({ taskId: Number(r.lastInsertRowid), ...reply });
}
