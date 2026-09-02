import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { startScheduler } from "@/lib/scheduler";

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  startScheduler();
  return NextResponse.json(all(
    `SELECT p.*, a.file_path AS asset_path, t.status AS task_status, t.output AS task_output
     FROM publish_plans p
     LEFT JOIN assets a ON a.id = p.asset_id
     LEFT JOIN tasks t ON t.id = p.task_id
     ORDER BY p.id DESC LIMIT 50`
  ));
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const { assetId, platform, title, content, scheduledAt } = body;
  if (!platform || !content || !scheduledAt) return NextResponse.json({ error: "缺平台/内容/定时" }, { status: 400 });
  const r = run(
    "INSERT INTO publish_plans(asset_id,platform,title,content,scheduled_at,status) VALUES(?,?,?,?,?,?)",
    assetId || null, String(platform), String(title || ""), String(content), String(scheduledAt), "scheduled"
  );
  startScheduler();
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

/** 改状态/改时间：draft|scheduled|cancelled，或重新定时 */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, status, scheduledAt } = await req.json();
  const p = get<{ id: number }>("SELECT id FROM publish_plans WHERE id=?", Number(id));
  if (!p) return NextResponse.json({ error: "计划不存在" }, { status: 404 });
  if (status) run("UPDATE publish_plans SET status=? WHERE id=?", String(status), Number(id));
  if (scheduledAt) run("UPDATE publish_plans SET scheduled_at=?, status='scheduled' WHERE id=?", String(scheduledAt), Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await req.json();
  run("DELETE FROM publish_plans WHERE id=?", Number(id));
  return NextResponse.json({ ok: true });
}
