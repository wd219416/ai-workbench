import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { pollImage } from "@/lib/engines/image";
import { pollVideo } from "@/lib/engines/video";
import { persistFiles } from "@/lib/persist";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const t = get<{ id: number; kind: string; engine: string; engine_task_id: string; status: string; input: string; output: string; error: string }>(
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
