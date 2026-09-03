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

/* ============ 带货视频流水线（clipforge 链路） ============ */

export interface ClipforgeInput {
  product: string;          // 商品名 / 描述
  sellingPoints?: string;   // 已有卖点（留空则 AI 提炼）
  platform: string;         // 抖音/快手/小红书/视频号/淘宝
  scriptType: string;       // 痛点/场景/测评
  duration: number;         // 视频时长（秒）
}

export interface ClipforgeResult {
  sellingPoints: string[];
  title: string;
  script: string;
  videoPrompt: string;
  source: "deepseek" | "local";
  note?: string;
}

const PLATFORM_STYLE: Record<string, string> = {
  "抖音": "节奏快、前3秒强钩子、口语化、强行动指令（如「点左下角」）、突出视觉冲击",
  "快手": "接地气老铁口语、真实感、突出实惠与源头工厂、强调「自家/源头」",
  "小红书": "精致种草笔记风、语气温柔、场景化、突出审美与生活品质、带话题标签",
  "视频号": "中产生活质感、信任感、克制不夸张、突出品质与品牌、适配中老年客群",
  "淘宝": "详情页转化导向、功能卖点罗列清晰、突出材质尺寸售后、引导加购",
};

const SCRIPT_TYPE: Record<string, string> = {
  "痛点": "先戳痛点（如花盆易裂、浇水漏土、阳台杂乱），再引出产品解决方案，最后行动号召",
  "场景": "沉浸式场景种草（如晨光阳台、午后庭院），用画面讲故事，弱化硬广",
  "测评": "开箱/实测/对比风格，展示做工细节、承重、材质，建立专业信任",
};

const CLIPFORGE_SYS = `你是资深电商带货短视频策划，服务实木花盆/花盆支架电商（淘宝/抖店/拼多多/视频号/小红书）。
根据商品信息生成带货内容，严格按以下 JSON 输出，不要输出其他内容：
{"sellingPoints":["卖点1","卖点2","卖点3"],"title":"3秒钩子标题","script":"完整脚本","videoPrompt":"English video generation prompt"}
脚本要求：含分镜（画面+运镜）、口播文案、字幕要点、BGM建议；时长控制在约 N 秒。`;

export async function generateClipforge(input: ClipforgeInput): Promise<ClipforgeResult> {
  const key = getSetting("deepseek_key");
  const platform = PLATFORM_STYLE[input.platform] || "通用";
  const stype = SCRIPT_TYPE[input.scriptType] || "场景";

  if (!key) {
    // 本地兜底：给一个可用的基础脚本模板
    const product = input.product || "实木花盆";
    const points = input.sellingPoints ? input.sellingPoints.split(/[，,、]/).map((s) => s.trim()).filter(Boolean).slice(0, 3) : ["实木手工制作", "加厚耐用", "阳台庭院两用"];
    const script = `【${input.scriptType}型 · ${input.platform} · ${input.duration}秒】\n分镜1（0-3s 钩子）：${product}特写，缓慢推进\n口播：${points[0]}，家里阳台终于能整整齐齐了\n分镜2（3-${Math.min(8, input.duration)}s 展示）：多角度展示\n口播：${points.slice(0, 2).join("，")}\n分镜3（收尾）：行动号召\n口播：点击下方链接，源头工厂直发`;
    return {
      sellingPoints: points,
      title: `${product}，${points[0]}`,
      script,
      videoPrompt: `close-up of ${product}, warm natural light, e-commerce product video, cinematic`,
      source: "local",
      note: "未配置 DeepSeek key，已用本地模板生成。到 设置 页填 key 后由大模型生成。",
    };
  }

  try {
    const userMsg = `商品：${input.product}\n已有卖点：${input.sellingPoints || "（无，请提炼）"}\n平台：${input.platform}（${platform}）\n脚本类型：${input.scriptType}（${stype}）\n时长：${input.duration}秒`;
    const out = await deepseekChat([
      { role: "system", content: CLIPFORGE_SYS.replace("N 秒", String(input.duration)) },
      { role: "user", content: userMsg },
    ]);
    const p = JSON.parse(out);
    return {
      sellingPoints: Array.isArray(p.sellingPoints) ? p.sellingPoints : [],
      title: p.title || "",
      script: p.script || "",
      videoPrompt: p.videoPrompt || "",
      source: "deepseek",
    };
  } catch (e) {
    const fallback = await generateClipforge({ ...input, sellingPoints: input.sellingPoints || "实木手工制作, 加厚耐用" });
    fallback.source = "local";
    fallback.note = `DeepSeek 调用失败（${(e as Error).message.slice(0, 80)}），已用本地模板兜底。`;
    return fallback;
  }
}

