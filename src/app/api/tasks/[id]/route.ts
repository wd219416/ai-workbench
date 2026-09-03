import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { get, run, uploadDir } from "@/lib/db";
import { pollImage } from "@/lib/engines/image";
import { pollVideo } from "@/lib/engines/video";
import { persistFiles } from "@/lib/persist";
import path from "node:path";
import fs from "node:fs";

function canModify(u: { id: number; role: string }, task: { created_by: number | null }) {
  return u.role === "admin" || task.created_by === u.id;
}

function fileNamesFromOutput(output: string): string[] {
  try {
    const out = JSON.parse(output || "{}");
    return ((out.files || []) as string[])
      .map((f) => f.replace(/^\/api\/file\//, ""))
      .filter((f) => f && !f.includes("/"));
  } catch { return []; }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const t = get<{ id: number; kind: string; engine: string; engine_task_id: string; status: string; input: string; output: string; error: string; created_by: number }>(
    "SELECT * FROM tasks WHERE id=?", Number(id)
  );
  if (!t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (t.status !== "processing" || !t.engine_task_id) {
    return NextResponse.json(t);
  }
  const input = { ...JSON.parse(t.input), engine: t.engine };
  const polled = t.kind === "image"
    ? await pollImage(t.engine, t.engine_task_id)
    : await pollVideo(t.engine, t.engine_task_id, !!input.isI2V);
  let files = (polled as { images?: string[]; videos?: string[] }).images ?? (polled as { videos?: string[] }).videos ?? [];
  if (polled.status === "done" && files.length) {
    files = await persistFiles(files, t.kind, input, u.id);
  }
  run("UPDATE tasks SET status=?, output=?, error=?, updated_at=datetime('now','localtime') WHERE id=?",
    polled.status, JSON.stringify({ files }), polled.message ?? null, t.id);
  return NextResponse.json({ ...t, status: polled.status, output: JSON.stringify({ files }), error: polled.message ?? null });
}

/** 重命名任务：更新 input.promptCn 并同步素材表 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  const t = get<{ id: number; input: string; output: string; created_by: number }>("SELECT id,input,output,created_by FROM tasks WHERE id=?", id);
  if (!t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (!canModify(u, t)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });

  const input = { ...JSON.parse(t.input || "{}"), promptCn: title };
  run("UPDATE tasks SET input=?, updated_at=datetime('now','localtime') WHERE id=?", JSON.stringify(input), id);

  // 同步更新关联素材的 prompt_cn
  for (const name of fileNamesFromOutput(t.output)) {
    run("UPDATE assets SET prompt_cn=? WHERE file_path=?", title, name);
  }

  return NextResponse.json({ ok: true, taskId: id, title });
}

/** 删除任务：删 tasks 记录 + 关联 assets + 物理文件 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  const t = get<{ id: number; output: string; created_by: number }>("SELECT id,output,created_by FROM tasks WHERE id=?", id);
  if (!t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (!canModify(u, t)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const names = fileNamesFromOutput(t.output);
  for (const name of names) {
    run("DELETE FROM assets WHERE file_path=?", name);
    const fp = path.join(uploadDir(), name);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* 忽略 */ }
  }
  run("DELETE FROM tasks WHERE id=?", id);
  return NextResponse.json({ ok: true, deletedId: id });
}
