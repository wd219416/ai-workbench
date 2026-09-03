import fs from "node:fs";
import { getSetting, all } from "../db";
import { klingAuth, klingErrorMsg } from "./kling-auth";
import { liblibConf, liblibSign } from "./liblib";
import { submitLovartChat, pollLovartChat } from "./lovart";

export interface ImageJob {
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  n?: number;
  refImagePath?: string;  // 图生图/实景合成的参考图（服务器本地路径，单引擎单图）
  refImagePaths?: string[]; // 多参考图（产品保真多角度，LOVART attachments 全量生效；其余引擎取第一张）
  loraIds?: number[];     // 套用的 Liblib 本地收藏模型 id（仅 Liblib 引擎生效）
}

export interface EngineReply {
  ok: boolean;
  engine: string;
  engineTaskId?: string;
  status: "submitted" | "needs_key" | "error" | "reserved" | "done";
  message?: string;
  images?: string[]; // 同步引擎（即梦/Seedream）直接返回的图片地址
}

async function submitKling(job: ImageJob): Promise<EngineReply> {
  const auth = klingAuth();
  if (!auth.ok) return { ok: false, engine: "kling", status: "needs_key", message: auth.message };
  const base = auth.base;
  const body: Record<string, unknown> = {
    model: "kling-v2",
    prompt: job.prompt,
    negative_prompt: job.negative || "",
    aspect_ratio: ratioOf(job.width, job.height),
    n: job.n || 1,
  };
  // 图生图/实景合成：参考图以 base64 提交（可灵 kolors 图生图字段）
  if (job.refImagePath && fs.existsSync(job.refImagePath)) {
    const buf = fs.readFileSync(job.refImagePath);
    body.image = buf.toString("base64");
    body.image_reference = "subject"; // 保持参考图主体（产品/标识物/实景结构）
  }
  const res = await fetch(`${base}/v1/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth.header! },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, engine: "kling", status: "error", message: klingErrorMsg(res.status, await res.text()) };
  const data = await res.json();
  return { ok: true, engine: "kling", status: "submitted", engineTaskId: data?.data?.task_id };
}

export async function pollKling(engineTaskId: string): Promise<{ status: string; images?: string[]; message?: string }> {
  const auth = klingAuth();
  if (!auth.ok) return { status: "error", message: auth.message };
  const res = await fetch(`${auth.base}/v1/images/generations/${engineTaskId}`, {
    headers: { Authorization: auth.header! },
  });
  if (!res.ok) return { status: "error", message: `可灵查询 ${res.status}` };
  const data = await res.json();
  const st = data?.data?.task_status; // submitted / processing / succeed / failed
  const images = data?.data?.task_result?.images?.map((i: { url: string }) => i.url);
  return { status: st === "succeed" ? "done" : st === "failed" ? "failed" : "processing", images, message: data?.data?.task_status_msg };
}

/** LOVART：提交出图（模型软偏好走 lovart.ts 的 submitLovartChat，tool_config=IMAGE）
 *  产品保真：refImagePaths 多角度参考图全部上传为 attachments；无多图时回退 refImagePath 单图 */
async function submitLovart(job: ImageJob): Promise<EngineReply> {
  const paths = job.refImagePaths?.length ? job.refImagePaths : job.refImagePath ? [job.refImagePath] : [];
  const r = await submitLovartChat("IMAGE", job.prompt, { paths });
  if (!r.ok) {
    const needsKey = r.message?.includes("未配置 LOVART 双KEY");
    return { ok: false, engine: "lovart", status: needsKey ? "needs_key" : "error", message: r.message };
  }
  return { ok: true, engine: "lovart", status: "submitted", engineTaskId: r.threadId! };
}

export async function pollLovart(engineTaskId: string): Promise<{ status: string; images?: string[]; message?: string }> {
  const r = await pollLovartChat(engineTaskId);
  return { status: r.status, images: r.images, message: r.message };
}

/** 通义万相（阿里百炼 DashScope 异步任务，直接用百炼 KEY） */
function wxKey(): string { return getSetting("wanxiang_key") || getSetting("qwen_key"); }

async function submitWanxiang(job: ImageJob): Promise<EngineReply> {
  const key = wxKey();
  if (!key) return { ok: false, engine: "wanxiang", status: "needs_key", message: "未配置阿里百炼 KEY（设置页填 qwen_key 或 wanxiang_key）" };
  const model = getSetting("wanxiang_model") || "wanx2.1-t2i-turbo";
  const clamp = (v?: number) => Math.min(1440, Math.max(512, Math.round(v || 1024)));
  const res = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-DashScope-Async": "enable" },
    body: JSON.stringify({
      model,
      input: { prompt: job.prompt, negative_prompt: job.negative || "" },
      parameters: { size: `${clamp(job.width)}*${clamp(job.height)}`, n: Math.min(job.n || 1, 4) },
    }),
  });
  if (!res.ok) return { ok: false, engine: "wanxiang", status: "error", message: `万相 ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  return { ok: true, engine: "wanxiang", status: "submitted", engineTaskId: data?.output?.task_id };
}

export async function pollWanxiang(taskId: string): Promise<{ status: string; images?: string[]; message?: string }> {
  const key = wxKey();
  const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { status: "error", message: `万相查询 ${res.status}` };
  const data = await res.json();
  const st = data?.output?.task_status; // PENDING / RUNNING / SUCCEEDED / FAILED
  const images = data?.output?.results?.map((r: { url: string }) => r.url);
  return { status: st === "SUCCEEDED" ? "done" : st === "FAILED" ? "failed" : "processing", images, message: data?.output?.message };
}

/** LiblibAI 开放平台（openapi.liblibai.cloud）—— 2026-09-03 已用真实 Key 实测跑通：
 *  - 鉴权：查询参数 AccessKey + Signature + Timestamp + SignatureNonce
 *  - 签名：HMAC-SHA1(sk, "{uri}&{ts_ms}&{nonce}")，base64url 去 padding
 *  - 文生图：POST /api/generate/webui/text2img，body { templateUuid, generateParams{ prompt, width, height, steps, cfgScale, seed, imgCount, checkPointId? } }
 *    返回 data.generateUuid（不是 task_id）
 *  - 图生图：POST /api/generate/webui/img2img，参考图先上传拿 URL 再填 generateParams.sourceImage
 *    （必填：sourceImage + resizeMode + resizedWidth + resizedHeight + denoisingStrength）
 *  - 参考图上传：POST /api/generate/upload/signature 拿 OSS 直传签名 → FormData 直传阿里云 OSS → 拼 URL
 *    （签名接口返回驼峰 xOss* 字段，官方 SDK 误写小写 xoss*，是个坑）
 *  - 轮询：POST /api/generate/webui/status，body { generateUuid }
 *    返回 data.generateStatus：2=处理中，5=成功，6/7=失败；成功图在 data.images[].imageUrl
 *  - 计费：任务完成后 data.pointsCost / data.accountBalance 返回积分消耗与余额
 *  - 模板 UUID：文生图 e10adc3949ba59abbe56e057f20f883e；图生图 9c7d531dc75f476aa833b3d452b8f7ad
 *    ultra 文生图 5d7e67009b344550bc1aa6ccbfa1d7f4；ultra 图生图 07e00af4fc464c7ab55ff906f8acf1b7 */

/** 参考图上传到 Liblib OSS（图生图用），返回公开图片 URL。
 *  官方流程：POST /api/generate/upload/signature 拿 OSS 直传签名 → FormData 直传阿里云 OSS → 拼 URL。
 *  注意：签名接口返回的是驼峰 xOss* 字段（官方 SDK 误写为小写 xoss*，照抄会全填 undefined）。 */
async function liblibUpload(filePath: string): Promise<string> {
  const { ak, sk, base } = liblibConf();
  const filename = filePath.split(/[\\/]/).pop() || "ref.png";
  const dot = filename.lastIndexOf(".");
  const name = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot + 1) : "png";

  // 1) 拿 OSS 直传签名
  const sigPath = "/api/generate/upload/signature";
  const sq = new URLSearchParams(liblibSign(sigPath, ak, sk)).toString();
  const sr = await fetch(`${base}${sigPath}?${sq}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, extension }),
    signal: AbortSignal.timeout(30000),
  });
  const sdata = await sr.json().catch(() => ({}));
  if (!sr.ok || (sdata?.code !== undefined && sdata?.code !== 0)) {
    throw new Error(`上传签名失败: ${sdata?.msg || sr.status}`);
  }
  const sd = sdata?.data ?? {};
  if (!sd?.postUrl) throw new Error("上传签名未返回 postUrl");

  // 2) FormData 直传 OSS（字段名是驼峰 xOss*）
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("x-oss-signature", sd.xOssSignature as string);
  form.append("x-oss-date", sd.xOssDate as string);
  form.append("x-oss-signature-version", sd.xOssSignatureVersion as string);
  form.append("policy", sd.policy as string);
  form.append("key", sd.key as string);
  form.append("x-oss-credential", sd.xOssCredential as string);
  form.append("x-oss-expires", String(sd.xOssExpires));
  form.append("file", new Blob([new Uint8Array(buf)], { type: `image/${extension}` }), filename);
  const ur = await fetch(sd.postUrl as string, {
    method: "POST", body: form, signal: AbortSignal.timeout(60000),
  });
  if (!ur.ok) throw new Error(`OSS 上传失败 ${ur.status}`);
  return new URL(sd.key as string, sd.postUrl as string).toString();
}

/** 根据本地收藏的 Liblib 模型 id，组装 additionalNetwork / checkPointId。
 *  - LoRA 最多 5 个，超出的截断；禁商用(forbidden)模型跳过。
 *  - checkpoint 型模型作为底模 checkPointId（优先于设置页默认底模）。 */
function buildLiblibNetworks(ids?: number[]): {
  additionalNetwork?: { modelId: string; weight: number }[];
  checkPointId?: string;
} {
  if (!ids?.length) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = all<{ id: number; version_uuid: string; kind: string; weight: number; license: string; name: string }>(
    `SELECT id, version_uuid, kind, weight, license, name FROM liblib_models WHERE id IN (${placeholders})`,
    ...ids
  );
  const additionalNetwork: { modelId: string; weight: number }[] = [];
  let checkPointId = "";
  for (const r of rows) {
    if (r.license === "forbidden") continue;
    if (r.kind === "checkpoint") {
      if (!checkPointId) checkPointId = r.version_uuid;
    } else {
      additionalNetwork.push({ modelId: r.version_uuid, weight: r.weight });
    }
  }
  if (additionalNetwork.length > 5) additionalNetwork.length = 5;
  return {
    additionalNetwork: additionalNetwork.length ? additionalNetwork : undefined,
    checkPointId: checkPointId || undefined,
  };
}

async function submitLiblib(job: ImageJob): Promise<EngineReply> {
  const { ak, sk, base } = liblibConf();
  if (!ak || !sk) return { ok: false, engine: "liblib", status: "needs_key", message: "未配置 LiblibAI 双KEY，请到设置页填写（企业认证后获取）" };
  const clamp = (v?: number) => Math.min(2048, Math.max(512, Math.round(v || 1024)));
  const checkPointIdSetting = getSetting("liblib_model") || "";
  const nets = buildLiblibNetworks(job.loraIds);

  // 有参考图 → 图生图；否则文生图
  const isI2i = !!job.refImagePath && fs.existsSync(job.refImagePath);
  const path = isI2i ? "/api/generate/webui/img2img" : "/api/generate/webui/text2img";
  const q = new URLSearchParams(liblibSign(path, ak, sk)).toString();
  const templateUuid = isI2i
    ? getSetting("liblib_i2i_template") || "9c7d531dc75f476aa833b3d452b8f7ad"
    : getSetting("liblib_template") || "e10adc3949ba59abbe56e057f20f883e";

  const gp: Record<string, unknown> = {
    prompt: job.prompt,
    width: clamp(job.width),
    height: clamp(job.height),
    steps: 20,
    cfgScale: 7,
    seed: -1,
    imgCount: Math.min(job.n || 1, 4),
  };
  // 底模优先级：收藏库里的 checkpoint > 设置页默认底模
  if (nets.checkPointId) gp.checkPointId = nets.checkPointId;
  else if (checkPointIdSetting) gp.checkPointId = checkPointIdSetting;
  if (job.negative) gp.negativePrompt = job.negative;
  if (nets.additionalNetwork) gp.additionalNetwork = nets.additionalNetwork;

  try {
    if (isI2i) {
      // 参考图上传拿 URL，填 sourceImage + 重绘参数
      const src = await liblibUpload(job.refImagePath!);
      const denoise = parseFloat(getSetting("liblib_denoise") || "0.6") || 0.6;
      gp.sourceImage = src;
      gp.resizeMode = 0; // 0=拉伸 1=裁剪 2=填充
      gp.resizedWidth = clamp(job.width);
      gp.resizedHeight = clamp(job.height);
      gp.denoisingStrength = Math.min(0.95, Math.max(0.1, denoise));
    }
    const res = await fetch(`${base}${path}?${q}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateUuid, generateParams: gp }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    const code = data?.code;
    if (!res.ok || (code !== undefined && code !== 0)) {
      return { ok: false, engine: "liblib", status: "error", message: `LiblibAI ${res.status} code=${code} ${String(data?.msg || data?.message || "").slice(0, 120)}` };
    }
    const uuid = data?.data?.generateUuid || data?.generateUuid;
    if (!uuid) return { ok: false, engine: "liblib", status: "error", message: "LiblibAI 未返回 generateUuid（参数未过校验，检查模板/底模/提示词）" };
    return { ok: true, engine: "liblib", status: "submitted", engineTaskId: String(uuid) };
  } catch (e) {
    return { ok: false, engine: "liblib", status: "error", message: `LiblibAI: ${(e as Error).message.slice(0, 160)}` };
  }
}

