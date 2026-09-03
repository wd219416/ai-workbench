import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { getSetting, uploadDir } from "./db";
import { llmConf } from "./llm";
import { dataDir } from "./paths";

const execFileAsync = promisify(execFile);

/** 视频反推结果 */
export interface VideoReverseResult {
  ok: boolean;
  source: string;
  note?: string;
  /** 抽帧预览图（/api/file/xxx.jpg） */
  frames?: string[];
  /** 口播原文（ASR 转写） */
  transcript?: string;
  /** 画面分析（Qwen-VL 结构化描述） */
  frameDesc?: string;
  /** 最终反推：视频生成提示词 */
  videoPrompt?: string;
  /** 最终反推：标题 */
  title?: string;
  /** 最终反推：脚本文案 */
  script?: string;
  /** 卖点 */
  sellingPoints?: string[];
  duration?: number;
}

/** 探测可执行工具（Windows where） */
async function hasBin(bin: string): Promise<boolean> {
  try {
    await execFileAsync("where", [bin]);
    return true;
  } catch {
    return false;
  }
}

function tmpDir(): string {
  const d = path.join(dataDir(), "tmp", `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function rmDir(d: string) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

/** 下载远程视频到临时文件 */
async function downloadVideo(url: string, dir: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`下载视频失败 HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  const ext = /webm/.test(ct) ? "webm" : /mov|quicktime/.test(ct) ? "mov" : "mp4";
  const out = path.join(dir, `src.${ext}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

/** 视频时长（秒） */
async function probeDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath]);
    return Math.max(0, parseFloat(stdout.trim()) || 0);
  } catch {
    return 0;
  }
}

/** 抽 N 帧代表性画面，转存 uploads 目录，返回可访问 url */
async function extractFrames(videoPath: string, count: number): Promise<string[]> {
  const dur = await probeDuration(videoPath);
  const interval = dur > 0 ? Math.max(0.6, dur / count) : 2;
  const tmp = tmpDir();
  const prefix = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outPattern = path.join(tmp, "f_%02d.jpg");
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-i", videoPath,
      "-vf", `fps=1/${interval},scale=768:-2`,
      "-frames:v", String(count),
      "-q:v", "3",
      outPattern,
    ], { maxBuffer: 32 * 1024 * 1024 });
    const files = fs.readdirSync(tmp).filter((f) => /^f_\d+\.jpg$/.test(f)).sort();
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const dst = path.join(uploadDir(), `${prefix}_${i + 1}.jpg`);
      fs.copyFileSync(path.join(tmp, files[i]), dst);
      urls.push(`/api/file/${path.basename(dst)}`);
    }
    return urls;
  } finally {
    rmDir(tmp);
  }
}

/** 抽音频（16k 单声道 wav），返回本地路径 */
async function extractAudio(videoPath: string, dir: string): Promise<string> {
  const out = path.join(dir, "audio.wav");
  await execFileAsync("ffmpeg", [
    "-y", "-i", videoPath,
    "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
    out,
  ], { maxBuffer: 32 * 1024 * 1024 });
  return out;
}

/** 百炼 paraformer-v2 文件转写（getPolicy + OSS 直传 + 异步轮询），纯 HTTP 无额外依赖 */
async function transcribe(audioPath: string): Promise<string> {
  const key = getSetting("qwen_key");
  if (!key) return "";
  const DASH = "https://dashscope.aliyuncs.com";

  // 1. 拿 OSS 上传凭证
  const pol = await fetch(`${DASH}/api/v1/uploads?action=getPolicy&model=paraformer-v2`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (!pol.ok) throw new Error(`getPolicy ${pol.status}`);
  const d = (await pol.json()).data;
  const fname = `a_${Date.now()}.wav`;
  const keyobj = `${d.upload_dir}/${fname}`;

  // 2. OSS 直传
  const fd = new FormData();
  fd.append("OSSAccessKeyId", d.oss_access_key_id);
  fd.append("policy", d.policy);
  fd.append("Signature", d.signature);
  fd.append("key", keyobj);
  fd.append("x-oss-object-acl", d.x_oss_object_acl);
  fd.append("x-oss-forbid-overwrite", d.x_oss_forbid_overwrite);
  fd.append("success_action_status", "200");
  fd.append("file", new Blob([fs.readFileSync(audioPath)]), fname);
  const up = await fetch(d.upload_host, { method: "POST", body: fd });
  if (up.status !== 200) throw new Error(`OSS 上传 ${up.status}`);

  // 3. 提交文件转写
  const sub = await fetch(`${DASH}/api/v1/services/audio/asr/transcription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable",
    },
    body: JSON.stringify({
      model: "paraformer-v2",
      input: { file_urls: [`oss://${keyobj}`] },
      parameters: { channel_id: [0] },
    }),
  });
  const subj = await sub.json();
  const taskId = subj?.output?.task_id;
  if (!taskId) throw new Error(`提交转写失败 ${JSON.stringify(subj).slice(0, 200)}`);

  // 4. 轮询结果
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const q = await fetch(`${DASH}/api/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!q.ok) continue;
    const qj = await q.json();
    const st = qj?.output?.task_status;
    if (st === "SUCCEEDED" || st === "FAILED") {
      if (st === "FAILED") return "";
      return extractTranscript(qj.output);
    }
  }
  return "";
}

/** 从转写结果里提取纯文本 */
function extractTranscript(output: unknown): string {
  const o = output as { results?: { results?: { transcription?: { text?: string; sentences?: { text?: string }[] } }[] }[] };
  const tr = o?.results?.[0]?.results?.[0]?.transcription;
  if (!tr) return "";
  if (tr.text) return tr.text;
  if (Array.isArray(tr.sentences)) return tr.sentences.map((s) => s.text || "").join("");
  return "";
}

/** Qwen-VL 多图理解：分析关键帧画面，返回结构化 JSON 文本 */
async function analyzeFrames(framePaths: string[]): Promise<string> {
  const key = getSetting("qwen_key");
  const base = getSetting("qwen_base") || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = getSetting("qwen_vl_model") || "qwen-vl-max";
  const content: unknown[] = framePaths.map((p) => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}` },
  }));
  content.push({
    type: "text",
    text: "这是同一条视频按时间顺序抽出的关键帧。请分析这段视频的画面，输出 JSON：{\"subject\":\"主体\",\"scene\":\"场景\",\"style\":\"风格/画风\",\"camera\":\"运镜方式\",\"lighting\":\"光线\",\"mood\":\"氛围基调\"}。只输出 JSON，不要其他内容。",
  });
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content }], temperature: 0.4 }),
  });
  if (!res.ok) throw new Error(`Qwen-VL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** DeepSeek 整合：画面 + 口播 → 视频提示词 + 脚本文案 */
async function composeScript(frameDesc: string, transcript: string, platform: string): Promise<{
  videoPrompt: string; title: string; script: string; sellingPoints: string[];
}> {
  const { key, base, model } = llmConf();
  const SYS = `你是资深短视频拆解与策划专家，服务实木花盆/花盆支架电商（淘宝/抖店/拼多多/视频号/小红书）与广告设计。
根据一段视频的「画面分析」和「口播原文」，反推出可直接复用的内容。
严格按以下 JSON 输出，不要输出其他内容：
{"title":"3秒钩子标题","videoPrompt":"English video generation prompt（用于 AI 出视频，描述主体/场景/镜头/光线/风格/画质）","script":"完整脚本文案，注意：script 必须是单个字符串（绝不是数组、绝不是对象）。用换行符 \\n 分隔每个分镜，每镜依次写【画面+运镜】【口播文案】【字幕要点】【BGM建议】","sellingPoints":["卖点1","卖点2","卖点3"]}
要求：脚本贴合${platform}平台调性；若口播原文为空，则基于画面分析合理创作口播；videoPrompt 用英文并包含画质词。`;
  const userMsg = `目标平台：${platform || "通用"}\n\n画面分析：\n${frameDesc || "（无）"}\n\n口播原文：\n${transcript || "（无，请基于画面创作）"}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, messages: [{ role: "system", content: SYS }, { role: "user", content: userMsg }],
      temperature: 0.7, response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const txt: string = data.choices?.[0]?.message?.content ?? "";
  const m = txt.match(/\{[\s\S]*\}/);
  const p = m ? JSON.parse(m[0]) : {};
  return {
    videoPrompt: String(p.videoPrompt || ""),
    title: String(p.title || ""),
    script: normalizeScript(p.script),
    sellingPoints: Array.isArray(p.sellingPoints) ? p.sellingPoints.map(String) : [],
  };
}

