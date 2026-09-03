import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { reverseVideoFromFile, reverseVideoFromUrl } from "@/lib/video-reverse";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const fd = await req.formData();
  const file = fd.get("video") as File | null;
  const url = String(fd.get("url") || "").trim();
  const platform = String(fd.get("platform") || "").trim();

  if (file && file.size > 0) {
    return NextResponse.json(await reverseVideoFromFile(file, platform));
  }
  if (url) {
    return NextResponse.json(await reverseVideoFromUrl(url, platform));
  }
  return NextResponse.json({ ok: false, source: "error", note: "请上传本地视频或填写视频直链" }, { status: 400 });
}
