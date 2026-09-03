import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { generatePrompt, buildChatGPTInstruction, PromptForm } from "@/lib/llm";
import { get } from "@/lib/db";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const form = body.form as PromptForm;
  if (!form || !form.requirement) return NextResponse.json({ error: "缺少 form.requirement" }, { status: 400 });
  const tpl = body.templateId
    ? get<{ template: string; template_en: string; negative: string }>(
        "SELECT template,template_en,negative FROM prompt_templates WHERE id=?", body.templateId)
    : undefined;
  const result = await generatePrompt(form, tpl ?? undefined);
  const semiAuto = buildChatGPTInstruction(form, tpl?.template);
  return NextResponse.json({ ...result, semiAuto });
}
