// 计价工具：从 /api/pricing 路由抽出来，避免 Next.js 路由文件只能导出 HTTP 方法的限制

export interface Pricing {
  id: number;
  engine: string;
  model: string;
  unit_price: number;
  unit: string;
  discount_pct: number;
  discount_until: string | null;
  note: string | null;
}

/**
 * 计算生效单价（折扣后）+ 折扣文案
 *
 * discount_pct 是"减免百分比"：50 = 减 50% = 5 折（付原价 50%）
 * 中文"X 折"表示付原价的 X/10，所以 X = (100 - pct) / 10
 * 例：discount_pct=30 → 7 折（付 70%）；discount_pct=50 → 5 折（付 50%）
 */
export function effectivePrice(p: Pricing | undefined): { price: number; text: string } | null {
  if (!p) return null;
  let price = p.unit_price;
  const until = p.discount_until ? new Date(p.discount_until) : null;
  const active = p.discount_pct > 0 && (!until || until.getTime() > Date.now());
  if (active) price = p.unit_price * (1 - p.discount_pct / 100);
  let text = "";
  if (active) {
    const zhe = (100 - p.discount_pct) / 10;
    const zheStr = Number.isInteger(zhe) ? String(zhe) : zhe.toFixed(1);
    text = `限时${zheStr}折` + (until ? ` 至 ${p.discount_until!.slice(0, 10)}` : "");
  }
  return { price: Math.round(price * 1000) / 1000, text };
}
