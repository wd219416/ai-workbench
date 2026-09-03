import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getMeta } from "@/lib/db";
import { IMAGE_ENGINES, VIDEO_ENGINES } from "@/lib/engines/registry";
import { startScheduler } from "@/lib/scheduler";

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  startScheduler(); // 页面一打开就确保调度器在跑
  return NextResponse.json({ ...getMeta(), imageEngines: IMAGE_ENGINES, videoEngines: VIDEO_ENGINES });
}
