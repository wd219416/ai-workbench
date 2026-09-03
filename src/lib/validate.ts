/**
 * 付费前参数硬校验 —— 出图 / 视频提交入口统一守门
 *
 * 真实计费场景，非法参数在进入引擎适配器之前就拒绝（返回 400，不落库、不触发付费）。
 * 引擎合法性白名单从 registry 派生，加新引擎自动纳入校验。
 */

import { ENGINES } from "./engines/registry";

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === undefined || v === null || v === "" || Number.isNaN(n) ? undefined : n;
};

/** 取整并夹到 [min, max]，缺省返回 def */
const clampInt = (v: unknown, min: number, max: number, def: number): number => {
  const n = num(v);
  if (n === undefined) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export interface ValidateResult<T> {
  ok: boolean;
  error?: string;
  cleaned?: T;
}

export interface CleanedImage {
  prompt: string;
  negative: string;
  width?: number;
  height?: number;
  n: number;
}

export interface CleanedVideo {
  prompt: string;
  duration: number;
  ratio: string;
}

export function validateImage(body: Record<string, unknown>): ValidateResult<CleanedImage> {
  const engine = String(body.engine ?? "");
  if (!ENGINES.some((e) => e.code === engine && e.kinds.includes("image"))) {
    return { ok: false, error: `未知出图引擎：${engine || "（未选）"}` };
  }
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "缺提示词" };
  if (prompt.length > 2000) return { ok: false, error: "提示词过长（≤2000 字）" };
  const negative = String(body.negative ?? "").slice(0, 1000);
  const n = clampInt(body.n, 1, 9, 1);
  // 尺寸仅做范围收敛；0/未填保持缺省，交由引擎适配器内部按比例/默认处理
  const w = num(body.width);
  const h = num(body.height);
  const width = w && w > 0 ? Math.min(4096, Math.max(256, Math.round(w))) : undefined;
  const height = h && h > 0 ? Math.min(4096, Math.max(256, Math.round(h))) : undefined;
  return { ok: true, cleaned: { prompt, negative, width, height, n } };
}

export function validateVideo(body: Record<string, unknown>): ValidateResult<CleanedVideo> {
  const engine = String(body.engine ?? "");
  if (!ENGINES.some((e) => e.code === engine && e.kinds.includes("video"))) {
    return { ok: false, error: `未知视频引擎：${engine || "（未选）"}` };
  }
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "缺提示词" };
  if (prompt.length > 2000) return { ok: false, error: "提示词过长（≤2000 字）" };
  const duration = clampInt(body.duration, 1, 16, 5);
  const ratio = ["16:9", "9:16", "1:1", "3:4", "4:3"].includes(String(body.ratio)) ? String(body.ratio) : "9:16";
  return { ok: true, cleaned: { prompt, duration, ratio } };
}
