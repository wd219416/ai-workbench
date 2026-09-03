import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { generateClipforge } from "@/lib/llm";
import { checkCompliance } from "@/lib/compliance";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const product = String(body.product ?? "").trim();
  if (!product) return NextResponse.json({ error: "缺商品信息" }, { status: 400 });
  if (product.length > 500) return NextResponse.json({ error: "商品信息过长（≤500 字）" }, { status: 400 });

  const platform = String(body.platform ?? "抖音");
  const scriptType = String(body.scriptType ?? "场景");
  const duration = Math.min(16, Math.max(3, Number(body.duration) || 8));

  const result = await generateClipforge({
    product,
    sellingPoints: body.sellingPoints ? String(body.sellingPoints) : undefined,
    platform,
    scriptType,
    duration,
  });

  // 对脚本口播文案做合规检查
  const compliance = checkCompliance(result.script);
  return NextResponse.json({ ...result, compliance });
}