export async function pollLiblib(uuid: string): Promise<{ status: string; images?: string[]; message?: string }> {
  const { ak, sk, base } = liblibConf();
  const path = "/api/generate/webui/status";
  const q = new URLSearchParams(liblibSign(path, ak, sk)).toString();
  try {
    const res = await fetch(`${base}${path}?${q}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generateUuid: uuid }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    const d = data?.data ?? data;
    const st = d?.generateStatus;
    // generateStatus: 2=处理中 5=成功 6/7=失败
    if (st === 6 || st === 7) return { status: "failed", message: String(d?.generateMsg || d?.msg || "任务失败") };
    if (st === 5) {
      const images: string[] = [];
      const arr = d?.images || [];
      if (Array.isArray(arr)) {
        for (const it of arr) {
          const url = it?.imageUrl || (typeof it === "string" ? it : undefined);
          if (url) images.push(String(url));
        }
      }
      return images.length ? { status: "done", images } : { status: "processing" };
    }
    return { status: "processing" };
  } catch (e) {
    return { status: "error", message: `LiblibAI查询: ${(e as Error).message.slice(0, 120)}` };
  }
}

/** 即梦 / Seedream（火山方舟 ARK，OpenAI 兼容接口，同步返回） */
async function submitJimeng(job: ImageJob): Promise<EngineReply> {
  const key = getSetting("jimeng_key");
  const base = getSetting("jimeng_base") || "https://ark.cn-beijing.volces.com/api/v3";
  const model = getSetting("jimeng_model") || "doubao-seedream-4-0-250828";
  if (!key) return { ok: false, engine: "jimeng", status: "needs_key", message: "未配置火山方舟 KEY（设置页 jimeng_key）" };
  const clamp = (v?: number) => Math.min(4096, Math.max(512, Math.round(v || 1024)));
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      prompt: job.negative ? `${job.prompt}。避免：${job.negative}` : job.prompt,
      size: `${clamp(job.width)}x${clamp(job.height)}`,
      response_format: "url",
      watermark: false,
    }),
  });
  if (!res.ok) return { ok: false, engine: "jimeng", status: "error", message: `即梦 ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  const images = (data?.data || []).map((d: { url?: string }) => d.url).filter(Boolean);
  if (!images.length) return { ok: false, engine: "jimeng", status: "error", message: "即梦未返回图片" };
  return { ok: true, engine: "jimeng", status: "done", images };
}

/** ComfyUI：预留适配器。填好地址+workflow 模板即可启用 */
async function submitComfyUI(job: ImageJob): Promise<EngineReply> {
  const url = getSetting("comfyui_local_url");
  const wf = getSetting("comfyui_workflow");
  if (!wf) return { ok: false, engine: "comfyui", status: "reserved", message: "ComfyUI 接口已预留：在设置页填 workflow JSON 模板后启用" };
  const workflow = JSON.parse(wf.replaceAll("{{prompt}}", job.prompt));
  const res = await fetch(`${url}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) return { ok: false, engine: "comfyui", status: "error", message: `ComfyUI ${res.status}` };
  const data = await res.json();
  return { ok: true, engine: "comfyui", status: "submitted", engineTaskId: data?.prompt_id };
}

/** ComfyUI 轮询：/history/{prompt_id} 取输出图，拼 /view 下载地址 */
export async function pollComfyUI(promptId: string): Promise<{ status: string; images?: string[]; message?: string }> {
  const url = getSetting("comfyui_local_url") || getSetting("comfyui_cloud_url");
  if (!url) return { status: "error", message: "未配置 ComfyUI 地址" };
  const res = await fetch(`${url}/history/${promptId}`);
  if (!res.ok) return { status: "processing" };
  const h = await res.json();
  const item = h?.[promptId];
  if (!item) return { status: "processing" };
  if (item.status?.status_str === "error") return { status: "failed", message: "ComfyUI 执行出错" };
  const images: string[] = [];
  const outs = Object.values(item.outputs || {}) as { images?: { filename: string; subfolder?: string; type?: string }[] }[];
  for (const out of outs) {
    for (const img of out.images || []) {
      images.push(`${url}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${img.type || "output"}`);
    }
  }
  return images.length ? { status: "done", images } : { status: "processing" };
}

function ratioOf(w?: number, h?: number): string {
  if (!w || !h) return "1:1";
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

export async function submitImage(engine: string, job: ImageJob): Promise<EngineReply> {
  switch (engine) {
    case "kling": return submitKling(job);
    case "lovart": return submitLovart(job);
    case "wanxiang": return submitWanxiang(job);
    case "jimeng": return submitJimeng(job);
    case "liblib": return submitLiblib(job);
    case "comfyui": return submitComfyUI(job);
    default:
      return { ok: false, engine, status: "error", message: `未知引擎 ${engine}` };
  }
}

export async function pollImage(engine: string, engineTaskId: string) {
  if (engine === "kling") return pollKling(engineTaskId);
  if (engine === "lovart") return pollLovart(engineTaskId);
  if (engine === "wanxiang") return pollWanxiang(engineTaskId);
  if (engine === "liblib") return pollLiblib(engineTaskId);
  if (engine === "comfyui") return pollComfyUI(engineTaskId);
  return { status: "processing" as const };
}
