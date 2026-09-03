/**
 * 合规检查门禁 —— 出图/视频/带货文案提交前的广告法违禁词扫描
 *
 * 依据《中华人民共和国广告法》第九条（绝对化用语）、第十七条（医疗广告）、
 * 及市场监管总局《医疗广告管理办法》整理。命中即返回「警告」而非硬拦截：
 * 部分词在特定语境或持有证明材料时合法，最终判断权交回人工。
 *
 * 用词表驱动，方便后续按业务线（广告/电商）扩展。
 */

export type Category = "absolute" | "medical" | "exaggeration";

export interface ComplianceHit {
  word: string;
  category: Category;
  reason: string;
  suggestion: string;
}

export interface ComplianceResult {
  safe: boolean;
  hits: ComplianceHit[];
}

interface Rule {
  word: string;
  category: Category;
  reason: string;
  suggestion: string;
}

/** 广告法绝对化用语 —— 无证据不得使用（第九条第三项） */
const ABSOLUTE: Rule[] = [
  { word: "国家级", category: "absolute", reason: "绝对化用语", suggestion: "改为「达到国家标准」或附证明" },
  { word: "世界级", category: "absolute", reason: "绝对化用语", suggestion: "改为「面向全球」" },
  { word: "顶级", category: "absolute", reason: "绝对化用语", suggestion: "改为「高端」" },
  { word: "顶尖", category: "absolute", reason: "绝对化用语", suggestion: "改为「专业级」" },
  { word: "极致", category: "absolute", reason: "绝对化用语", suggestion: "改为「出色」「精工」" },
  { word: "第一", category: "absolute", reason: "绝对化用语", suggestion: "需附排名证明，否则删除" },
  { word: "首个", category: "absolute", reason: "绝对化用语", suggestion: "改为「率先」" },
  { word: "首家", category: "absolute", reason: "绝对化用语", suggestion: "改为「率先推出」" },
  { word: "唯一", category: "absolute", reason: "绝对化用语", suggestion: "改为「独家合作」并附授权" },
  { word: "独家", category: "absolute", reason: "绝对化用语", suggestion: "需附独家授权证明" },
  { word: "首创", category: "absolute", reason: "绝对化用语", suggestion: "改为「自主研发」" },
  { word: "史无前例", category: "absolute", reason: "绝对化用语", suggestion: "删除或改为「全新」" },
  { word: "空前", category: "absolute", reason: "绝对化用语", suggestion: "删除" },
  { word: "绝无仅有", category: "absolute", reason: "绝对化用语", suggestion: "改为「少见」" },
  { word: "无与伦比", category: "absolute", reason: "绝对化用语", suggestion: "改为「出众」" },
  { word: "无可比拟", category: "absolute", reason: "绝对化用语", suggestion: "改为「出众」" },
  { word: "万能", category: "absolute", reason: "绝对化用语", suggestion: "改为「多用途」" },
  { word: "全能", category: "absolute", reason: "绝对化用语", suggestion: "改为「多用途」" },
  { word: "绝对", category: "absolute", reason: "绝对化用语", suggestion: "删除或改为「非常」" },
  { word: "完美", category: "absolute", reason: "绝对化用语", suggestion: "改为「细腻」" },
  { word: "无敌", category: "absolute", reason: "绝对化用语", suggestion: "删除" },
  { word: "冠军", category: "absolute", reason: "绝对化用语", suggestion: "需附获奖证明" },
  { word: "王牌", category: "absolute", reason: "绝对化用语", suggestion: "改为「主打」" },
  { word: "巅峰", category: "absolute", reason: "绝对化用语", suggestion: "改为「高端」" },
  { word: "至尊", category: "absolute", reason: "绝对化用语", suggestion: "删除" },
  { word: "领跑", category: "absolute", reason: "绝对化用语", suggestion: "需附数据证明" },
  { word: "领导品牌", category: "absolute", reason: "绝对化用语", suggestion: "需附市场地位证明" },
  { word: "销量第一", category: "absolute", reason: "绝对化用语", suggestion: "需附销量证明" },
  { word: "全国第一", category: "absolute", reason: "绝对化用语", suggestion: "需附证明，否则删除" },
  { word: "100%", category: "absolute", reason: "绝对化表述", suggestion: "改为「高品质」" },
  { word: "百分之百", category: "absolute", reason: "绝对化表述", suggestion: "改为「全手工」" },
];

