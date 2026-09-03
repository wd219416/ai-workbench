import crypto from "node:crypto";
import { getSetting } from "../db";

/**
 * 可灵统一鉴权：
 * - 新版单 API Key（kling_ak 填 Key，kling_sk 留空）→ 直接 Bearer
 * - 旧版 ak/sk 双 KEY → HS256 签 JWT（iss=ak, sk 签名）
 * 官方文档：https://klingai.com/document-api/apiReference/commonInfo
 * 新系统调用域名：api-beijing.klingai.com（中国地区）
 */
export function klingAuth(akOv?: string, skOv?: string): { ok: boolean; header?: string; base: string; message?: string } {
  const ak = akOv || getSetting("kling_ak"), sk = skOv || getSetting("kling_sk");
  const base = getSetting("kling_base") || "https://api-beijing.klingai.com";
  if (!ak) return { ok: false, base, message: "未配置可灵 API Key，请到设置页填写（新版单 Key 填 Access Key 一栏即可）" };
  if (!sk) return { ok: true, base, header: `Bearer ${ak}` };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 })).toString("base64url");
  const sig = crypto.createHmac("sha256", sk).update(`${header}.${payload}`).digest("base64url");
  return { ok: true, base, header: `Bearer ${header}.${payload}.${sig}` };
}

/** 可灵错误码翻译成中文 actionable 提示 */
export function klingErrorMsg(status: number, raw: string): string {
  try {
    const d = JSON.parse(raw);
    const code = d?.code, msg = d?.message || "";
    if (code === 1102 || /balance not enough/i.test(msg)) {
      return "可灵账户余额不足：到开发者平台 klingai.com/dev 购买资源包（有免费试用包可领），然后重试";
    }
    if (code === 1101 || status === 401 || status === 403) return `可灵鉴权失败（${msg || status}），请检查 API Key`;
    return `可灵 ${status}: ${msg || raw.slice(0, 150)}`;
  } catch {
    return `可灵 ${status}: ${raw.slice(0, 150)}`;
  }
}
