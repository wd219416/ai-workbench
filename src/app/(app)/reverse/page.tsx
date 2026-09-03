"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface ImgResult { prompt?: string; source?: string; semiAuto?: string; note?: string }
interface VidResult {
  ok: boolean; source?: string; note?: string;
  frames?: string[]; transcript?: string; frameDesc?: string;
  videoPrompt?: string; title?: string; script?: string; sellingPoints?: string[];
  duration?: number;
}

const PLATFORMS = ["通用", "抖音", "快手", "小红书", "视频号", "淘宝"];

export default function ReversePage() {
  const [tab, setTab] = useState<"image" | "video">("image");

  // ===== 图片反推 =====
  const [refImg, setRefImg] = useState<{ url: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgResult, setImgResult] = useState<ImgResult | null>(null);
  const [imgCn, setImgCn] = useState("");
  const [imgEn, setImgEn] = useState("");
  const pasteRef = useRef<HTMLDivElement>(null);

  // ===== 视频反推 =====
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [platform, setPlatform] = useState("通用");
  const [vidBusy, setVidBusy] = useState(false);
  const [vidResult, setVidResult] = useState<VidResult | null>(null);

  const uploadImage = useCallback(async (file: File) => {
    const fd = new FormData(); fd.append("image", file); fd.append("kind", "rev");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) { const d = await res.json(); setRefImg({ url: d.url }); }
  }, []);

  useEffect(() => {
    const el = pasteRef.current;
    if (!el) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      if (item) { const f = item.getAsFile(); if (f) uploadImage(f); e.preventDefault(); }
    };
    el.addEventListener("paste", onPaste as EventListener);
    return () => el.removeEventListener("paste", onPaste as EventListener);
  }, [uploadImage]);

  async function reverseImage() {
    if (!refImg) return;
    setImgBusy(true); setImgResult(null); setImgCn(""); setImgEn("");
    try {
      const blob = await (await fetch(refImg.url)).blob();
      const fd = new FormData();
      fd.append("image", new File([blob], "ref.png", { type: blob.type }));
      const res = await fetch("/api/prompt/reverse", { method: "POST", body: fd });
      const d: ImgResult = await res.json();
      setImgResult(d);
      if (d.prompt) {
        try { const p = JSON.parse(d.prompt); setImgCn(p.cn || ""); setImgEn(p.en || ""); } catch { /* 非 JSON */ }
      }
    } finally {
      setImgBusy(false);
    }
  }

  async function reverseVideo() {
    if (!videoFile && !videoUrl.trim()) return;
    setVidBusy(true); setVidResult(null);
    try {
      const fd = new FormData();
      if (videoFile) fd.append("video", videoFile);
      if (videoUrl.trim()) fd.append("url", videoUrl.trim());
      fd.append("platform", platform);
      const res = await fetch("/api/reverse/video", { method: "POST", body: fd });
      const d: VidResult = await res.json();
      setVidResult(d);
    } finally {
      setVidBusy(false);
    }
  }

  const copy = (t: string) => navigator.clipboard.writeText(t);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="font-medium">反推工作台</div>
        <div className="flex gap-1 ml-4">
          {([["image", "图片反推提示词"], ["video", "视频反推提示词+脚本"]] as const).map(([k, name]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-[13px] border transition ${tab === k ? "border-brand text-ink bg-panel2" : "border-transparent text-mute hover:bg-panel2"}`}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {tab === "image" ? (
        <div className="grid grid-cols-[380px_1fr] gap-4">
          <div className="card p-4 space-y-3">
            <div className="font-medium text-sm">上传参考图</div>
            <div ref={pasteRef} tabIndex={0}
              className="border border-dashed border-line rounded-lg p-2 min-h-40 flex items-center justify-center cursor-pointer focus:border-brand outline-none"
              onClick={() => document.getElementById("rev-file")?.click()}>
              {refImg ? <img src={refImg.url} alt="ref" className="max-h-48 rounded" /> : <span className="text-[12px] text-mute">截屏后按 Ctrl+V，或点击上传</span>}
            </div>
            <input id="rev-file" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
            <button className="btn btn-brand w-full" onClick={reverseImage} disabled={imgBusy || !refImg}>
              {imgBusy ? "反推中…" : "反推提示词"}</button>
            {imgResult?.note && <div className="text-[11px] text-brand">{imgResult.note}</div>}
            {imgResult?.semiAuto && (
              <div className="border border-line rounded-lg p-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-mute">ChatGPT / Codex 通道（复制指令+图片发给 ChatGPT）</span>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(imgResult.semiAuto!)}>复制指令</button>
                </div>
              </div>
            )}
          </div>

          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">反推结果</div>
              {imgResult && <span className="tag">{imgResult.source === "qwen-vl" ? "Qwen-VL 反推" : "待配置"}</span>}
            </div>
            <div>
              <div className="flex justify-between items-center"><label className="label">中文提示词</label>
                <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(imgCn)}>复制</button></div>
              <textarea className="input h-24 resize-none text-[12px]" placeholder="中文提示词" value={imgCn} onChange={(e) => setImgCn(e.target.value)} />
            </div>
            <div>
              <div className="flex justify-between items-center"><label className="label">英文提示词</label>
                <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(imgEn)}>复制</button></div>
              <textarea className="input h-24 resize-none text-[12px]" placeholder="English prompt" value={imgEn} onChange={(e) => setImgEn(e.target.value)} />
            </div>
            <div className="text-[11px] text-mute">复制提示词后，到「作图工作台」粘贴即可直接出图。</div>
            <a className="btn btn-ghost" href="/studio">去作图工作台 →</a>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[380px_1fr] gap-4">
          <div className="card p-4 space-y-3">
            <div className="font-medium text-sm">视频来源</div>
            <div>
              <label className="label">本地视频</label>
              <input type="file" accept="video/*" className="input" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
              {videoFile && <div className="text-[11px] text-mute mt-1">已选：{videoFile.name}（{(videoFile.size / 1048576).toFixed(1)}MB）</div>}
            </div>
            <div>
              <label className="label">视频直链（mp4 等，可选）</label>
              <input className="input" placeholder="粘贴视频直链 URL" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
              <div className="text-[11px] text-mute mt-1">抖音/小红书链接无法直接解析，请先到网页版解析工具把链接转成 mp4 直链再粘贴。</div>
            </div>
            <div>
              <label className="label">目标平台（影响脚本调性）</label>
              <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <button className="btn btn-brand w-full" onClick={reverseVideo} disabled={vidBusy || (!videoFile && !videoUrl.trim())}>
              {vidBusy ? "反推中（抽帧·听口播·写脚本，约1-2分钟）…" : "反推提示词 + 脚本文案"}</button>
            {vidResult?.note && <div className="text-[11px] text-brand whitespace-pre-wrap">{vidResult.note}</div>}
          </div>

          <div className="space-y-4 overflow-auto">
            {vidResult?.frames && vidResult.frames.length > 0 && (
              <div className="card p-4">
                <div className="font-medium text-sm mb-2">抽帧预览（{vidResult.frames.length} 帧）</div>
                <div className="grid grid-cols-4 gap-2">
                  {vidResult.frames.map((f, i) => <img key={f} src={f} alt={`frame ${i + 1}`} className="rounded w-full" />)}
                </div>
                {vidResult.duration ? <div className="text-[11px] text-mute mt-2">视频时长约 {vidResult.duration.toFixed(0)} 秒</div> : null}
              </div>
            )}

            {vidResult?.transcript && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-1">
                  <div className="font-medium text-sm">口播原文（语音识别）</div>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(vidResult.transcript!)}>复制</button>
                </div>
                <div className="text-[12px] whitespace-pre-wrap">{vidResult.transcript}</div>
              </div>
            )}

            {vidResult?.title && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-1">
                  <div className="font-medium text-sm">标题</div>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(vidResult.title!)}>复制</button>
                </div>
                <div className="text-[13px]">{vidResult.title}</div>
                {vidResult.sellingPoints && vidResult.sellingPoints.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {vidResult.sellingPoints.map((s) => <span key={s} className="tag">{s}</span>)}
                  </div>
                )}
              </div>
            )}

            {vidResult?.videoPrompt && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-1">
                  <div className="font-medium text-sm">视频生成提示词</div>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(vidResult.videoPrompt!)}>复制</button>
                </div>
                <textarea className="input h-20 resize-none text-[12px]" value={vidResult.videoPrompt} readOnly />
              </div>
            )}

            {vidResult?.script && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-1">
                  <div className="font-medium text-sm">脚本文案</div>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(vidResult.script!)}>复制</button>
                </div>
                <pre className="text-[12px] whitespace-pre-wrap bg-panel2 rounded-lg p-3">{vidResult.script}</pre>
              </div>
            )}

            {vidResult?.frameDesc && (
              <div className="card p-4">
                <div className="font-medium text-sm mb-1">画面分析</div>
                <pre className="text-[11px] text-mute whitespace-pre-wrap bg-panel2 rounded-lg p-2">{vidResult.frameDesc}</pre>
              </div>
            )}

            {!vidBusy && !vidResult && <div className="card p-4 text-[12px] text-mute">上传本地视频或填直链，点「反推」开始。会抽 4 帧看画面 + 听口播，输出视频提示词和脚本文案。</div>}
            {vidResult && (vidResult.videoPrompt || vidResult.script) && <a className="btn btn-ghost" href="/video">去视频工作台 →</a>}
          </div>
        </div>
      )}
    </div>
  );
}