/** 医疗功效 / 疾病治疗 —— 广告业务敏感，非药械不得使用 */
const MEDICAL: Rule[] = [
  { word: "根治", category: "medical", reason: "医疗功效表述", suggestion: "非药械不得承诺根治" },
  { word: "治愈", category: "medical", reason: "医疗功效表述", suggestion: "非药械不得使用" },
  { word: "疗效", category: "medical", reason: "医疗功效表述", suggestion: "非药械不得使用" },
  { word: "抗癌", category: "medical", reason: "医疗功效表述", suggestion: "严禁使用" },
  { word: "防癌", category: "medical", reason: "医疗功效表述", suggestion: "严禁使用" },
  { word: "降血压", category: "medical", reason: "医疗功效表述", suggestion: "严禁使用" },
  { word: "降血糖", category: "medical", reason: "医疗功效表述", suggestion: "严禁使用" },
  { word: "降三高", category: "medical", reason: "医疗功效表述", suggestion: "严禁使用" },
  { word: "包治百病", category: "medical", reason: "医疗功效表述", suggestion: "严禁使用" },
  { word: "药到病除", category: "medical", reason: "医疗功效表述", suggestion: "严禁使用" },
  { word: "立竿见影", category: "medical", reason: "医疗功效表述", suggestion: "改为「即刻见效」并慎用" },
  { word: "延年益寿", category: "medical", reason: "医疗功效表述", suggestion: "严禁使用" },
  { word: "治疗", category: "medical", reason: "医疗功效表述", suggestion: "非药械不得使用" },
];

/** 虚假夸大 / 极限承诺 —— 违反《广告法》第八条真实性原则 */
const EXAGGERATION: Rule[] = [
  { word: "零风险", category: "exaggeration", reason: "夸大承诺", suggestion: "删除" },
  { word: "无风险", category: "exaggeration", reason: "夸大承诺", suggestion: "删除" },
  { word: "无副作用", category: "exaggeration", reason: "夸大承诺", suggestion: "非药械不得使用" },
  { word: "无效退款", category: "exaggeration", reason: "承诺性用语", suggestion: "需明确退款条件" },
  { word: "永久", category: "exaggeration", reason: "夸大承诺", suggestion: "改为「耐用」" },
  { word: "终身", category: "exaggeration", reason: "夸大承诺", suggestion: "改为「长期」" },
  { word: "永不过时", category: "exaggeration", reason: "夸大承诺", suggestion: "改为「经典」" },
  { word: "彻底解决", category: "exaggeration", reason: "夸大承诺", suggestion: "改为「有效改善」" },
  { word: "最低价", category: "exaggeration", reason: "极限价格承诺", suggestion: "需有据可依" },
  { word: "全网最低", category: "exaggeration", reason: "极限价格承诺", suggestion: "需有据可依" },
];

const ALL: Rule[] = [...ABSOLUTE, ...MEDICAL, ...EXAGGERATION];

const CATEGORY_LABEL: Record<Category, string> = {
  absolute: "绝对化用语",
  medical: "医疗功效",
  exaggeration: "虚假夸大",
};

/**
 * 扫描文案中的违禁词，返回命中的词条与修改建议。
 * 仅作「提示 + 警告」，不硬拦截——最终判断权交回人工。
 */
export function checkCompliance(text: string): ComplianceResult {
  const src = String(text ?? "");
  if (!src.trim()) return { safe: true, hits: [] };
  const hits: ComplianceHit[] = [];
  for (const r of ALL) {
    if (src.includes(r.word)) {
      hits.push({ word: r.word, category: r.category, reason: r.reason, suggestion: r.suggestion });
    }
  }
  return { safe: hits.length === 0, hits };
}

/** 把命中结果格式化成一段可读的告警文案 */
export function formatComplianceWarning(hits: ComplianceHit[]): string {
  if (!hits.length) return "";
  const lines = hits.map((h) => `·「${h.word}」${h.reason} → ${h.suggestion}`);
  return `文案命中 ${hits.length} 处广告法风险：\n${lines.join("\n")}`;
}

/** 供前端展示用的分类中文名 */
export function categoryLabel(c: Category): string {
  return CATEGORY_LABEL[c];
}