/* ============ 判官团质检（多角色交叉审查，省重跑 API 费用） ============ */

export interface ReviewItem {
  role: string;        // 审查角色
  verdict: "硬伤" | "应改" | "品味"; // 分级采纳
  comment: string;     // 具体意见
}

export interface ReviewResult {
  items: ReviewItem[];
  score: number;       // 1-10 总分
  source: "deepseek" | "local";
  note?: string;
}

const REVIEW_SYS = `你是短视频脚本评审团，由 5 位评审组成，各自从专业角度审查带货脚本。
分级标准：硬伤=必须改（逻辑/事实/违禁词问题）；应改=建议改（明显影响转化）；品味=可优化（锦上添花）。
严格按以下 JSON 输出，不要输出其他内容：
{"items":[{"role":"节奏官","verdict":"硬伤|应改|品味","comment":"意见"},{"role":"口播官","verdict":"...","comment":"..."},{"role":"创意官","verdict":"...","comment":"..."},{"role":"结构官","verdict":"...","comment":"..."},{"role":"画面官","verdict":"...","comment":"..."}],"score":8}
role 固定依次为：节奏官、口播官、创意官、结构官、画面官；verdict 只能是 硬伤/应改/品味 三者之一；score 为 1-10 整数。`;

export async function reviewScript(script: string, context: string): Promise<ReviewResult> {
  const key = getSetting("deepseek_key");
  if (!key) {
    return {
      items: [
        { role: "节奏官", verdict: "应改", comment: "未配置 DeepSeek key，无法自动审查。建议人工核对前3秒钩子。" },
        { role: "口播官", verdict: "应改", comment: "检查是否口语化、有无书面语。" },
        { role: "创意官", verdict: "应改", comment: "检查是否有记忆点/差异化。" },
        { role: "结构官", verdict: "应改", comment: "检查起承转合、卖点是否讲清。" },
        { role: "画面官", verdict: "应改", comment: "检查画面描述是否可执行。" },
      ],
      score: 0,
      source: "local",
      note: "未配置 DeepSeek key，返回审查清单供人工逐项核对。",
    };
  }
  try {
    const userMsg = `脚本背景：${context}\n\n待审查脚本：\n${script}`;
    const out = await deepseekChat([
      { role: "system", content: REVIEW_SYS },
      { role: "user", content: userMsg },
    ]);
    const p = JSON.parse(out);
    const items: ReviewItem[] = Array.isArray(p.items) ? p.items : [];
    return {
      items: items.slice(0, 5).map((it) => ({
        role: String(it.role || "评审"),
        verdict: (["硬伤", "应改", "品味"].includes(it.verdict) ? it.verdict : "应改") as ReviewItem["verdict"],
        comment: String(it.comment || ""),
      })),
      score: Math.min(10, Math.max(1, Number(p.score) || 6)),
      source: "deepseek",
    };
  } catch (e) {
    return {
      items: [],
      score: 0,
      source: "local",
      note: `判官团审查失败（${(e as Error).message.slice(0, 80)}）。`,
    };
  }
}

/* ============ 产品卖点提炼（USP / FABE / 4S / 人话转换） ============ */

export interface SellingInput {
  product: string;            // 商品名 + 核心描述
  framework: string;          // 提炼框架：fabe / usp / scene / all（当前统一走综合）
  platform?: string;          // 目标平台（淘宝/抖店/拼多多/视频号/小红书）
  audience?: string;          // 目标人群（可选）
  hasExistingPoints?: string; // 已有卖点（可选，逗号分隔）
}

export interface FabeRow {
  feature: string;    // F 特性
  advantage: string;  // A 优势
  benefit: string;    // B 利益
  evidence: string;   // E 证据
}

export interface SellingResult {
  usp: string;                       // 一句话核心卖点
  fabe: FabeRow[];                   // FABE 卖点表
  painPointHook: string;             // 痛点开场 + 转化话术
  cta: string;                       // 行动号召
  platforms: Record<string, string>; // 各平台文案变体
  source: "deepseek" | "local";
  note?: string;
}

