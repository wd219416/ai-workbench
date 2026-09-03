import { getSetting } from "./db";

export interface PromptForm {
  businessLine: string;
  channel: string;
  contentType: string;
  product?: string;
  style?: string;
  sizeText?: string;
  requirement: string;
  kbContext?: string;
}

export interface PromptResult {
  cn: string;
  en: string;
  negative: string;
  source: "deepseek" | "local";
  note?: string;
}

const SYS = `你是资深电商视觉与广告工程提示词专家，服务两类业务：实木花盆电商（淘宝/抖店/拼多多/视频号/小红书）与广告工程（展厅全案、投标应标效果图、标识物设计生产安装）。
根据用户输入，输出可直接用于 AI 绘图平台（LOVART/可灵/通义万相/即梦）的提示词。
严格按以下 JSON 格式输出，不要输出其他内容：
{"cn":"中文提示词","en":"English prompt","negative":"负面提示词"}`;

async function deepseekChat(messages: { role: string; content: string }[], json = true): Promise<string> {
  const key = getSetting("deepseek_key");
  const base = getSetting("deepseek_base") || "https://api.deepseek.com";
  const model = getSetting("deepseek_model") || "deepseek-chat";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.7, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function fillTemplate(tpl: string, form: PromptForm, productEn: string): string {
  return tpl
    .replaceAll("{{product}}", form.product || form.requirement)
    .replaceAll("{{product_en}}", productEn || form.requirement)
    .replaceAll("{{requirement}}", form.requirement)
    .replaceAll("{{requirement_en}}", form.requirement)
    .replaceAll("{{hall_type}}", "企业")
    .replaceAll("{{hall_type_en}}", "corporate")
    .replaceAll("{{theme}}", form.style || "品牌文化")
    .replaceAll("{{theme_en}}", form.style || "brand culture")
    .replaceAll("{{sign_type}}", form.style || "不锈钢发光字")
    .replaceAll("{{sign_type_en}}", form.style || "stainless steel illuminated");
}

function localCompose(form: PromptForm, tpl?: { template: string; template_en: string; negative: string }): PromptResult {
  const productEn = form.product ? `solid wood planter (${form.product})` : "";
  let cn: string, en: string, negative: string;
  if (tpl) {
    cn = fillTemplate(tpl.template, form, productEn);
    en = fillTemplate(tpl.template_en, form, productEn);
    negative = tpl.negative;
  } else {
    cn = `${form.requirement}，${form.style || "写实风格"}，高清细节，专业质感`;
    en = `${form.requirement}, ${form.style || "photorealistic style"}, high detail, professional quality, 8k`;
    negative = "模糊, 变形, 水印, 文字, 低质量";
  }
  if (form.sizeText) { cn += `，画幅${form.sizeText}`; en += `, aspect ${form.sizeText}`; }
  return { cn, en, negative, source: "local", note: "未配置 DeepSeek key，已用本地模板生成。到 设置 页填入 key 后由大模型生成。" };
}

export async function generatePrompt(
  form: PromptForm,
  tpl?: { template: string; template_en: string; negative: string }
): Promise<PromptResult> {
  const key = getSetting("deepseek_key");
  if (!key) return localCompose(form, tpl);
  try {
    const userMsg = `业务线：${form.businessLine}\n渠道/项目：${form.channel}\n内容类型：${form.contentType}\n产品/主体：${form.product || "无"}\n风格：${form.style || "默认"}\n尺寸：${form.sizeText || "默认"}\n具体要求：${form.requirement}\n知识库参考：${form.kbContext || "无"}\n参考模板：${tpl ? tpl.template : "无"}`;
    const out = await deepseekChat([
      { role: "system", content: SYS },
      { role: "user", content: userMsg },
    ]);
    const parsed = JSON.parse(out);
    return {
      cn: parsed.cn || "",
      en: parsed.en || "",
      negative: parsed.negative || "模糊, 变形, 水印, 文字",
      source: "deepseek",
    };
  } catch (e) {
    const r = localCompose(form, tpl);
    r.note = `DeepSeek 调用失败（${(e as Error).message.slice(0, 80)}），已用本地模板兜底。`;
    return r;
  }
}

export async function optimizePrompt(cn: string, en: string, direction: string): Promise<PromptResult> {
  const key = getSetting("deepseek_key");
  if (!key) {
    return {
      cn: cn + "，" + direction, en: en + ", " + direction,
      negative: "模糊, 变形, 水印, 文字, 低质量",
      source: "local", note: "未配置 DeepSeek key，仅做了简单拼接。",
    };
  }
  try {
    const out = await deepseekChat([
      { role: "system", content: SYS },
      { role: "user", content: `请优化以下绘图提示词，优化方向：${direction}\n中文：${cn}\n英文：${en}` },
    ]);
    const parsed = JSON.parse(out);
    return { cn: parsed.cn || cn, en: parsed.en || en, negative: parsed.negative || "", source: "deepseek" };
  } catch (e) {
    return { cn, en, negative: "", source: "local", note: `DeepSeek 调用失败：${(e as Error).message.slice(0, 80)}` };
  }
}

/** 反推提示词：优先 Qwen-VL；无 key 则返回 ChatGPT 半自动通道指令 */
export async function reversePrompt(imageBase64: string, mime: string): Promise<{ prompt?: string; source: string; semiAuto?: string; note?: string }> {
  const key = getSetting("qwen_key");
  if (key) {
    try {
      const base = getSetting("qwen_base");
      const model = getSetting("qwen_vl_model") || "qwen-vl-max";
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
              { type: "text", text: "反推这张图的 AI 绘图提示词。输出 JSON：{\"cn\":\"中文提示词\",\"en\":\"English prompt\"}，要描述主体、风格、构图、光线、材质、画质词。只输出 JSON。" },
            ],
          }],
        }),
      });
      if (!res.ok) throw new Error(`Qwen ${res.status}`);
      const data = await res.json();
      const text: string = data.choices?.[0]?.message?.content ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        return { prompt: JSON.stringify(p), source: "qwen-vl" };
      }
      return { prompt: text, source: "qwen-vl" };
    } catch (e) {
      return { source: "error", note: `Qwen-VL 调用失败：${(e as Error).message.slice(0, 80)}`, semiAuto: semiAutoReverse() };
    }
  }
  return { source: "semi-auto", semiAuto: semiAutoReverse(), note: "未配置 Qwen-VL key。可走 ChatGPT 网页通道：复制下面指令+图片发给 ChatGPT，把结果粘回来。" };
}

