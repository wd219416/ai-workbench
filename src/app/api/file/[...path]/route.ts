import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { uploadDir } from "@/lib/db";
import path from "node:path";
import fs from "node:fs";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", mp4: "video/mp4", webm: "video/webm",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { path: segs } = await ctx.params;
  const name = segs.join("/").replace(/\.\./g, "");
  const full = path.join(uploadDir(), name);
  if (!full.startsWith(uploadDir()) || !fs.existsSync(full)) {
    return NextResponse.json({ error: "不存在" }, { status: 404 });
  }
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return new NextResponse(new Uint8Array(fs.readFileSync(full)), {
    headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
