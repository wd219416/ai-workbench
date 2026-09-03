import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { reversePrompt } from "@/lib/llm";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const fd = await req.formData();
  const file = fd.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "缺图片" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const result = await reversePrompt(buf.toString("base64"), file.type || "image/png");
  return NextResponse.json(result);
}