function semiAutoReverse(): string {
  return "请反推这张图片的 AI 绘图提示词。要求：描述主体、风格、构图、光线、材质、画质词；输出 JSON 格式：{\"cn\":\"中文提示词\",\"en\":\"English prompt\"}。只输出 JSON。";
}

/** ChatGPT 半自动通道：生成可直接粘贴的指令 */
export function buildChatGPTInstruction(form: PromptForm, tplText?: string): string {
  return `${SYS}\n\n业务线：${form.businessLine}\n渠道/项目：${form.channel}\n内容类型：${form.contentType}\n产品/主体：${form.product || "无"}\n风格：${form.style || "默认"}\n具体要求：${form.requirement}\n参考模板：${tplText || "无"}`;
}

const SERVICE_SYS = `你是「陕西典致」的客服专员，公司两项业务：①实木花盆/花盆支架电商（淘宝、抖店、拼多多、视频号、小红书）；②广告工程（展厅全案设计、投标应标效果图、标识物设计生产安装）。
根据客户咨询和给定的知识库资料，起草一段可直接发送的中文回复。要求：语气亲切专业、先回应问题核心、能引用知识库中的产品信息（材质/尺寸/价格/卖点）就引用、不确定的交代表达"我帮您确认后回复"、结尾留钩子（如引导下单/加微信/约看厂）。200字以内，纯文本不要 JSON。`;

/** 品牌客服：结合知识库起草回复。无 DeepSeek key 时给本地兜底模板 */
export async function serviceReply(question: string, kbContext: string): Promise<{ reply: string; source: string; note?: string }> {
  const key = getSetting("deepseek_key");
  if (!key) {
    return {
      reply: `亲，您好！收到您关于「${question.slice(0, 30)}」的咨询。我们的产品均为实木手工制作，具体材质、尺寸和报价我整理后第一时间发您；方便的话可以留个联系方式或加微信，给您发实物图和报价单～`,
      source: "local",
      note: "未配置 DeepSeek key，这是兜底模板。到 设置 页填 key 后由大模型结合知识库生成。",
    };
  }
  try {
    const out = await deepseekChat([
      { role: "system", content: SERVICE_SYS },
      { role: "user", content: `客户咨询：${question}\n\n知识库资料：\n${kbContext || "（空）"}` },
    ], false);
    return { reply: out.trim(), source: "deepseek" };
  } catch (e) {
    return {
      reply: `亲，您好！收到您关于「${question.slice(0, 30)}」的咨询，我帮您确认后马上回复您～`,
      source: "local",
      note: `DeepSeek 调用失败（${(e as Error).message.slice(0, 80)}），已用兜底模板。`,
    };
  }
}
