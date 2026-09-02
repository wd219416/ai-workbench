import crypto from "node:crypto";
import fs from "node:fs";
import { getSetting, run } from "../db";
import { klingAuth, klingErrorMsg } from "./kling-auth";

export interface ImageJob {
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  n?: number;
  refImagePath?: string; // 图生图/实景合成的参考图（服务器本地路径）
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

/** LOVART Agent OpenAPI（官方签名方案，已实测通过）：
 *  base https://lgw.lovart.ai + 前缀 /v1/openapi
 *  签名: HMAC-SHA256(sk, "{METHOD}\n{path}\n{ts}")，path 不含 query
 *  头: X-Access-Key / X-Timestamp / X-Signature / X-Signed-Method / X-Signed-Path */
function lovartConf() {
  return {
    ak: getSetting("lovart_ak"), sk: getSetting("lovart_sk"),
    base: (getSetting("lovart_base") || "https://lgw.lovart.ai").replace(/\/$/, ""),
    prefix: getSetting("lovart_path") || "/v1/openapi",
  };
}

function lovartSign(method: string, path: string, ak: string, sk: string): Record<string, string> {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", sk).update(`${method}\n${path}\n${ts}`).digest("hex");
  return { "X-Access-Key": ak, "X-Timestamp": ts, "X-Signature": sig, "X-Signed-Method": method, "X-Signed-Path": path };
}

async function lovartApi<T>(method: string, path: string, body?: unknown, query?: string): Promise<T> {
  const { ak, sk, base } = lovartConf();
  const res = await fetch(`${base}${path}${query ? `?${query}` : ""}`, {
    method,
    headers: { "Content-Type": "application/json", ...lovartSign(method, path, ak, sk) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  if (data?.code !== 0) throw new Error(data?.message || `code ${data?.code}`);
  return (data.data ?? data) as T;
}

/** 项目ID：设置页可指定；为空自动创建"AI内容工作台"项目并记住 */
async function lovartProjectId(prefix: string): Promise<string> {
  const saved = getSetting("lovart_project_id");
  if (saved) return saved;
  const r = await lovartApi<{ project_id?: string }>("POST", `${prefix}/project/save`, {
    project_id: "", canvas: "", project_cover_list: [], pic_count: 0, project_type: 3, project_name: "AI内容工作台",
  });
  const pid = r.project_id || "";
  if (pid) run("UPDATE settings SET value=? WHERE key='lovart_project_id'", pid);
  return pid;
}

/** 参考图上传到 LOVART CDN（实景合成用），返回 CDN URL */
async function lovartUpload(prefix: string, filePath: string): Promise<string> {
  const { ak, sk, base } = lovartConf();
  const path = `${prefix}/file/upload`;
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf]), filePath.split(/[\\/]/).pop());
  const res = await fetch(`${base}${path}`, {
    method: "POST", headers: lovartSign("POST", path, ak, sk), body: form, signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.code !== 0) throw new Error(`参考图上传失败: ${data?.message || res.status}`);
  return data.data.url;
}

async function submitLovart(job: ImageJob): Promise<EngineReply> {
  const { ak, sk, prefix } = lovartConf();
  if (!ak || !sk) return { ok: false, engine: "lovart", status: "needs_key", message: "未配置 LOVART 双KEY，请到设置页填写" };
  try {
    const project_id = await lovartProjectId(prefix);
    if (!project_id) throw new Error("项目创建失败");
    const body: Record<string, unknown> = { prompt: job.prompt, project_id, mode: "fast" };
    // 实景合成：参考图传 CDN 后作为附件
    if (job.refImagePath && fs.existsSync(job.refImagePath)) {
      body.attachments = [await lovartUpload(prefix, job.refImagePath)];
    }
    const r = await lovartApi<{ thread_id?: string }>("POST", `${prefix}/chat`, body);
    if (!r.thread_id) throw new Error("未返回 thread_id");
    return { ok: true, engine: "lovart", status: "submitted", engineTaskId: r.thread_id };
  } catch (e) {
    return { ok: false, engine: "lovart", status: "error", message: `LOVART: ${(e as Error).message.slice(0, 180)}` };
  }
}

export async function pollLovart(engineTaskId: string): Promise<{ status: string; images?: string[]; message?: string }> {
  const { prefix } = lovartConf();
  try {
    const q = `thread_id=${encodeURIComponent(engineTaskId)}`;
    const s = await lovartApi<{ status?: string }>("GET", `${prefix}/chat/status`, undefined, q);
    if (s.status === "abort") return { status: "failed", message: "LOVART 任务中止" };
    if (s.status !== "done") return { status: "processing" };
    const r = await lovartApi<{ items?: { artifacts?: { type?: string; content?: string }[] }[] }>("GET", `${prefix}/chat/result`, undefined, q);
    const images = (r.items || []).flatMap((i) => (i.artifacts || []).filter((a) => a.type === "image" && a.content).map((a) => a.content!));
    return { status: "done", images };
  } catch (e) {
    return { status: "error", message: `LOVART查询: ${(e as Error).message.slice(0, 120)}` };
  }
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

export const IMAGE_ENGINES = [
  { code: "lovart", name: "LOVART", keyHint: "双KEY" },
  { code: "kling", name: "可灵", keyHint: "ak/sk" },
  { code: "wanxiang", name: "通义万相", keyHint: "百炼KEY" },
  { code: "jimeng", name: "即梦", keyHint: "方舟KEY" },
  { code: "comfyui", name: "ComfyUI", keyHint: "预留" },
];

export async function submitImage(engine: string, job: ImageJob): Promise<EngineReply> {
  switch (engine) {
    case "kling": return submitKling(job);
    case "lovart": return submitLovart(job);
    case "wanxiang": return submitWanxiang(job);
    case "jimeng": return submitJimeng(job);
    case "comfyui": return submitComfyUI(job);
    default:
      return { ok: false, engine, status: "error", message: `未知引擎 ${engine}` };
  }
}

export async function pollImage(engine: string, engineTaskId: string) {
  if (engine === "kling") return pollKling(engineTaskId);
  if (engine === "lovart") return pollLovart(engineTaskId);
  if (engine === "wanxiang") return pollWanxiang(engineTaskId);
  if (engine === "comfyui") return pollComfyUI(engineTaskId);
  return { status: "processing" as const };
}
