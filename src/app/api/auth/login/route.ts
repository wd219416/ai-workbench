import { NextResponse } from "next/server";
import { get, verifyPassword } from "@/lib/db";
import { createToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { username, password } = await req.json();
  const u = get<{ id: number; password_hash: string; role: string }>(
    "SELECT id,password_hash,role FROM users WHERE username=?", String(username || "")
  );
  if (!u || !verifyPassword(String(password || ""), u.password_hash)) {
    return NextResponse.json({ error: "账号或密码不对" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, role: u.role, username });
  res.cookies.set("wb_session", createToken(u.id), {
    httpOnly: true, sameSite: "lax", maxAge: 30 * 86400, path: "/",
  });
  return res;
}