const SELLING_SYS = `你是资深电商卖点提炼专家，服务「陕西典致」两项业务：实木花盆/花盆支架电商（淘宝/抖店/拼多多/视频号/小红书）与广告工程（展厅全案、标识物设计生产安装）。
你的任务：把商品的「功能参数」翻译成用户「非买不可」的卖点。核心心法：卖点≠功能参数；用户3秒扫一眼、80%购买决策靠情绪驱动。

提炼方法（四套框架综合运用）：
1. FABE：F特性(技术参数/规格) → A优势(比竞品好在哪) → B利益(用户得到什么) → E证据(凭什么相信)。句式：【特性】让您【优势】，从此【利益】。
2. USP一句话：只说一个点，说到心坎里。公式：【用户身份】+【痛点场景】+【唯一解决方案】。
3. 4S场景法：Scene场景 → Struggle痛点 → Solution解法 → Support证据。先写具体场景（人+地点+任务），痛点写成用户会抱怨的话，不要空泛。
4. 人话转换：技术语言→生活语言。数据具象化（"5000mAh"→"刷18集剧还有电"）、对比法、价格锚点（"去一次美容院600元，家用仪相当于60次护理"）。

硬性避坑（广告法 + 转化率）：
- 禁止功能堆砌当卖点，选最核心的1-3个点深挖，不要贪多。
- 禁止自嗨式创新，从用户真实痛点出发。
- 禁止绝对化用语：第一/最/唯一/顶级/国家级/冠军/100%等（会触发广告法）。
- 禁止夸大承诺：永久/终身/零风险/无效退款/彻底解决。
- 卖点要可感知、场景化、有数据或证据支撑；利益点匹配目标人群画像。

严格按以下 JSON 输出，不要输出其他内容：
{"usp":"一句话核心卖点口号","fabe":[{"feature":"特性","advantage":"优势","benefit":"利益","evidence":"证据"}],"painPointHook":"痛点开场+转化话术（一段连贯文字）","cta":"行动号召短句","platforms":{"淘宝":"文案","抖店":"文案","拼多多":"文案","视频号":"文案","小红书":"文案"}}
fabe 输出 3 条；platforms 只输出用户指定的平台，未指定的可省略；各平台文案要贴合平台调性（淘宝重功能卖点、抖店节奏快有钩子、小红书精致种草、视频号重品质信任、拼多多重实惠源头）。`;

function localSelling(input: SellingInput): SellingResult {
  const product = input.product || "实木花盆";
  return {
    usp: `${product}，让阳台庭院从此井然有序`,
    fabe: [
      { feature: "整木实木材质", advantage: "天然环保、无异味", benefit: "家里养花更安心", evidence: "整木裁切、木纹自然" },
      { feature: "高温碳化处理", advantage: "防腐防裂更耐用", benefit: "一次买对，用很多年", evidence: "加厚板材、工艺成熟" },
      { feature: "带沥水孔/托盘", advantage: "浇水不积水", benefit: "不烂根、好打理", evidence: "人性化细节设计" },
    ],
    painPointHook: "花盆容易开裂？浇水漏得到处都是？试试这款实木加厚花盆，防腐防裂、带沥水托盘，阳台庭院两用，一盆搞定。",
    cta: "点击下方链接，源头工厂直发",
    platforms: {},
    source: "local",
    note: "未配置 DeepSeek key，已用本地模板生成。到 设置 页填 key 后由大模型生成。",
  };
}

export async function generateSellingPoints(input: SellingInput): Promise<SellingResult> {
  const key = getSetting("deepseek_key");
  if (!key) return localSelling(input);
  try {
    const userMsg = `商品：${input.product}\n目标平台：${input.platform || "通用"}\n目标人群：${input.audience || "未指定，请按通用人群"}\n已有卖点：${input.hasExistingPoints || "无"}`;
    const out = await deepseekChat([
      { role: "system", content: SELLING_SYS },
      { role: "user", content: userMsg },
    ]);
    const p = JSON.parse(out);
    const rawFabe: Record<string, unknown>[] = (Array.isArray(p.fabe) ? p.fabe : []).slice(0, 3);
    const fabe: FabeRow[] = rawFabe
      .map((r) => ({
        feature: String(r.feature ?? ""),
        advantage: String(r.advantage ?? ""),
        benefit: String(r.benefit ?? ""),
        evidence: String(r.evidence ?? ""),
      }))
      .filter((r) => r.feature || r.benefit);
    return {
      usp: String(p.usp ?? ""),
      fabe,
      painPointHook: String(p.painPointHook ?? ""),
      cta: String(p.cta ?? ""),
      platforms: p.platforms && typeof p.platforms === "object" ? (p.platforms as Record<string, string>) : {},
      source: "deepseek",
    };
  } catch (e) {
    const r = localSelling(input);
    r.note = `DeepSeek 调用失败（${(e as Error).message.slice(0, 80)}），已用本地模板兜底。`;
    return r;
  }
}

/** Codex 半自动通道：生成可直接粘贴到 Codex/ChatGPT 网页的指令 */
export function buildSellingCodexInstruction(input: SellingInput): string {
  return `${SELLING_SYS}\n\n请根据以下商品信息生成卖点文案：\n商品：${input.product}\n目标平台：${input.platform || "通用"}\n目标人群：${input.audience || "未指定"}\n已有卖点：${input.hasExistingPoints || "无"}\n\n只输出 JSON，不要输出其他内容。`;
}
