import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { generateSellingPoints, buildSellingCodexInstruction } from "@/lib/llm";
import { checkCompliance } from "@/lib/compliance";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const product = String(body.product ?? "").trim();
  if (!product) return NextResponse.json({ error: "缺商品信息" }, { status: 400 });
  if (product.length > 500) return NextResponse.json({ error: "商品信息过长（≤500 字）" }, { status: 400 });

  const engine = String(body.engine ?? "deepseek");
  const input = {
    product,
    framework: String(body.framework ?? "all"),
    platform: body.platform ? String(body.platform) : undefined,
    audience: body.audience ? String(body.audience).trim() : undefined,
    hasExistingPoints: body.sellingPoints ? String(body.sellingPoints).trim() : undefined,
  };

  // Codex 半自动通道：返回可粘贴指令，由用户在 Codex/ChatGPT 网页执行后粘回结果
  if (engine === "codex") {
    const instruction = buildSellingCodexInstruction(input);
    return NextResponse.json({ mode: "codex", instruction });
  }

  const result = await generateSellingPoints(input);

  // 对全部输出文案做广告法合规检查
  const fullText = [
    result.usp,
    ...result.fabe.map((r) => `${r.feature}${r.advantage}${r.benefit}${r.evidence}`),
    result.painPointHook,
    result.cta,
    ...Object.values(result.platforms),
  ].join("\n");
  const compliance = checkCompliance(fullText);

  return NextResponse.json({ mode: "deepseek", ...result, compliance });
}
