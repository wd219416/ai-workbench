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
  ckpt?: string;          // ComfyUI 底模文件名（替换 {{ckpt}} 占位符；缺省用设置页 comfyui_ckpt）
  comfyLoras?: { name: string; weight: number }[]; // ComfyUI 本地 LoRA（文件名 + 权重，仅 ComfyUI 引擎生效）
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
  const refPath = job.refImagePath && fs.existsSync(job.refImagePath) ? job.refImagePath : job.refImagePaths?.find((p) => p && fs.existsSync(p));
  // 产品保真（2026-09-03 接入）：有参考图时走万相图像编辑（wanx2.1-imageedit），
  // 原图为锚只改 prompt 描述的部分（换背景/重打光/风格化），异步任务复用 pollWanxiang。
  if (refPath) {
    const model = getSetting("wanxiang_edit_model") || "wanx2.1-imageedit";
    const ext = refPath.toLowerCase().endsWith(".jpg") || refPath.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png";
    const dataUri = `data:image/${ext};base64,${fs.readFileSync(refPath).toString("base64")}`;
    const res = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-DashScope-Async": "enable" },
      body: JSON.stringify({
        model,
        // function 必填（实测枚举）：description_edit=描述编辑（换背景/重打光等跟随 prompt）、
        // stylization_all/local=风格化、description_edit_with_mask=蒙版局部重绘、expand=扩图、super_resolution=超分
        input: { function: "description_edit", prompt: job.prompt, base_image_url: dataUri },
        parameters: { n: Math.min(job.n || 1, 4) },
      }),
    });
    if (!res.ok) return { ok: false, engine: "wanxiang", status: "error", message: `万相图编辑 ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json();
    return { ok: true, engine: "wanxiang", status: "submitted", engineTaskId: data?.output?.task_id };
  }
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
 *  - checkpoint 型模型作为底模 checkPointId（优先于设置页默认底模）。
 *  - baseAlgo：所有 LoRA / checkpoint 的底模归一化（FLUX / SDXL / SD1.5 / V2 / Pony 等），
 *    用于 submitLiblib 自动选择匹配的 webui 模板（SDXL 经典模板 / FLUX.1 ultra 模板）。 */
function buildLiblibNetworks(ids?: number[]): {
  additionalNetwork?: { modelId: string; weight: number }[];
  checkPointId?: string;
  baseAlgo?: string;
} {
  if (!ids?.length) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = all<{ id: number; version_uuid: string; kind: string; weight: number; license: string; name: string; base_algo: string }>(
    `SELECT id, version_uuid, kind, weight, license, name, base_algo FROM liblib_models WHERE id IN (${placeholders})`,
    ...ids
  );
  const additionalNetwork: { modelId: string; weight: number }[] = [];
  let checkPointId = "";
  const baseAlgos: string[] = [];
  for (const r of rows) {
    if (r.license === "forbidden") continue;
    if (r.base_algo) baseAlgos.push(r.base_algo);
    if (r.kind === "checkpoint") {
      if (!checkPointId) checkPointId = r.version_uuid;
    } else {
      additionalNetwork.push({ modelId: r.version_uuid, weight: r.weight });
    }
  }
  if (additionalNetwork.length > 5) additionalNetwork.length = 5;
  // 底模归一化：取第一个 LoRA/checkpoint 的 baseAlgo（多 LoRA 应保持同底模）
  return {
    additionalNetwork: additionalNetwork.length ? additionalNetwork : undefined,
    checkPointId: checkPointId || undefined,
    baseAlgo: baseAlgos[0] || undefined,
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
  // 底模归一化：FLUX.1 / F.1 → ultra 模板；其它 → SDXL 经典模板
  const algo = (nets.baseAlgo || "").toUpperCase();
  const isFlux = algo.includes("FLUX") || algo === "F.1" || algo === "F1";
  const path = isI2i ? "/api/generate/webui/img2img" : "/api/generate/webui/text2img";
  const q = new URLSearchParams(liblibSign(path, ak, sk)).toString();
  // 模板 UUID：SDXL 经典 (e10adc.../9c7d531d...) vs FLUX.1 ultra (5d7e6700.../07e00af4...)
  // 可在设置页通过 liblib_template / liblib_i2i_template 覆盖；FLUX 系列用独立 key 防止误改
  const templateUuid = isI2i
    ? isFlux
      ? getSetting("liblib_i2i_template_flux") || "07e00af4fc464c7ab55ff906f8acf1b7"
      : getSetting("liblib_i2i_template") || "9c7d531dc75f476aa833b3d452b8f7ad"
    : isFlux
      ? getSetting("liblib_template_flux") || "5d7e67009b344550bc1aa6ccbfa1d7f4"
      : getSetting("liblib_template") || "e10adc3949ba59abbe56e057f20f883e";

  const gp: Record<string, unknown> = {
    prompt: job.prompt,
    width: clamp(job.width),
    height: clamp(job.height),
    // FLUX.1 ultra 推荐 cfgScale=3~3.5 / steps=25；SDXL 经典 cfgScale=7 / steps=20
    steps: isFlux ? 25 : 20,
    cfgScale: isFlux ? 3.5 : 7,
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

/** Liblib ComfyUI 云端工作流（开放平台「发布 AI 应用」路径，2026-09-03 预建）
 *  与 webui 路径的差异：POST /api/generate/comfyui/app，generateParams 是「节点 ID 为键」
 *  的 Liblib 变体 API JSON——工作流必须先在 Liblib「发布为 AI 应用」拿 templateUuid/workflowUuid，
 *  模型引用为 Liblib 站内模型 UUID（与本地 ComfyUI 工作流 JSON 不互通，需人工替换后录入）。
 *  鉴权与 webui 完全一致：复用 liblib 双 KEY（liblibConf/liblibSign），无需重复配置。
 *  占位符：{{prompt}} {{negative}} {{width}} {{height}} {{seed}} {{steps}} {{n}} {{img_url}}
 *  - {{img_url}} 需配合参考图：先上传 Liblib OSS 拿公网 URL（LoadImage 节点用），再替换
 *  - 工作流 JSON 支持两种粘贴格式：整段 API 配置（含 templateUuid/generateParams 外壳）或裸 generateParams
 *  轮询：comfyui/app 任务实测可用 webui/status 查询（astrbot 插件验证过响应结构一致：
 *  generateStatus 2=处理中 5=成功 6/7=失败，图在 data.images[].imageUrl）；
 *  这里优先官方 comfy/status 端点，异常/结构不符自动回退 webui/status。 */
async function submitLiblibComfy(job: ImageJob): Promise<EngineReply> {
  const { ak, sk, base } = liblibConf();
  if (!ak || !sk) return { ok: false, engine: "liblibcomfy", status: "needs_key", message: "未配置 LiblibAI 双KEY（本引擎复用 LiblibAI 分组的 AccessKey/SecretKey，请到上面填写）" };
  const templateUuid = getSetting("liblibcomfy_template");
  const wfTpl = getSetting("liblibcomfy_workflow");
  if (!templateUuid) return { ok: false, engine: "liblibcomfy", status: "needs_key", message: "未填写 templateUuid——工作流在 Liblib「发布为 AI 应用」后，从应用详情页的 API 配置 JSON 里复制" };
  if (!wfTpl) return { ok: false, engine: "liblibcomfy", status: "needs_key", message: "未填写工作流 API 配置 JSON（Liblib 应用详情页复制，把提示词/尺寸等值改成占位符：{{prompt}}/{{width}}/{{height}}/{{seed}}/{{steps}}/{{n}}/{{img_url}}）" };

  const esc = (s: string) => JSON.stringify(s).slice(1, -1);
  const seed = Math.floor(Math.random() * 2147483647);
  const steps = parseInt(getSetting("liblibcomfy_steps") || "20", 10) || 20;

  // {{img_url}}：参考图先上传 Liblib OSS 拿公网 URL（模板含占位符但没图 → 提前报错）
  let imgUrl = "";
  if (wfTpl.includes("{{img_url}}")) {
    const refPath = job.refImagePaths?.length ? job.refImagePaths[0] : job.refImagePath;
    if (refPath && fs.existsSync(refPath)) {
      try { imgUrl = await liblibUpload(refPath); } catch (e) {
        return { ok: false, engine: "liblibcomfy", status: "error", message: `参考图上传失败：${(e as Error).message.slice(0, 140)}` };
      }
    }
    if (!imgUrl) return { ok: false, engine: "liblibcomfy", status: "error", message: "工作流含 {{img_url}} 占位符（LoadImage 节点）但本次未提供参考图" };
  }

  const wfJson = wfTpl
    .replaceAll("{{width}}", String(job.width || 1024))
    .replaceAll("{{height}}", String(job.height || 1024))
    .replaceAll("{{seed}}", String(seed))
    .replaceAll("{{steps}}", String(steps))
    .replaceAll("{{n}}", String(Math.min(job.n || 1, 4)))
    .replaceAll("{{prompt}}", esc(job.prompt || ""))
    .replaceAll("{{negative}}", esc(job.negative || ""))
    .replaceAll("{{img_url}}", esc(imgUrl));
  let parsed: Record<string, any>;
  try { parsed = JSON.parse(wfJson); } catch (e) {
    return { ok: false, engine: "liblibcomfy", status: "error", message: `工作流 JSON 解析失败（占位符替换后）：${(e as Error).message.slice(0, 160)}` };
  }

  // 兼容两种粘贴格式：整段 API 配置（含 templateUuid/generateParams 外壳）/ 裸 generateParams（含可选 workflowUuid）
  let reqBody: Record<string, unknown>;
  if (parsed?.templateUuid && parsed?.generateParams && typeof parsed.generateParams === "object") {
    reqBody = { templateUuid: parsed.templateUuid, generateParams: parsed.generateParams };
  } else {
    const { workflowUuid, ...nodes } = parsed;
    reqBody = { templateUuid, generateParams: { ...(workflowUuid ? { workflowUuid: String(workflowUuid) } : {}), ...nodes } };
  }

  const path = "/api/generate/comfyui/app";
  const q = new URLSearchParams(liblibSign(path, ak, sk)).toString();
  try {
    const res = await fetch(`${base}${path}?${q}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    const code = data?.code;
    if (!res.ok || (code !== undefined && code !== 0)) {
      return { ok: false, engine: "liblibcomfy", status: "error", message: `Liblib ComfyUI ${res.status} code=${code} ${String(data?.msg || data?.message || "").slice(0, 120)}` };
    }
    const uuid = data?.data?.generateUuid || data?.generateUuid;
    if (!uuid) return { ok: false, engine: "liblibcomfy", status: "error", message: "未返回 generateUuid（检查 templateUuid/workflowUuid 是否匹配，或该工作流未开通 API 服务）" };
    return { ok: true, engine: "liblibcomfy", status: "submitted", engineTaskId: String(uuid) };
  } catch (e) {
    return { ok: false, engine: "liblibcomfy", status: "error", message: `Liblib ComfyUI: ${(e as Error).message.slice(0, 160)}` };
  }
}

