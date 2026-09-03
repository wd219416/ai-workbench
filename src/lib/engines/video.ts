import { getSetting } from "../db";
import { klingAuth, klingErrorMsg } from "./kling-auth";
import { submitLovartChat, pollLovartChat } from "./lovart";

export interface VideoJob {
  prompt: string;
  imageUrl?: string; // 图生视频的首帧图
  duration?: number;
  ratio?: string;
}

export interface VideoReply {
  ok: boolean;
  engine: string;
  engineTaskId?: string;
  status: "submitted" | "needs_key" | "error";
  message?: string;
}

async function submitKlingVideo(job: VideoJob): Promise<VideoReply> {
  const auth = klingAuth();
  if (!auth.ok) return { ok: false, engine: "kling", status: "needs_key", message: auth.message };
  const base = auth.base;
  const path = job.imageUrl ? "/v1/videos/image2video" : "/v1/videos/text2video";
  const body: Record<string, unknown> = {
    model: "kling-v2-master",
    prompt: job.prompt,
    duration: String(job.duration || 5),
    aspect_ratio: job.ratio || "9:16",
  };
  if (job.imageUrl) body.image = job.imageUrl;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth.header! },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, engine: "kling", status: "error", message: klingErrorMsg(res.status, await res.text()) };
  const data = await res.json();
  return { ok: true, engine: "kling", status: "submitted", engineTaskId: data?.data?.task_id };
}

export async function pollKlingVideo(engineTaskId: string, isI2V: boolean): Promise<{ status: string; videos?: string[]; message?: string }> {
  const auth = klingAuth();
  if (!auth.ok) return { status: "error", message: auth.message };
  const path = isI2V ? "/v1/videos/image2video" : "/v1/videos/text2video";
  const res = await fetch(`${auth.base}${path}/${engineTaskId}`, { headers: { Authorization: auth.header! } });
  if (!res.ok) return { status: "error", message: `可灵查询 ${res.status}` };
  const data = await res.json();
  const st = data?.data?.task_status;
  const videos = data?.data?.task_result?.videos?.map((v: { url: string }) => v.url);
  return { status: st === "succeed" ? "done" : st === "failed" ? "failed" : "processing", videos, message: data?.data?.task_status_msg };
}

/** Vidu：按官方文档校准（platform.vidu.cn/docs）——Token 鉴权 /ent/v2，模型 viduq3-pro/turbo */
const VIDU_RATIOS = ["16:9", "9:16", "1:1", "3:4", "4:3"];
async function submitVidu(job: VideoJob): Promise<VideoReply> {
  const key = getSetting("vidu_key");
  const base = getSetting("vidu_base") || "https://api.vidu.cn";
  if (!key) return { ok: false, engine: "vidu", status: "needs_key", message: "未配置 Vidu key，请到设置页填写" };
  const path = job.imageUrl ? "/ent/v2/img2video" : "/ent/v2/text2video";
  const body: Record<string, unknown> = {
    model: getSetting("vidu_model") || "viduq3-pro",
    prompt: job.prompt,
    duration: Math.min(16, Math.max(1, Math.round(job.duration || 5))), // Q3 支持 1-16 秒
    aspect_ratio: VIDU_RATIOS.includes(job.ratio || "") ? job.ratio : "9:16",
    resolution: getSetting("vidu_resolution") || "720p", // 540p/720p/1080p（1080p 仅 pro）
  };
  if (job.imageUrl) body.images = [job.imageUrl]; // 官方支持 base64 或 URL
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, engine: "vidu", status: "error", message: `Vidu ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  return { ok: true, engine: "vidu", status: "submitted", engineTaskId: data?.task_id };
}

export async function pollVidu(engineTaskId: string): Promise<{ status: string; videos?: string[]; message?: string }> {
  const key = getSetting("vidu_key");
  const base = getSetting("vidu_base") || "https://api.vidu.cn";
  const res = await fetch(`${base}/ent/v2/tasks/${engineTaskId}/creations`, {
    headers: { Authorization: `Token ${key}` },
  });
  if (!res.ok) return { status: "error", message: `Vidu查询 ${res.status}` };
  const data = await res.json();
  const st = data?.state;
  const videos = data?.creations?.map((c: { url: string }) => c.url);
  return { status: st === "success" ? "done" : st === "failed" ? "failed" : "processing", videos };
}

/** LOVART：提交出视频（模型软偏好走 lovart.ts 的 submitLovartChat，tool_config=VIDEO；首帧以 base64 上传为附件） */
async function submitLovartVideo(job: VideoJob): Promise<VideoReply> {
  const r = await submitLovartChat("VIDEO", job.prompt, job.imageUrl ? { base64: job.imageUrl } : undefined);
  if (!r.ok) {
    const needsKey = r.message?.includes("未配置 LOVART 双KEY");
    return { ok: false, engine: "lovart", status: needsKey ? "needs_key" : "error", message: r.message };
  }
  return { ok: true, engine: "lovart", status: "submitted", engineTaskId: r.threadId! };
}

export async function pollLovartVideo(engineTaskId: string): Promise<{ status: string; videos?: string[]; message?: string }> {
  const r = await pollLovartChat(engineTaskId);
  return { status: r.status, videos: r.videos, message: r.message };
}

export async function submitVideo(engine: string, job: VideoJob): Promise<VideoReply> {
  if (engine === "kling") return submitKlingVideo(job);
  if (engine === "lovart") return submitLovartVideo(job);
  if (engine === "vidu") return submitVidu(job);
  if (engine === "jimeng") return { ok: false, engine, status: "error", message: "即梦走跳转官网：复制脚本后到即梦网页手动生成" };
  return { ok: false, engine, status: "error", message: `未知引擎 ${engine}` };
}

export async function pollVideo(engine: string, engineTaskId: string, isI2V: boolean) {
  if (engine === "kling") return pollKlingVideo(engineTaskId, isI2V);
  if (engine === "lovart") return pollLovartVideo(engineTaskId);
  if (engine === "vidu") return pollVidu(engineTaskId);
  return { status: "processing" as const };
}
