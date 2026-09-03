/**
 * 引擎注册表 —— 单一真相源（Single Source of Truth）
 *
 * 出图 / 视频 / LLM / 视觉 引擎的元数据（名称、KEY 字段、模型预设、能力归类）
 * 全部集中在此定义。设置页分组、出图/视频引擎下拉、/api/meta 的 engine 列表
 * 均从这里派生，避免"加一个引擎要改 5 个文件"的散落问题。
 *
 * 新增引擎只需：
 *   1) 在 ENGINES 里加一条 EngineDef
 *   2) 在 engines/image.ts 或 video.ts 加 submit/poll 适配函数
 *   3) 在 /api/settings/test 加连通性测试 case（group = code）
 *   4) 在 db.ts 的 DEFAULT_SETTINGS + PRICING_SEED 补默认配置 / 价格
 */

export type EngineKind = "image" | "video" | "llm" | "vlm";

export interface EngineField {
  key: string;      // settings 表的 key
  label: string;    // 设置页输入框标签
  long?: boolean;   // 多行输入（如 workflow JSON）
}

export interface EngineModel {
  v: string;
  tip?: string;
}

export interface EngineDisplay {
  name: string;
  keyHint: string;
}

export interface EngineDef {
  code: string;            // 唯一标识（= /api/settings/test 的 group）
  name: string;            // 默认显示名
  keyHint: string;         // 下拉里的 KEY 提示
  kinds: EngineKind[];     // 出现在哪些引擎列表（出图 / 视频 / LLM / 视觉）
  groupName: string;       // 设置页分组标题
  reserved?: boolean;      // 预留项（未真正启用）
  display?: Partial<Record<EngineKind, EngineDisplay>>; // 按 kind 覆盖显示名 / 提示
  modelField?: string;     // 模型字段 key（有则生成 datalist 下拉）
  models?: EngineModel[];  // 模型预设
  fields: EngineField[];   // 设置页配置字段
}

/** LOVART 出图模型（tool name 直接进 /chat 的 tool_config，tip 为中文说明） */
const LOVART_IMAGE_MODELS: EngineModel[] = [
  { v: "generate_image_nano_banana_pro", tip: "Nano Banana Pro·主体保护/产品插入最强·电商保真首选" },
  { v: "generate_image_gpt_image_2", tip: "GPT Image 2·超写实+文字排版·广告海报/招牌文字" },
  { v: "generate_image_seedream_v5_pro", tip: "Seedream 5.0 Pro·中文原生+产品摄影·电商产品图" },
];

/** LOVART 视频模型 */
const LOVART_VIDEO_MODELS: EngineModel[] = [
  { v: "generate_video_seedance_v2_5", tip: "Seedance 2.5·字节·电商带货首选" },
  { v: "generate_video_kling_v3", tip: "Kling 3.0·快手·画质最强·广告宣传片" },
  { v: "generate_video_vidu_q2", tip: "Vidu Q2·清华系·动画音画同步" },
];

