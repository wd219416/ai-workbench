import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { all, run, hashPassword, verifyPassword, get } from "@/lib/db";

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "仅管理员" }, { status: 403 });
  return NextResponse.json(all("SELECT id,username,role,created_at FROM users ORDER BY id"));
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "仅管理员" }, { status: 403 });
  const { username, password, role } = await req.json();
  if (!username || !password) return NextResponse.json({ error: "缺账号或密码" }, { status: 400 });
  const exist = get("SELECT id FROM users WHERE username=?", String(username));
  if (exist) return NextResponse.json({ error: "账号已存在" }, { status: 400 });
  run("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)", String(username), hashPassword(String(password)), role === "admin" ? "admin" : "member");
  return NextResponse.json({ ok: true });
}

/** 改密码：本人改需验旧密码；管理员可重置他人 */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, oldPassword, newPassword } = await req.json();
  if (!newPassword || String(newPassword).length < 6) return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
  const targetId = Number(id) || u.id;
  if (targetId !== u.id && u.role !== "admin") return NextResponse.json({ error: "只能改自己的密码" }, { status: 403 });
  const target = get<{ id: number; password_hash: string }>("SELECT id,password_hash FROM users WHERE id=?", targetId);
  if (!target) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  if (targetId === u.id && !verifyPassword(String(oldPassword || ""), target.password_hash)) {
    return NextResponse.json({ error: "旧密码不对" }, { status: 400 });
  }
  run("UPDATE users SET password_hash=? WHERE id=?", hashPassword(String(newPassword)), targetId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "仅管理员" }, { status: 403 });
  const { id } = await req.json();
  if (Number(id) === u.id) return NextResponse.json({ error: "不能删自己" }, { status: 400 });
  run("DELETE FROM users WHERE id=?", Number(id));
  return NextResponse.json({ ok: true });
}
