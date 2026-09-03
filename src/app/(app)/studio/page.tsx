"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShell } from "@/components/AppShell";

interface Opt { id: number; name: string; [k: string]: unknown }
interface Spec extends Opt { width: number; height: number; unit: string; dpi: number; color_mode: string; note: string }
interface Tpl extends Opt { template: string; template_en: string; negative: string; content_type_id: number }
interface Prompt { cn: string; en: string; negative: string; source: string; note?: string; semiAuto?: string }
interface Task { taskId: number; engine: string; status: string; files?: string[]; message?: string; promptCn?: string }

export default function StudioPage() {
  const { meta, line } = useShell();
  const channels = ((meta.channels || []) as Opt[]).filter((c) => c.business_line_id === line);
  const types = ((meta.types || []) as Opt[]).filter((t) => t.business_line_id === line);
  const specs = ((meta.specs || []) as Spec[]).filter((s) => s.business_line_id === line);
  const tpls = ((meta.templates || []) as Tpl[]).filter((t) => t.business_line_id === line);
  const products = ((meta.products || []) as Opt[]).filter((p) => p.business_line_id === line);
  const engines = (meta.imageEngines || []) as { code: string; name: string; keyHint: string }[];

  const [channelId, setChannelId] = useState(0);
  const [typeId, setTypeId] = useState(0);
  const [tplId, setTplId] = useState(0);
  const [productId, setProductId] = useState(0);
  const [specId, setSpecId] = useState(0);
  const [style, setStyle] = useState("");
  const [count, setCount] = useState(1);
  const [requirement, setRequirement] = useState("");
  const [engine, setEngine] = useState("lovart");
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [editCn, setEditCn] = useState(""); const [editEn, setEditEn] = useState(""); const [editNeg, setEditNeg] = useState("");
  const [busy, setBusy] = useState("");
  const [refImg, setRefImg] = useState<{ assetId: number; url: string } | null>(null);
  const [reverseOut, setReverseOut] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pricing, setPricing] = useState<{ engine: string; model: string; unit_price: number; unit: string; discount_pct: number; discount_until: string | null }[]>([]);
  const pasteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/pricing").then((r) => r.ok && r.json()).then((d) => Array.isArray(d) && setPricing(d));
  }, []);

  // 当前引擎的预估消耗（取该引擎最低价；多模型显示"起"）
  const costInfo = (() => {
    const rows = pricing.filter((p) => p.engine === engine);
    if (!rows.length) return null;
    const eff = (p: typeof rows[number]) => {
      const until = p.discount_until ? new Date(p.discount_until) : null;
      const active = p.discount_pct > 0 && (!until || until.getTime() > Date.now());
      return active ? p.unit_price * (1 - p.discount_pct / 100) : p.unit_price;
    };
    const min = Math.min(...rows.map(eff));
    const anyActive = rows.some((p) => p.discount_pct > 0 && (!p.discount_until || new Date(p.discount_until).getTime() > Date.now()));
    return { price: Math.round(min * 100) / 100, unit: rows[0].unit, multi: rows.length > 1, anyActive };
  })();

  useEffect(() => {
    setChannelId(channels[0]?.id || 0); setTypeId(0); setTplId(0); setProductId(0); setSpecId(0);
  }, [line, meta]);

  // 首次进入加载最近的出图任务（结果墙上墙）
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/tasks?kind=image");
      if (!res.ok) return;
      const rows = (await res.json()) as { id: number; engine: string; status: string; input: string; output: string; error: string | null }[];
      setTasks(rows.map((r) => {
        const inp = JSON.parse(r.input || "{}");
        const out = JSON.parse(r.output || "{}");
        return { taskId: r.id, engine: r.engine, status: r.status, files: out.files, message: r.error || undefined, promptCn: (inp.promptCn || "").slice(0, 40) };
      }));
    })();
  }, []);

  const curTpl = tpls.find((t) => t.id === tplId);
  const curSpec = specs.find((s) => s.id === specId);
  const name = (list: Opt[], id: number) => list.find((x) => x.id === id)?.name || "";

  const uploadImage = useCallback(async (file: File) => {
    const fd = new FormData(); fd.append("image", file); fd.append("kind", "ref");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) { const d = await res.json(); setRefImg({ assetId: d.assetId, url: d.url }); }
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

  function formJson() {
    const prod = products.find((p) => p.id === productId) as { name?: string; wood?: string; size?: string; style?: string; selling_points?: string } | undefined;
    return {
      businessLine: line === 1 ? "木盆电商" : "广告设计",
      channel: name(channels, channelId),
      contentType: name(types, typeId),
      product: prod ? `${prod.name}（${[prod.wood, prod.size, prod.style].filter(Boolean).join("/")}，卖点：${prod.selling_points}）` : "",
      style, sizeText: curSpec ? `${curSpec.width}x${curSpec.height || "?"}${curSpec.unit}` : "",
      requirement,
    };
  }

  async function genPrompt() {
    setBusy("prompt");
    const res = await fetch("/api/prompt/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form: formJson(), templateId: tplId || undefined }),
    });
    setBusy("");
    if (!res.ok) return;
    const d: Prompt = await res.json();
    setPrompt(d); setEditCn(d.cn); setEditEn(d.en); setEditNeg(d.negative);
  }

  async function optimize(direction: string) {
    setBusy("opt");
    const res = await fetch("/api/prompt/optimize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cn: editCn, en: editEn, direction }),
    });
    setBusy("");
    if (!res.ok) return;
    const d = await res.json();
    setEditCn(d.cn); setEditEn(d.en); if (d.negative) setEditNeg(d.negative);
  }

  async function reverse() {
    if (!refImg) return;
    setBusy("rev"); setReverseOut("");
    const blob = await (await fetch(refImg.url)).blob();
    const fd = new FormData(); fd.append("image", new File([blob], "ref.png", { type: blob.type }));
    const res = await fetch("/api/prompt/reverse", { method: "POST", body: fd });
    setBusy("");
    const d = await res.json();
    if (d.prompt) {
      try { const p = JSON.parse(d.prompt); setEditCn(p.cn || ""); setEditEn(p.en || ""); setReverseOut("已反推并填入提示词（来源：" + d.source + "）"); }
      catch { setReverseOut(d.prompt); }
    } else {
      setReverseOut((d.note ? d.note + "\n\n" : "") + (d.semiAuto || ""));
    }
  }

  async function generate() {
    setBusy("gen");
    const res = await fetch("/api/image/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine, prompt: editEn || editCn, negative: editNeg,
        width: curSpec?.width, height: curSpec?.height || undefined, n: count,
        refAssetId: refImg?.assetId, businessLineId: line, channelId, contentTypeId: typeId, promptCn: editCn,
      }),
    });
    setBusy("");
    const d = await res.json();
    setTasks((ts) => [{ taskId: d.taskId, engine, status: d.status, files: d.files, message: d.message, promptCn: editCn.slice(0, 40) }, ...ts]);
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
    }, 4000);
    return () => clearInterval(t);
  }, [tasks]);

  const copy = (t: string) => navigator.clipboard.writeText(t);
  const sel = (list: Opt[], v: number, set: (n: number) => void, ph: string) => (
    <select className="input" value={v} onChange={(e) => set(Number(e.target.value))}>
      <option value={0}>{ph}</option>
      {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );

  return (
    <div className="grid grid-cols-[380px_1fr] gap-4 h-full">
      {/* 左：需求表单 */}
      <div className="card p-4 space-y-3 overflow-auto">
        <div className="font-medium text-sm">需求录入</div>
        <div><label className="label">渠道 / 项目</label>{sel(channels, channelId, setChannelId, "选择渠道")}</div>
        <div><label className="label">内容类型</label>{sel(types, typeId, setTypeId, "选择内容类型")}</div>
        <div><label className="label">提示词模板</label>{sel(tpls.filter((t) => !typeId || t.content_type_id === typeId || !t.content_type_id), tplId, setTplId, "选模板（可选）")}</div>
        {line === 1 && <div><label className="label">产品（知识库）</label>{sel(products, productId, setProductId, "选择产品（可选）")}</div>}
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">规格预设</label>{sel(specs, specId, setSpecId, "尺寸")}</div>
          <div><label className="label">张数</label>
            <input className="input" type="number" min={1} max={4} value={count} onChange={(e) => setCount(Number(e.target.value))} /></div>
        </div>
        <div><label className="label">风格</label>
          <input className="input" placeholder="如：ins风 / 中式 / 科技感 / 党建红" value={style} onChange={(e) => setStyle(e.target.value)} /></div>
        <div><label className="label">具体要求</label>
          <textarea className="input h-20 resize-none" placeholder="大白话描述你要的图，如：碳化木花盆放阳台，旁边放龟背竹，下午自然光" value={requirement} onChange={(e) => setRequirement(e.target.value)} /></div>

        {/* 参考图 */}
        <div>
          <label className="label">参考图（点这里按 Ctrl+V 粘贴截屏）</label>
          <div ref={pasteRef} tabIndex={0}
            className="border border-dashed border-line rounded-lg p-2 min-h-16 flex items-center justify-center cursor-pointer focus:border-brand outline-none"
            onClick={() => document.getElementById("ref-file")?.click()}>
            {refImg ? <img src={refImg.url} alt="ref" className="max-h-32 rounded" /> : <span className="text-[12px] text-mute">截屏后按 Ctrl+V，或点击上传</span>}
          </div>
          <input id="ref-file" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn btn-brand flex-1" onClick={genPrompt} disabled={!!busy || !requirement}>
            {busy === "prompt" ? "生成中…" : "生成提示词"}</button>
          <button className="btn btn-ghost" onClick={reverse} disabled={!!busy || !refImg}>
            {busy === "rev" ? "反推中…" : "反推提示词"}</button>
        </div>
        {reverseOut && <pre className="text-[11px] text-mute whitespace-pre-wrap bg-panel2 rounded-lg p-2">{reverseOut}</pre>}
      </div>

      {/* 右：提示词 + 出图 */}
      <div className="space-y-4 overflow-auto">
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">提示词</div>
            {prompt && <span className="tag">{prompt.source === "deepseek" ? "DeepSeek 生成" : "本地模板"}</span>}
          </div>
          {prompt?.note && <div className="text-[11px] text-brand">{prompt.note}</div>}
          <div>
            <div className="flex justify-between items-center"><label className="label">中文提示词</label>
              <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(editCn)}>复制</button></div>
            <textarea className="input h-16 resize-none text-[12px]" value={editCn} onChange={(e) => setEditCn(e.target.value)} />
          </div>
          <div>
            <div className="flex justify-between items-center"><label className="label">英文提示词</label>
              <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(editEn)}>复制</button></div>
            <textarea className="input h-16 resize-none text-[12px]" value={editEn} onChange={(e) => setEditEn(e.target.value)} />
          </div>
          <div>
            <label className="label">负面提示词</label>
            <input className="input text-[12px]" value={editNeg} onChange={(e) => setEditNeg(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["提升画质与细节", "强化光影氛围", "换成更高级的商业摄影风", "精简提示词"].map((d) => (
              <button key={d} className="btn btn-ghost py-1! px-2! text-[11px]" onClick={() => optimize(d)} disabled={!!busy || !editCn}>优化：{d}</button>
            ))}
          </div>
          {prompt?.semiAuto && (
            <div className="border border-line rounded-lg p-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-mute">ChatGPT / Codex 通道（复制后到网页版或桌面版粘贴）</span>
                <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(prompt.semiAuto!)}>复制指令</button>
              </div>
            </div>
          )}
          <div className="flex gap-2 items-center pt-1 border-t border-line">
            <label className="label mb-0!">出图引擎</label>
            <select className="input w-40!" value={engine} onChange={(e) => setEngine(e.target.value)}>
              {engines.map((en) => <option key={en.code} value={en.code}>{en.name}（{en.keyHint}）</option>)}
            </select>
            <button className="btn btn-brand flex-1" onClick={generate} disabled={!!busy || !editCn}>
              {busy === "gen" ? "提交中…" : "出图"}</button>
            {costInfo && <span className="text-[11px] text-mute whitespace-nowrap">预计 ¥{costInfo.price}/{costInfo.unit}{costInfo.multi ? " 起" : ""}{costInfo.anyActive ? " · 限时折扣" : ""}</span>}
          </div>
        </div>

        {/* 结果墙 */}
        <div className="card p-4">
          <div className="font-medium text-sm mb-3">出图结果</div>
          {tasks.length === 0 && <div className="text-[12px] text-mute">还没有任务。填好需求 → 生成提示词 → 出图。</div>}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {tasks.map((t) => (
              <div key={t.taskId} className="border border-line rounded-lg p-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="tag">#{t.taskId} {t.engine}</span>
                  <span className={`tag ${t.status === "done" ? "text-ok!" : t.status === "failed" || t.status === "error" || t.status === "needs_key" ? "text-bad!" : ""}`}>
                    {t.status === "done" ? "完成" : t.status === "processing" ? "生成中" : t.status === "needs_key" ? "缺key" : t.status}
                  </span>
                </div>
                {t.files?.map((f) => (
                  <a key={f} href={f} target="_blank" rel="noreferrer">
                    <img src={f} alt="" className="rounded w-full" />
                  </a>
                ))}
                {t.message && <div className="text-[11px] text-mute mt-1">{t.message}</div>}
                {t.promptCn && <div className="text-[11px] text-mute mt-1 truncate">{t.promptCn}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
