import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { currentUser } from "@/lib/auth";
import { submitImage } from "@/lib/engines/image";
import { persistFiles } from "@/lib/persist";
import { validateImage } from "@/lib/validate";
import { get, run, uploadDir } from "@/lib/db";
import { startScheduler } from "@/lib/scheduler";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  startScheduler(); // 确保后台任务轮询兜底在跑
  const body = await req.json();
  const { engine, refAssetId, refAssetIds, businessLineId, channelId, contentTypeId, promptCn, loraIds, ckpt, comfyLoras } = body;
  const v = validateImage(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const { prompt, negative, width, height, n } = v.cleaned!;

  // 参考图素材 id -> 服务器本地文件路径（产品保真：多角度，上限 4 张）
  // refAssetIds 数组优先；兼容旧 refAssetId 单图
  const refIds: number[] = Array.isArray(refAssetIds) && refAssetIds.length
    ? refAssetIds.map(Number).filter(Boolean).slice(0, 4)
    : refAssetId ? [Number(refAssetId)] : [];
  const refImagePaths: string[] = [];
  for (const id of refIds) {
    const a = get<{ file_path: string }>("SELECT file_path FROM assets WHERE id=?", id);
    if (a?.file_path) {
      const p = path.join(uploadDir(), a.file_path);
      if (fs.existsSync(p)) refImagePaths.push(p);
    }
  }
  const refImagePath = refImagePaths[0]; // 可灵/Liblib 等单图引擎取第一张

  // ComfyUI LoRA 清洗：数组 + name 非空 + weight 收敛到 [-2,2] + 上限 5 个
  const cl: { name: string; weight: number }[] = Array.isArray(comfyLoras)
    ? comfyLoras
        .map((x: any) => ({ name: String(x?.name || "").trim(), weight: Math.max(-2, Math.min(2, Number(x?.weight) || 1)) }))
        .filter((x) => x.name)
        .slice(0, 5)
    : [];
  const reply = await submitImage(engine, { prompt, negative, width, height, n, refImagePath, refImagePaths, loraIds, ckpt, comfyLoras: cl });
  const input = { prompt, negative, width, height, n, refAssetId, refAssetIds: refIds, loraIds, ckpt, comfyLoras: cl, businessLineId, channelId, contentTypeId, promptCn };

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