/** Liblib ComfyUI 轮询：优先 comfy/status，异常回退 webui/status（两者响应结构一致） */
export async function pollLiblibComfy(uuid: string): Promise<{ status: string; images?: string[]; message?: string }> {
  const { ak, sk, base } = liblibConf();
  const path = "/api/generate/comfy/status";
  const q = new URLSearchParams(liblibSign(path, ak, sk)).toString();
  try {
    const res = await fetch(`${base}${path}?${q}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generateUuid: uuid }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const d = data?.data ?? data;
      const st = d?.generateStatus;
      if (st !== undefined || Array.isArray(d?.images)) {
        if (st === 6 || st === 7) return { status: "failed", message: String(d?.generateMsg || d?.msg || "任务失败") };
        if (st === 5 || Array.isArray(d?.images)) {
          const images: string[] = [];
          for (const it of (d?.images || [])) {
            const url = it?.imageUrl || (typeof it === "string" ? it : undefined);
            if (url) images.push(String(url));
          }
          if (images.length) return { status: "done", images };
        }
        return { status: "processing" };
      }
    }
  } catch { /* 端点不可用，回退 webui/status */ }
  return pollLiblib(uuid);
}

/** 即梦 / Seedream（火山方舟 ARK，OpenAI 兼容接口，同步返回）
 *  产品保真（2026-09-03 接入）：有参考图时走图生图——Seedream 4.0 支持多张参考图
 *  （最多 10 张，公网 URL 或 base64 data URI，body.image 数组），主体外观/材质/颜色
 *  以参考图为锚，prompt 只描述背景/场景/光影，实现「产品不重绘」。
 *  strength 为重绘幅度（0-1）：值越低越贴近参考图，0.5 平衡保真与出效果。 */
async function submitJimeng(job: ImageJob): Promise<EngineReply> {
  const key = getSetting("jimeng_key");
  const base = getSetting("jimeng_base") || "https://ark.cn-beijing.volces.com/api/v3";
  const model = getSetting("jimeng_model") || "doubao-seedream-4-0-250828";
  if (!key) return { ok: false, engine: "jimeng", status: "needs_key", message: "未配置火山方舟 KEY（设置页 jimeng_key）" };
  const clamp = (v?: number) => Math.min(4096, Math.max(512, Math.round(v || 1024)));
  const refPaths = (job.refImagePaths?.length ? job.refImagePaths : job.refImagePath ? [job.refImagePath] : [])
    .filter((p) => p && fs.existsSync(p))
    .slice(0, 10); // Seedream 4.0 参考图上限
  const body: Record<string, unknown> = {
    model,
    prompt: job.negative ? `${job.prompt}。避免：${job.negative}` : job.prompt,
    size: `${clamp(job.width)}x${clamp(job.height)}`,
    response_format: "url",
    watermark: false,
  };
  if (refPaths.length) {
    // 参考图转 base64 data URI（方舟 images/generations 接受 URL 或 data URI）
    const ext = (p: string) => (p.toLowerCase().endsWith(".jpg") || p.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png");
    body.image = refPaths.map((p) => `data:image/${ext(p)};base64,${fs.readFileSync(p).toString("base64")}`);
    body.strength = 0.5; // 重绘幅度：低=保真。产品保真场景建议配合「锁定声明」提示词
  }
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, engine: "jimeng", status: "error", message: `即梦 ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  const images = (data?.data || []).map((d: { url?: string }) => d.url).filter(Boolean);
  if (!images.length) return { ok: false, engine: "jimeng", status: "error", message: "即梦未返回图片" };
  return { ok: true, engine: "jimeng", status: "done", images };
}

/** ComfyUI 工作流（本地/云端 HTTP API）
 *  占位符（全部可选，模板里有就替换，没有就跳过）：
  - {{prompt}}    正向提示词（JSON 转义防破）
  - {{negative}}  负向提示词（无则空串）
  - {{width}} {{height}} 出图尺寸（默认 768×768）
  - {{seed}}      随机种子（每次任务随机）
  - {{n}}         生成数量 batch_size（默认 1）
 *  本地默认走 comfyui_local_url；云端走 comfyui_cloud_url；都空则返回 needs_key。 */
/** 往 ComfyUI workflow 里动态插入 LoRA 节点。
 *  通用算法：按 class_type 找 CheckpointLoaderSimple，把它的 MODEL/CLIP 输出依次串进 N 个
 *  LoraLoader 节点，最后把下游节点的 model/clip 输入重连到最后一个 LoRA 的输出。
 *  对不含 CheckpointLoaderSimple 的 workflow（如 FLUX 的 UNETLoader）安全跳过。 */
function injectComfyLoras(workflow: Record<string, any>, loras: { name: string; weight: number }[]) {
  if (!loras?.length) return;
  const entries = Object.entries(workflow);
  const ckptEntry = entries.find(([, n]) => n?.class_type === "CheckpointLoaderSimple");
  if (!ckptEntry) return;
  const [ckptId] = ckptEntry;

  let nextId = entries.reduce((m, [k]) => Math.max(m, Number(k) || 0), 99) + 1;
  let modelSrc: [string, number] = [ckptId, 0];
  let clipSrc: [string, number] = [ckptId, 1];
  for (const lora of loras) {
    const id = String(nextId++);
    workflow[id] = {
      class_type: "LoraLoader",
      inputs: {
        model: [...modelSrc],
        clip: [...clipSrc],
        lora_name: lora.name,
        strength_model: lora.weight,
        strength_clip: lora.weight,
      },
    };
    modelSrc = [id, 0];
    clipSrc = [id, 1];
  }
  // 重连所有引用 checkpoint MODEL/CLIP 输出的下游节点（KSampler.model / CLIPTextEncode.clip 等）
  for (const [, node] of entries) {
    if (!node?.inputs) continue;
    if (Array.isArray(node.inputs.model) && node.inputs.model[0] === ckptId) node.inputs.model = [...modelSrc];
    if (Array.isArray(node.inputs.clip) && node.inputs.clip[0] === ckptId) node.inputs.clip = [...clipSrc];
  }
}

async function submitComfyUI(job: ImageJob): Promise<EngineReply> {
  const localUrl = getSetting("comfyui_local_url");
  const cloudUrl = getSetting("comfyui_cloud_url");
  const wfTpl = getSetting("comfyui_workflow");
  const url = cloudUrl || localUrl;
  if (!url) return { ok: false, engine: "comfyui", status: "needs_key", message: "未配置 ComfyUI 地址（设置页 comfyui_local_url 或 comfyui_cloud_url）" };
  if (!wfTpl) return { ok: false, engine: "comfyui", status: "needs_key", message: "未配置 ComfyUI workflow 模板（设置页 comfyui_workflow 粘贴一份 Save (API Format) 的 JSON）" };

  // 占位符替换：数值占位符直接替换，字符串占位符做 JSON 转义防破
  const esc = (s: string) => JSON.stringify(s).slice(1, -1); // 去掉外层引号，留内部内容
  const seed = Math.floor(Math.random() * 2147483647);
  const w = job.width || 768;
  const h = job.height || 768;
  const n = Math.min(job.n || 1, 4);
  const ckpt = esc(job.ckpt || getSetting("comfyui_ckpt") || "");
  const wfJson = wfTpl
    .replaceAll("{{width}}", String(w))
    .replaceAll("{{height}}", String(h))
    .replaceAll("{{seed}}", String(seed))
    .replaceAll("{{n}}", String(n))
    .replaceAll("{{ckpt}}", ckpt)
    .replaceAll("{{prompt}}", esc(job.prompt || ""))
    .replaceAll("{{negative}}", esc(job.negative || ""));
  let workflow: Record<string, any>;
  try { workflow = JSON.parse(wfJson); } catch (e) {
    return { ok: false, engine: "comfyui", status: "error", message: `workflow JSON 解析失败（占位符替换后）：${(e as Error).message.slice(0, 160)}` };
  }
  injectComfyLoras(workflow, job.comfyLoras || []);

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: `wb-${Date.now()}` }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, engine: "comfyui", status: "error", message: `ComfyUI ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json();
    const pid = data?.prompt_id || data?.data?.prompt_id;
    if (!pid) return { ok: false, engine: "comfyui", status: "error", message: "ComfyUI 未返回 prompt_id（响应异常）" };
    return { ok: true, engine: "comfyui", status: "submitted", engineTaskId: String(pid) };
  } catch (e) {
    return { ok: false, engine: "comfyui", status: "error", message: `ComfyUI 提交: ${(e as Error).message.slice(0, 160)}` };
  }
}

/** ComfyUI 轮询：/history/{prompt_id} 取输出图，拼 /view 下载地址 */
export async function pollComfyUI(promptId: string): Promise<{ status: string; images?: string[]; message?: string }> {
  const url = (getSetting("comfyui_cloud_url") || getSetting("comfyui_local_url"))?.replace(/\/$/, "");
  if (!url) return { status: "error", message: "未配置 ComfyUI 地址" };
  try {
    const res = await fetch(`${url}/history/${promptId}`, { signal: AbortSignal.timeout(15000) });
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
  } catch (e) {
    return { status: "error", message: `ComfyUI 轮询: ${(e as Error).message.slice(0, 120)}` };
  }
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
    case "liblibcomfy": return submitLiblibComfy(job);
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
  if (engine === "liblibcomfy") return pollLiblibComfy(engineTaskId);
  if (engine === "comfyui") return pollComfyUI(engineTaskId);
  return { status: "processing" as const };
}