/** 兜底：DeepSeek 可能把 script 返回成数组/对象，统一归一成可读文本 */
function normalizeScript(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((item, i) => {
        if (typeof item === "string") return `${i + 1}. ${item}`;
        if (item && typeof item === "object") {
          const parts = Object.entries(item as Record<string, unknown>)
            .filter(([, val]) => val != null && String(val).trim() !== "")
            .map(([k, val]) => `${k}：${String(val)}`);
          return `${i + 1}. ${parts.join("；")}`;
        }
        return `${i + 1}. ${String(item)}`;
      })
      .join("\n");
  }
  return String(v);
}

/** 主入口：从本地视频文件反推 */
export async function reverseVideoFromFile(file: File, platform?: string): Promise<VideoReverseResult> {
  if (!(await hasBin("ffmpeg")) || !(await hasBin("ffprobe"))) {
    return { ok: false, source: "error", note: "本机未安装 ffmpeg/ffprobe，无法抽帧。请先安装 ffmpeg 后重试。" };
  }
  const dir = tmpDir();
  try {
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const src = path.join(dir, `src.${ext}`);
    fs.writeFileSync(src, Buffer.from(await file.arrayBuffer()));
    return await runPipeline(src, dir, platform);
  } finally {
    rmDir(dir);
  }
}