export const ENGINES: EngineDef[] = [
  {
    code: "deepseek", name: "DeepSeek", keyHint: "API Key", kinds: ["llm"],
    groupName: "DeepSeek（提示词生成）",
    modelField: "deepseek_model",
    models: [
      { v: "deepseek-chat", tip: "通用对话（默认）" },
      { v: "deepseek-reasoner", tip: "深度推理（R1）" },
    ],
    fields: [
      { key: "deepseek_key", label: "API Key" },
      { key: "deepseek_base", label: "Base URL" },
      { key: "deepseek_model", label: "模型" },
    ],
  },
  {
    code: "qwen", name: "阿里百炼 Qwen-VL", keyHint: "百炼KEY", kinds: ["vlm"],
    groupName: "阿里百炼 Qwen-VL（反推提示词）",
    modelField: "qwen_vl_model",
    models: [
      { v: "qwen-vl-max", tip: "最强视觉理解（默认）" },
      { v: "qwen-vl-plus", tip: "均衡款" },
    ],
    fields: [
      { key: "qwen_key", label: "API Key" },
      { key: "qwen_base", label: "Base URL" },
      { key: "qwen_vl_model", label: "视觉模型" },
    ],
  },
  {
    code: "wanxiang", name: "通义万相", keyHint: "百炼KEY", kinds: ["image"],
    groupName: "通义万相（出图 · 用百炼KEY）",
    modelField: "wanxiang_model",
    models: [
      { v: "wanx2.1-t2i-turbo", tip: "通义万相 2.1 快速版（默认）" },
      { v: "wanx2.1-t2i-plus", tip: "通义万相 2.1 高质量" },
      { v: "wanx2.0-t2i-turbo", tip: "通义万相 2.0 快速版" },
    ],
    fields: [
      { key: "wanxiang_key", label: "API Key（留空则用上面的百炼KEY）" },
      { key: "wanxiang_model", label: "模型（默认 wanx2.1-t2i-turbo）" },
      { key: "wanxiang_edit_model", label: "图编辑模型（有参考图时走产品保真，默认 wanx2.1-imageedit）" },
    ],
  },
  {
    code: "liblib", name: "LiblibAI", keyHint: "双KEY", kinds: ["image"],
    groupName: "LiblibAI（聚合出图 · 双KEY · 企业认证）",
    modelField: "liblib_model",
    fields: [
      { key: "liblib_ak", label: "AccessKey（企业认证后获取）" },
      { key: "liblib_sk", label: "SecretKey" },
      { key: "liblib_base", label: "Base URL（默认 https://openapi.liblibai.cloud）" },
      { key: "liblib_template", label: "文生图模板UUID（默认普通版）" },
      { key: "liblib_i2i_template", label: "图生图模板UUID（默认普通版）" },
      { key: "liblib_denoise", label: "图生图重绘幅度（0.4-0.7，默认0.6）" },
      { key: "liblib_model", label: "底模 CheckpointID（留空用模板默认）" },
    ],
  },
  {
    code: "jimeng", name: "即梦", keyHint: "方舟KEY", kinds: ["image", "video"],
    groupName: "即梦 Seedream（出图 · 火山方舟）",
    display: { video: { name: "即梦(跳转)", keyHint: "网页" } },
    modelField: "jimeng_model",
    models: [
      { v: "doubao-seedream-5-0-pro", tip: "🔥 旗舰·最新·编辑可控" },
      { v: "doubao-seedream-4-5-250911", tip: "文生图+图生图+组图" },
      { v: "doubao-seedream-5-0-lite", tip: "可联网·轻量·热点类" },
      { v: "doubao-seedream-4-0-250828", tip: "上一代稳定款" },
    ],
    fields: [
      { key: "jimeng_key", label: "方舟 API Key" },
      { key: "jimeng_base", label: "Base URL" },
      { key: "jimeng_model", label: "模型（默认 doubao-seedream-4-0）" },
    ],
  },
  {
    code: "lovart", name: "LOVART", keyHint: "双KEY", kinds: ["image", "video"],
    groupName: "LOVART（出图+出视频 · 双KEY · 需代理）",
    modelField: "lovart_model",
    models: LOVART_IMAGE_MODELS,
    fields: [
      { key: "lovart_ak", label: "Access Key" },
      { key: "lovart_sk", label: "Secret Key" },
      { key: "lovart_base", label: "Base URL（默认 lgw.lovart.ai）" },
      { key: "lovart_path", label: "API 前缀（默认 /v1/openapi）" },
      { key: "lovart_project_id", label: "项目ID（留空自动创建）" },
      { key: "lovart_model", label: "出图模型（留空则 AI 自动选）" },
      { key: "lovart_video_model", label: "视频模型（留空则 AI 自动选）" },
    ],
  },
  {
    code: "kling", name: "可灵", keyHint: "ak/sk", kinds: ["image", "video"],
    groupName: "可灵（出图 + 出视频）",
    fields: [
      { key: "kling_ak", label: "API Key（新版单 Key 只填这栏）" },
      { key: "kling_sk", label: "Secret Key（仅旧版双KEY填，否则留空）" },
      { key: "kling_base", label: "Base URL" },
    ],
  },
  {
    code: "vidu", name: "Vidu Q3", keyHint: "Token", kinds: ["video"],
    groupName: "Vidu Q3（出视频）",
    fields: [
      { key: "vidu_key", label: "Token" },
      { key: "vidu_base", label: "Base URL" },
    ],
  },
  {
    code: "comfyui", name: "ComfyUI", keyHint: "本地/云端", kinds: ["image"],
    groupName: "ComfyUI（本地/云端工作流）",
    fields: [
      { key: "comfyui_local_url", label: "本地地址（默认 http://127.0.0.1:8188）" },
      { key: "comfyui_cloud_url", label: "云端地址（优先于本地）" },
      { key: "comfyui_workflow", label: "Workflow JSON（ComfyUI Save (API Format)，占位符：{{prompt}}/{{negative}}/{{width}}/{{height}}/{{seed}}/{{n}}）", long: true },
    ],
  },
];

/** 引擎下拉列表的展示顺序（保持与历史 UI 一致） */
const KIND_ORDER: Partial<Record<EngineKind, string[]>> = {
  image: ["lovart", "kling", "wanxiang", "jimeng", "liblib", "comfyui"],
  video: ["kling", "lovart", "vidu", "jimeng"],
};

/** 按能力类别取引擎下拉列表（供 /api/meta 派生 imageEngines / videoEngines） */
export function enginesOf(kind: EngineKind): { code: string; name: string; keyHint: string }[] {
  const order = KIND_ORDER[kind] ?? [];
  const list = ENGINES.filter((e) => e.kinds.includes(kind));
  list.sort((a, b) => {
    const ia = order.indexOf(a.code);
    const ib = order.indexOf(b.code);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return list.map((e) => {
    const d = e.display?.[kind];
    return { code: e.code, name: d?.name ?? e.name, keyHint: d?.keyHint ?? e.keyHint };
  });
}

export const IMAGE_ENGINES = enginesOf("image");
export const VIDEO_ENGINES = enginesOf("video");

/** 模型字段 key → 预设（设置页 datalist 用） */
export const MODEL_PRESETS: Record<string, EngineModel[]> = {};
for (const e of ENGINES) {
  if (e.modelField && e.models) MODEL_PRESETS[e.modelField] = e.models;
}
// LOVART 出图/视频是同一引擎下的两个独立模型字段，视频字段单独注册预设
MODEL_PRESETS["lovart_video_model"] = LOVART_VIDEO_MODELS;

/** 设置页分组（含"默认引擎"伪分组） */
export interface SettingsGroup {
  name: string;
  test: string | null;
  fields: EngineField[];
}

const DEFAULT_ENGINE_GROUP: SettingsGroup = {
  name: "默认引擎",
  test: null,
  fields: [
    { key: "default_image_engine", label: "默认出图引擎" },
    { key: "default_video_engine", label: "默认视频引擎" },
  ],
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  ...ENGINES.map((e): SettingsGroup => ({
    name: e.groupName,
    test: e.code, // /api/settings/test 的 group 约定等于引擎 code
    fields: e.fields,
  })),
  DEFAULT_ENGINE_GROUP,
];
