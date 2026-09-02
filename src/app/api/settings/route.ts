import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { allSettings, setSetting } from "@/lib/db";

const MASK_KEYS = ["deepseek_key", "qwen_key", "wanxiang_key", "jimeng_key", "lovart_ak", "lovart_sk", "kling_ak", "kling_sk", "vidu_key"];

function mask(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return "********";
  return v.slice(0, 4) + "****" + v.slice(-4);
}

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "仅管理员" }, { status: 403 });
  const s = allSettings();
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) masked[k] = MASK_KEYS.includes(k) ? mask(v) : v;
  return NextResponse.json({ settings: masked, hasValue: Object.fromEntries(MASK_KEYS.map((k) => [k, !!s[k]])) });
}

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "仅管理员" }, { status: 403 });
  const body = await req.json();
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== "string") continue;
    // 掩码值不覆盖原 key
    if (MASK_KEYS.includes(k) && v.includes("****")) continue;
    setSetting(k, v);
  }
  return NextResponse.json({ ok: true });
}
