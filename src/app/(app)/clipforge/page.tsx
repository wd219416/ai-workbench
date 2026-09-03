"use client";
import { useEffect, useState } from "react";
import { useShell } from "@/components/AppShell";

interface Asset { id: number; type: string; file_path: string; created_at: string }
interface ClipResult {
  sellingPoints: string[];
  title: string;
  script: string;
  videoPrompt: string;
  source: string;
  note?: string;
  compliance?: { safe: boolean; hits: { word: string; suggestion: string }[] };
}
interface VTask { taskId: number; engine: string; status: string; files?: string[]; message?: string }
interface PriceRow { engine: string; model: string; unit_price: number; unit: string; discount_pct: number; discount_until: string | null }
interface ReviewItem { role: string; verdict: "硬伤" | "应改" | "品味"; comment: string }
interface ReviewResult { items: ReviewItem[]; score: number; source: string; note?: string }

const PLATFORMS = ["抖音", "快手", "小红书", "视频号", "淘宝"];
const SCRIPT_TYPES = ["痛点", "场景", "测评"];

export default function ClipforgePage() {
  const { meta, line } = useShell();
  const engines = (meta.videoEngines || []) as { code: string; name: string; keyHint: string }[];
  const [product, setProduct] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [platform, setPlatform] = useState("抖音");
  const [scriptType, setScriptType] = useState("场景");
  const [duration, setDuration] = useState(8);
  const [engine, setEngine] = useState("kling");
  const [result, setResult] = useState<ClipResult | null>(null);
  const [editScript, setEditScript] = useState("");
  const [editVideoPrompt, setEditVideoPrompt] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState(0);
  const [busy, setBusy] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [tasks, setTasks] = useState<VTask[]>([]);
  const [pricing, setPricing] = useState<PriceRow[]>([]);

  useEffect(() => {
    fetch("/api/assets?type=image").then((r) => r.ok ? r.json() : []).then(setAssets);
    fetch("/api/pricing").then((r) => r.ok && r.json()).then((d) => Array.isArray(d) && setPricing(d));
    fetch("/api/tasks?kind=video").then((r) => r.ok ? r.json() : []).then((rows: { id: number; engine: string; status: string; output: string; error: string | null }[]) => {
      setTasks(rows.map((r) => {
        const out = JSON.parse(r.output || "{}");
        return { taskId: r.id, engine: r.engine, status: r.status, files: out.files, message: r.error || undefined };
      }));
    });
  }, []);

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
    const perSec = minRow.unit === "秒";
    return { price: Math.round(min * 100) / 100, unit: minRow.unit, total: Math.round((perSec ? min * duration : min) * 100) / 100, perSec, multi: rows.length > 1 };
  })();

  async function generate() {
    setBusy("gen");
    const res = await fetch("/api/clipforge", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, sellingPoints, platform, scriptType, duration }),
    });
    setBusy("");
    if (!res.ok) return;
    const d: ClipResult = await res.json();
    setResult(d);
    setEditScript(d.script);
    setEditVideoPrompt(d.videoPrompt);
  }

  async function doReview() {
    if (!editScript) return;
    setReviewBusy(true);
    setReview(null);
    const res = await fetch("/api/clipforge/review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: editScript, context: `${product} · ${platform} · ${scriptType}` }),
    });
    setReviewBusy(false);
    if (!res.ok) return;
    setReview(await res.json());
  }

  async function submit() {
    const checkText = editScript;
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
        engine, prompt: editVideoPrompt, duration,
        ratio: "9:16",
        assetId: asset ? asset.id : undefined,
        businessLineId: line, promptCn: (result?.title || editScript).slice(0, 60),
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
      {/* 左：商品信息 */}
      <div className="card p-4 space-y-3 overflow-auto">
        <div className="font-medium text-sm">带货商品信息</div>
        <div>
          <label className="label">商品（名称 + 核心描述）</label>
          <textarea className="input h-24 resize-none" placeholder="如：碳化木方形花盆 30×30×30cm，实木加厚、榫卯结构、阳台庭院两用" value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <div>
          <label className="label">已有卖点（可选，逗号分隔）</label>
          <input className="input" placeholder="留空则 AI 自动提炼卖点" value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">平台</label>
            <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">脚本类型</label>
            <select className="input" value={scriptType} onChange={(e) => setScriptType(e.target.value)}>
              {SCRIPT_TYPES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">时长（秒）</label>
            <input className="input" type="number" min={3} max={16} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">首帧图（可选）</label>
            <select className="input" value={assetId} onChange={(e) => setAssetId(Number(e.target.value))}>
              <option value={0}>不用首帧图</option>
              {assets.map((a) => <option key={a.id} value={a.id}>#{a.id} {a.file_path}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-brand w-full" onClick={generate} disabled={!!busy || !product}>
          {busy === "gen" ? "生成中…" : "生成卖点 + 带货脚本"}</button>
      </div>

      {/* 右：脚本 + 出视频 */}
      <div className="space-y-4 overflow-auto">
        <div className="card p-4 space-y-3">
          {result && (
            <>
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{result.title || "带货脚本"}</div>
                <span className="tag">{result.source === "deepseek" ? "DeepSeek 生成" : "本地模板"}</span>
              </div>
              {result.note && <div className="text-[11px] text-brand">{result.note}</div>}
              {result.compliance && result.compliance.hits?.length > 0 && (
                <div className="text-[11px] text-bad bg-bad/10 border border-bad/30 rounded-lg p-2">
                  ⚠️ 脚本命中 {result.compliance.hits.length} 处广告法风险：
                  {result.compliance.hits.map((h) => `「${h.word}」→ ${h.suggestion}`).join("；")}
                </div>
              )}
              {result.sellingPoints?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.sellingPoints.map((p) => <span key={p} className="tag">卖点：{p}</span>)}
                </div>
              )}
            </>
          )}
          <div>
            <div className="flex justify-between items-center">
              <label className="label">脚本（可编辑）</label>
              <div className="flex gap-1 items-center">
                <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(editScript)} disabled={!editScript}>复制脚本</button>
                <button className="tag cursor-pointer hover:border-brand" onClick={doReview} disabled={reviewBusy || !editScript}>
                  {reviewBusy ? "质检中…" : "判官团质检"}</button>
              </div>
            </div>
            <textarea className="input h-40 resize-none text-[12px]" placeholder="卖点 + 脚本会显示在这里" value={editScript} onChange={(e) => setEditScript(e.target.value)} />
          </div>
          {review && (
            <div className="border border-line rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium">判官团质检</span>
                {review.score > 0 && <span className="tag">{review.score} / 10 分</span>}
              </div>
              {review.note && <div className="text-[11px] text-brand">{review.note}</div>}
              {review.items.map((it) => (
                <div key={it.role} className="flex gap-2 items-start">
                  <span className={`tag shrink-0 ${it.verdict === "硬伤" ? "text-bad!" : it.verdict === "应改" ? "text-brand!" : "text-mute!"}`}>{it.role}·{it.verdict}</span>
                  <span className="text-[11px] text-mute leading-relaxed">{it.comment}</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="label">视频生成提示词</label>
            <textarea className="input h-16 resize-none text-[12px]" value={editVideoPrompt} onChange={(e) => setEditVideoPrompt(e.target.value)} />
          </div>
          <div className="flex gap-2 items-center pt-1 border-t border-line flex-wrap">
            <label className="label mb-0!">引擎</label>
            <select className="input w-44!" value={engine} onChange={(e) => setEngine(e.target.value)}>
              {engines.map((en) => <option key={en.code} value={en.code}>{en.name}（{en.keyHint}）</option>)}
            </select>
            <button className="btn btn-brand flex-1" onClick={submit} disabled={!!busy || !editVideoPrompt}>
              {busy === "submit" ? "提交中…" : "出带货视频"}</button>
            {costInfo && (
              <span className="text-[11px] text-mute whitespace-nowrap w-full">
                预计 ¥{costInfo.price}/{costInfo.unit}
                {costInfo.multi ? " 起" : ""}
                {costInfo.perSec ? ` × ${duration}秒 = ¥${costInfo.total}` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="card p-4">
          <div className="font-medium text-sm mb-3">带货视频任务</div>
          {tasks.length === 0 && <div className="text-[12px] text-mute">还没有任务。填商品信息 → 生成脚本 → 出视频。</div>}
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
