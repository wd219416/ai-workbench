import crypto from "node:crypto";
import fs from "node:fs";
import { getSetting, run } from "../db";

/** LOVART Agent OpenAPI（官方签名方案，已实测通过）：
 *  base https://lgw.lovart.ai + 前缀 /v1/openapi
 *  签名: HMAC-SHA256(sk, "{METHOD}\n{path}\n{ts}")，path 不含 query
 *  头: X-Access-Key / X-Timestamp / X-Signature / X-Signed-Method / X-Signed-Path
 *
 *  模型选择（出图/视频共用同一 /chat 接口）：
 *  tool_config.prefer_tool_categories = { "IMAGE": [tool_name] } 或 { "VIDEO": [tool_name] }
 *  出图 tool_name 如 generate_image_nano_banana_2；视频如 generate_video_seedance_v2_5
 *  产物轮询：/chat/result 的 artifacts，出图 type=image，视频 type=video
 */
export function lovartConf() {
  return {
    ak: getSetting("lovart_ak"), sk: getSetting("lovart_sk"),
    base: (getSetting("lovart_base") || "https://lgw.lovart.ai").replace(/\/$/, ""),
    prefix: getSetting("lovart_path") || "/v1/openapi",
  };
}

export function lovartSign(method: string, path: string, ak: string, sk: string): Record<string, string> {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", sk).update(`${method}\n${path}\n${ts}`).digest("hex");
  return { "X-Access-Key": ak, "X-Timestamp": ts, "X-Signature": sig, "X-Signed-Method": method, "X-Signed-Path": path };
}

export async function lovartApi<T>(method: string, path: string, body?: unknown, query?: string): Promise<T> {
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
export async function lovartProjectId(prefix: string): Promise<string> {
  const saved = getSetting("lovart_project_id");
  if (saved) return saved;
  const r = await lovartApi<{ project_id?: string }>("POST", `${prefix}/project/save`, {
    project_id: "", canvas: "", project_cover_list: [], pic_count: 0, project_type: 3, project_name: "AI内容工作台",
  });
  const pid = r.project_id || "";
  if (pid) run("UPDATE settings SET value=? WHERE key='lovart_project_id'", pid);
  return pid;
}

/** 上传二进制到 LOVART CDN，返回 CDN URL（供 attachments 引用） */
async function lovartUploadBuffer(prefix: string, buf: Buffer, filename: string): Promise<string> {
  const { ak, sk, base } = lovartConf();
  const path = `${prefix}/file/upload`;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)]), filename);
  const res = await fetch(`${base}${path}`, {
    method: "POST", headers: lovartSign("POST", path, ak, sk), body: form, signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.code !== 0) throw new Error(`参考图上传失败: ${data?.message || res.status}`);
  return data.data.url;
}

/** 上传本地文件（出图参考图） */
export async function lovartUpload(prefix: string, filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  return lovartUploadBuffer(prefix, buf, filePath.split(/[\\/]/).pop() || "ref.png");
}

/** 上传 base64（视频首帧），返回 CDN URL */
export async function lovartUploadBase64(prefix: string, base64: string, filename = "first-frame.png"): Promise<string> {
  return lovartUploadBuffer(prefix, Buffer.from(base64, "base64"), filename);
}

export type LovartKind = "IMAGE" | "VIDEO";

export interface LovartRef {
  paths?: string[]; // 多张本地参考图（产品保真：多角度/细节图，全部上传为 attachments）
  path?: string;    // 兼容：单张本地参考图
  base64?: string;  // base64（视频首帧）
}

/** 通用 /chat 提交：按 kind 指定模型软偏好，返回 thread_id */
export async function submitLovartChat(
  kind: LovartKind,
  prompt: string,
  ref?: LovartRef
): Promise<{ ok: boolean; threadId?: string; message?: string }> {
  const { ak, sk, prefix } = lovartConf();
  if (!ak || !sk) return { ok: false, message: "未配置 LOVART 双KEY，请到设置页填写" };
  try {
    const project_id = await lovartProjectId(prefix);
    if (!project_id) throw new Error("项目创建失败");
    const model = getSetting(kind === "IMAGE" ? "lovart_model" : "lovart_video_model") || "";
    const body: Record<string, unknown> = { prompt, project_id, mode: "fast" };
    // 模型软偏好（留空则不传，交给 AI 自动路由）
    if (model) body.tool_config = { prefer_tool_categories: { [kind]: [model] } };
    // 参考图：多张（产品多角度保真）> 单张 > base64
    const paths = [...(ref?.paths || []), ...(ref?.path ? [ref.path] : [])].filter((p) => p && fs.existsSync(p));
    if (paths.length) {
      body.attachments = await Promise.all(paths.slice(0, 4).map((p) => lovartUpload(prefix, p)));
    } else if (ref?.base64) {
      body.attachments = [await lovartUploadBase64(prefix, ref.base64)];
    }
    const r = await lovartApi<{ thread_id?: string }>("POST", `${prefix}/chat`, body);
    if (!r.thread_id) throw new Error("未返回 thread_id");
    return { ok: true, threadId: r.thread_id };
  } catch (e) {
    return { ok: false, message: `LOVART: ${(e as Error).message.slice(0, 180)}` };
  }
}

/** 通用轮询：/chat/status + /chat/result，同时收集 image 与 video 产物 */
export async function pollLovartChat(threadId: string): Promise<{ status: string; images?: string[]; videos?: string[]; message?: string }> {
  const { prefix } = lovartConf();
  try {
    const q = `thread_id=${encodeURIComponent(threadId)}`;
    const s = await lovartApi<{ status?: string }>("GET", `${prefix}/chat/status`, undefined, q);
    if (s.status === "abort") return { status: "failed", message: "LOVART 任务中止" };
    if (s.status !== "done") return { status: "processing" };
    const r = await lovartApi<{ items?: { artifacts?: { type?: string; content?: string }[] }[] }>("GET", `${prefix}/chat/result`, undefined, q);
    const arts = (r.items || []).flatMap((i) => (i.artifacts || []));
    const images = arts.filter((a) => a.type === "image" && a.content).map((a) => a.content!);
    const videos = arts.filter((a) => a.type === "video" && a.content).map((a) => a.content!);
    return { status: "done", images, videos };
  } catch (e) {
    return { status: "error", message: `LOVART查询: ${(e as Error).message.slice(0, 120)}` };
  }
}
