import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { all } from "@/lib/db";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  let sql = "SELECT id,kind,engine,status,input,output,error,created_at FROM tasks";
  const args: unknown[] = [];
  if (kind) { sql += " WHERE kind=?"; args.push(kind); }
  sql += " ORDER BY id DESC LIMIT 30";
  return NextResponse.json(all(sql, ...args));
}
