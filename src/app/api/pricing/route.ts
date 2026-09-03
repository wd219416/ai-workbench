import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { effectivePrice, type Pricing } from "@/lib/pricing";

// 注意：本文件只导出 HTTP 方法（GET/PUT）。Pricing 接口与 effectivePrice 函数
// 已抽到 src/lib/pricing.ts，避免触发 Next.js 路由类型校验（路由文件不允许导出其他名称）。

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const url = new URL(req.url);
  const engine = url.searchParams.get("engine");
  const model = url.searchParams.get("model");
  if (engine && model) {
    const p = get<Pricing>("SELECT * FROM engine_pricing WHERE engine=? AND model=?", engine, model);
    if (!p) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, pricing: p, ...effectivePrice(p) });
  }
  return NextResponse.json(all<Pricing>("SELECT * FROM engine_pricing ORDER BY engine, model"));
}

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "仅管理员" }, { status: 403 });
  const { id, unit_price, discount_pct, discount_until, note } = await req.json();
  if (!id) return NextResponse.json({ error: "缺 id" }, { status: 400 });
  run(
    "UPDATE engine_pricing SET unit_price=?, discount_pct=?, discount_until=?, note=?, updated_at=datetime('now','localtime') WHERE id=?",
    Number(unit_price), Number(discount_pct) || 0, String(discount_until || ""), String(note || ""), Number(id)
  );
  return NextResponse.json({ ok: true });
}
