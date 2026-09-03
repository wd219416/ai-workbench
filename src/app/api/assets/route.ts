import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { all, run, get } from "@/lib/db";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const bl = url.searchParams.get("bl");
  let sql = "SELECT * FROM assets WHERE 1=1";
  const args: unknown[] = [];
  if (type) { sql += " AND type=?"; args.push(type); }
  if (bl) { sql += " AND business_line_id=?"; args.push(Number(bl)); }
  sql += " ORDER BY id DESC LIMIT 200";
  return NextResponse.json(all(sql, ...args));
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await req.json();
  const a = get<{ created_by: number }>("SELECT created_by FROM assets WHERE id=?", Number(id));
  if (!a) return NextResponse.json({ error: "不存在" }, { status: 404 });
  if (u.role !== "admin" && a.created_by !== u.id) {
    return NextResponse.json({ error: "只能删自己的素材" }, { status: 403 });
  }
  run("DELETE FROM assets WHERE id=?", Number(id));
  return NextResponse.json({ ok: true });
}