/** 主入口：从视频 URL 反推 */
export async function reverseVideoFromUrl(url: string, platform?: string): Promise<VideoReverseResult> {
  if (!(await hasBin("ffmpeg")) || !(await hasBin("ffprobe"))) {
    return { ok: false, source: "error", note: "本机未安装 ffmpeg/ffprobe，无法抽帧。请先安装 ffmpeg 后重试。" };
  }
  const dir = tmpDir();
  try {
    const src = await downloadVideo(url, dir);
    return await runPipeline(src, dir, platform);
  } finally {
    rmDir(dir);
  }
}

/** 统一处理管线：抽帧 → 抽音频 → ASR → 画面理解 → 脚本整合 */
async function runPipeline(src: string, dir: string, platform?: string): Promise<VideoReverseResult> {
  const duration = await probeDuration(src);
  if (duration <= 0) return { ok: false, source: "error", note: "无法解析视频时长，文件可能损坏或格式不支持。" };

  const frameUrls = await extractFrames(src, 4);
  if (!frameUrls.length) return { ok: false, source: "error", note: "抽帧失败，视频可能无有效画面。" };

  // 抽帧本地路径（供 Qwen-VL 读 base64）——重新从 uploads 映射回本地路径
  const framePaths = frameUrls.map((u) => path.join(uploadDir(), path.basename(u)));

  // ASR（失败不阻断，无口播也能用画面反推）
  let transcript = "";
  try {
    const audio = await extractAudio(src, dir);
    transcript = await transcribe(audio);
  } catch (e) {
    transcript = "";
  }

  // 画面理解
  let frameDesc = "";
  let frameDescFailed = false;
  try {
    frameDesc = await analyzeFrames(framePaths);
  } catch (e) {
    frameDescFailed = true;
    frameDesc = `画面分析失败：${(e as Error).message.slice(0, 120)}`;
  }

  // 脚本整合
  let videoPrompt = "", title = "", script = "", sellingPoints: string[] = [];
  let composeNote = "";
  try {
    const c = await composeScript(frameDesc, transcript, platform || "通用");
    videoPrompt = c.videoPrompt; title = c.title; script = c.script; sellingPoints = c.sellingPoints;
  } catch (e) {
    composeNote = `脚本整合失败（${(e as Error).message.slice(0, 100)}），仅返回画面分析。`;
  }

  const notes: string[] = [];
  if (!getSetting("qwen_key")) notes.push("未配置百炼 Qwen-VL key，无法理解画面与听口播。");
  if (!llmConf().key) notes.push("未配置 DeepSeek key，无法整合脚本。");
  if (!transcript && getSetting("qwen_key")) notes.push("未识别到口播（视频可能无语音或 ASR 未命中）。");
  if (frameDescFailed) notes.push("画面分析失败。");
  if (composeNote) notes.push(composeNote);

  return {
    ok: true,
    source: "qwen-vl+paraformer+deepseek",
    note: notes.join(" "),
    frames: frameUrls,
    transcript,
    frameDesc,
    videoPrompt,
    title,
    script,
    sellingPoints,
    duration,
  };
}
