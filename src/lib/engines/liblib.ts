import crypto from "node:crypto";
import { getSetting } from "../db";

export function liblibConf() {
  return {
    ak: getSetting("liblib_ak"), sk: getSetting("liblib_sk"),
    base: (getSetting("liblib_base") || "https://openapi.liblibai.cloud").replace(/\/$/, ""),
  };
}

export function liblibSign(uri: string, ak: string, sk: string): Record<string, string> {
  const ts = String(Date.now()); // 毫秒
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const sig = crypto.createHmac("sha1", sk).update(`${uri}&${ts}&${nonce}`).digest("base64url");
  return { AccessKey: ak, Signature: sig, Timestamp: ts, SignatureNonce: nonce };
}

/** 通过 versionUuid 查询 Liblib 模型版本参数（用于收藏模型时自动补全元数据） */
export async function liblibFetchModel(versionUuid: string): Promise<{
  versionUuid?: string;
  modelName?: string;
  versionName?: string;
  baseAlgo?: string;
  baseAlgoName?: string;
  commercialUse?: string;
  modelUrl?: string;
}> {
  const { ak, sk, base } = liblibConf();
  if (!ak || !sk) throw new Error("未配置 LiblibAI 双KEY");
  const path = "/api/model/version/get";
  const q = new URLSearchParams(liblibSign(path, ak, sk)).toString();
  const res = await fetch(`${base}${path}?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionUuid }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data?.code !== undefined && data?.code !== 0)) {
    throw new Error(data?.msg || data?.message || `查询失败 ${res.status}`);
  }
  return data?.data || {};
}
