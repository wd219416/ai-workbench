"use client";
import { useEffect, useState } from "react";
import { useShell } from "@/components/AppShell";

interface Asset { id: number; type: string; file_path: string; created_at: string }
interface VTask { taskId: number; engine: string; status: string; files?: string[]; message?: string }
interface PriceRow { engine: string; model: string; unit_price: number; unit: string; discount_pct: number; discount_until: string | null }

export default function VideoPage() {
  const { meta, line } = useShell();
  const engines = (meta.videoEngines || []) as { code: string; name: string; keyHint: string }[];
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState(0);
  const [requirement, setRequirement] = useState("");
  const [duration, setDuration] = useState(5);
  const [ratio, setRatio] = useState("9:16");
  const [engine, setEngine] = useState("kling");
  const [script, setScript] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const [tasks, setTasks] = useState<VTask[]>([]);
  const [pricing, setPricing] = useState<PriceRow[]>([]);

  useEffect(() => {
    fetch("/api/assets?type=image").then((r) => r.ok ? r.json() : []).then(setAssets);
    fetch("/api/pricing").then((r) => r.ok && r.json()).then((d) => Array.isArray(d) && setPricing(d));
    // 加载最近的视频任务
    fetch("/api/tasks?kind=video").then((r) => r.ok ? r.json() : []).then((rows: { id: number; engine: string; status: string; output: string; error: string | null }[]) => {
      setTasks(rows.map((r) => {
        const out = JSON.parse(r.output || "{}");
        return { taskId: r.id, engine: r.engine, status: r.status, files: out.files, message: r.error || undefined };
      }));
    });
  }, []);

  // 当前引擎预估消耗：视频按秒计费 → 单价 × 时长；多模型显示"起"
  const costInfo = (() => {
    const rows = pricing.filter((p) => p.engine === engine);
    if (!rows.length) return null;
    const eff = (p: PriceRow) => {
      const until = p.discount_until ? new Date(p.discount_until) : null;
      const active = p.discount_pct > 0 && (!until || until.getTime() > Date.now());
      return active ? p.unit_price * (1 - p.discount_pct / 100) : p.unit_price;
    };
    const minRow = rows.reduce((a, b) => eff(a) < eff(b) ? a : b);
    const min = eff(minRow);
    const anyActive = rows.some((p) => p.discount_pct > 0 && (!p.discount_until || new Date(p.discount_until).getTime() > Date.now()));
    const perSec = minRow.unit === "秒";
    const total = perSec ? min * duration : min;
    return {
      price: Math.round(min * 100) / 100,
      unit: minRow.unit,
      total: Math.round(total * 100) / 100,
      multi: rows.length > 1,
      anyActive,
      perSec,
    };
  })();

  async function genScript() {
    setBusy("script");
    const res = await fetch("/api/prompt/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form: {
          businessLine: line === 1 ? "木盆电商" : "广告设计",
          channel: "短视频", contentType: "短视频脚本",
          requirement: `写一条${duration}秒短视频脚本（含分镜、口播文案、字幕、BGM建议），并给出视频生成提示词。要求：${requirement}`,
        },
      }),
    });
    setBusy("");
    if (!res.ok) return;
    const d = await res.json();
    setScript(d.cn);
    setVideoPrompt(d.en || d.cn);
  }

  async function submit() {
    // 合规门禁：脚本/口播文案违禁词扫描（警告不硬拦）
    const checkText = script || videoPrompt;
    if (checkText) {
      const cr = await fetch("/api/compliance/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: checkText }),
      }).then((r) => r.ok ? r.json() : { safe: true, hits: [] });
      if (cr.hits?.length) {
        const lines = cr.hits.map((h: { word: string; suggestion: string }) => `·「${h.word}」→ ${h.suggestion}`);
        if (!confirm(`⚠️ 文案命中 ${cr.hits.length} 处广告法风险：\n${lines.join("\n")}\n\n仍要继续出视频吗？`)) return;
      }
    }
    const est = costInfo ? (costInfo.perSec ? `预计 ¥${costInfo.total}` : `预计 ¥${costInfo.price}/${costInfo.unit}`) : "费用以引擎实际计费为准";
    if (!confirm(`确认出视频？\n引擎：${engine}\n时长：${duration}秒\n${est}`)) return;
    setBusy("submit");
    const asset = assets.find((a) => a.id === assetId);
    const res = await fetch("/api/video/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine, prompt: videoPrompt, duration, ratio,
        assetId: asset ? asset.id : undefined,
        businessLineId: line, promptCn: script.slice(0, 60),
      }),
    });
    setBusy("");
    const d = await res.json();
    setTasks((ts) => [{ taskId: d.taskId, engine, status: d.status, message: d.message }, ...ts]);
  }

  useEffect(() => {
    const t = setInterval(async () => {
      for (const tk of tasks.filter((x) => x.status === "processing")) {
        const res = await fetch(`/api/tasks/${tk.taskId}`);
        if (!res.ok) continue;
        const d = await res.json();
        const out = JSON.parse(d.output || "{}");
        setTasks((ts) => ts.map((x) => x.taskId === tk.taskId ? { ...x, status: d.status, files: out.files, message: d.error } : x));
      }
    }, 5000);
    return () => clearInterval(t);
  }, [tasks]);

  const copy = (t: string) => navigator.clipboard.writeText(t);

  return (
    <div className="grid grid-cols-[380px_1fr] gap-4 h-full">
      <div className="card p-4 space-y-3 overflow-auto">
        <div className="font-medium text-sm">视频需求</div>
        <div>
          <label className="label">首帧图（从素材库选，可选）</label>
          <select className="input" value={assetId} onChange={(e) => setAssetId(Number(e.target.value))}>
            <option value={0}>不用首帧图（文生视频）</option>
            {assets.map((a) => <option key={a.id} value={a.id}>#{a.id} {a.file_path}</option>)}
          </select>
          {assetId > 0 && <img src={`/api/file/${assets.find((a) => a.id === assetId)?.file_path}`} className="mt-2 rounded max-h-32" alt="" />}
        </div>
        <div><label className="label">视频要求</label>
          <textarea className="input h-24 resize-none" placeholder="如：展厅效果图漫游，镜头缓慢推进，突出形象墙和灯光氛围" value={requirement} onChange={(e) => setRequirement(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">时长（秒）</label>
            <input className="input" type="number" min={3} max={10} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
          <div><label className="label">比例</label>
            <select className="input" value={ratio} onChange={(e) => setRatio(e.target.value)}>
              <option>9:16</option><option>16:9</option><option>1:1</option><option>3:4</option>
            </select></div>
        </div>
        <button className="btn btn-brand w-full" onClick={genScript} disabled={!!busy || !requirement}>
          {busy === "script" ? "生成中…" : "生成脚本 + 视频提示词"}</button>
      </div>

      <div className="space-y-4 overflow-auto">
        <div className="card p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-medium text-sm">脚本 / 视频提示词</div>
            {script && <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(script)}>复制脚本</button>}
          </div>
          <textarea className="input h-40 resize-none text-[12px]" placeholder="脚本会显示在这里" value={script} onChange={(e) => setScript(e.target.value)} />
          <div>
            <label className="label">视频生成提示词</label>
            <textarea className="input h-16 resize-none text-[12px]" value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} />
          </div>
          <div className="flex gap-2 items-center pt-1 border-t border-line flex-wrap">
            <label className="label mb-0!">引擎</label>
            <select className="input w-44!" value={engine} onChange={(e) => setEngine(e.target.value)}>
              {engines.map((en) => <option key={en.code} value={en.code}>{en.name}（{en.keyHint}）</option>)}
            </select>
            <button className="btn btn-brand flex-1" onClick={submit} disabled={!!busy || !videoPrompt}>
              {busy === "submit" ? "提交中…" : "提交出视频"}</button>
            <a className="btn btn-ghost" href="https://jimeng.jianying.com" target="_blank" rel="noreferrer">即梦官网</a>
            {costInfo && (
              <span className="text-[11px] text-mute whitespace-nowrap w-full">
                预计 ¥{costInfo.price}/{costInfo.unit}
                {costInfo.multi ? " 起" : ""}
                {costInfo.perSec ? ` × ${duration}秒 = ¥${costInfo.total}` : ""}
                {costInfo.anyActive ? " · 限时折扣" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="card p-4">
          <div className="font-medium text-sm mb-3">视频任务</div>
          {tasks.length === 0 && <div className="text-[12px] text-mute">还没有任务。</div>}
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.taskId} className="border border-line rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="tag">#{t.taskId} {t.engine}</span>
                  <span className={`tag ${t.status === "done" ? "text-ok!" : t.status === "needs_key" || t.status === "error" || t.status === "failed" ? "text-bad!" : ""}`}>
                    {t.status === "done" ? "完成" : t.status === "processing" ? "生成中" : t.status === "needs_key" ? "缺key" : t.status}
                  </span>
                </div>
                {t.files?.map((f) => <video key={f} src={f} controls className="mt-2 rounded w-full max-h-64" />)}
                {t.message && <div className="text-[11px] text-mute mt-1">{t.message}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
