"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShell } from "@/components/AppShell";

interface Opt { id: number; name: string; [k: string]: unknown }
interface Spec extends Opt { width: number; height: number; unit: string; dpi: number; color_mode: string; note: string }
interface Tpl extends Opt { template: string; template_en: string; negative: string; content_type_id: number }
interface Prompt { cn: string; en: string; negative: string; source: string; note?: string; semiAuto?: string; compliance?: { safe: boolean; hits: { word: string; suggestion: string }[] } }
interface Task { taskId: number; engine: string; status: string; files?: string[]; message?: string; promptCn?: string }

function TaskCard({ t, onChange }: { t: Task; onChange: React.Dispatch<React.SetStateAction<Task[]>> }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const extOf = (url: string) => {
    const raw = url.split("?")[0].split(".").pop()?.toLowerCase() || "png";
    return ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm"].includes(raw) ? raw : "png";
  };

  const saveAs = (url: string, index: number) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-${t.taskId}-${index + 1}.${extOf(url)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  };

  const rename = async () => {
    const title = window.prompt("重命名任务", t.promptCn || "");
    if (!title || title === t.promptCn) return;
    const res = await fetch(`/api/tasks/${t.taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      onChange((prev) => prev.map((x) => x.taskId === t.taskId ? { ...x, promptCn: title } : x));
    } else {
      alert("重命名失败");
    }
  };

  const del = async () => {
    if (!confirm(`确认删除任务 #${t.taskId}？图片将一并删除，不可恢复。`)) return;
    const res = await fetch(`/api/tasks/${t.taskId}`, { method: "DELETE" });
    if (res.ok) {
      onChange((prev) => prev.filter((x) => x.taskId !== t.taskId));
    } else {
      alert("删除失败");
    }
  };

  return (
    <div className="border border-line rounded-lg p-2">
      <div className="flex justify-between items-center mb-2 gap-2">
        <span className="tag truncate">#{t.taskId} {t.engine}</span>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`tag ${t.status === "done" ? "text-ok!" : t.status === "failed" || t.status === "error" || t.status === "needs_key" ? "text-bad!" : ""}`}>
            {t.status === "done" ? "完成" : t.status === "processing" ? "生成中" : t.status === "needs_key" ? "缺key" : t.status}
          </span>
          <div className="relative" ref={menuRef}>
            <button className="tag px-1.5! hover:border-brand cursor-pointer" onClick={() => setOpen((v) => !v)}>⋯</button>
            {open && (
              <div className="absolute right-0 top-full mt-1 z-10 bg-panel border border-line rounded-lg shadow-lg min-w-[96px] py-1">
                {t.files && t.files.length > 0 && t.files.map((f, i) => (
                  <button key={f + i} className="block w-full text-left px-3 py-1.5 text-[11px] hover:bg-line whitespace-nowrap cursor-pointer" onClick={() => saveAs(f, i)}>
                    另存{t.files!.length > 1 ? `图${i + 1}` : ""}
                  </button>
                ))}
                <button className="block w-full text-left px-3 py-1.5 text-[11px] hover:bg-line cursor-pointer" onClick={() => { setOpen(false); rename(); }}>重命名</button>
                <button className="block w-full text-left px-3 py-1.5 text-[11px] text-bad hover:bg-line cursor-pointer" onClick={() => { setOpen(false); del(); }}>删除</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {t.files?.map((f) => (
        <a key={f} href={f} target="_blank" rel="noreferrer">
          <img src={f} alt="" className="rounded w-full" />
        </a>
      ))}
      {t.message && <div className="text-[11px] text-mute mt-1">{t.message}</div>}
      {t.promptCn && <div className="text-[11px] text-mute mt-1 truncate" title={t.promptCn}>{t.promptCn}</div>}
    </div>
  );
}

/** 产品保真场景模板：一键填入具体要求（配合多角度参考图使用，产品外观/材质/颜色不跑偏） */
const FIDELITY_SCENES = [
  { name: "白底主图", text: "纯白背景电商主图，产品居中，柔和均匀布光，保留产品真实比例、材质与细节，高商业摄影质感" },
  { name: "场景图", text: "把产品放入真实生活场景，自然光氛围，景深虚化，场景元素与产品调性一致，产品保持参考图原样不变形" },
  { name: "模特展示", text: "模特手持/使用产品的展示图，姿态自然，突出使用场景，产品外观材质颜色与参考图完全一致" },
  { name: "节日促销", text: "节日促销氛围图，暖色灯光与节日元素点缀，产品为视觉中心，构图四周留出促销文案空间，产品保持原样" },
  { name: "换背景重打光", text: "保持产品外观、材质、颜色、结构完全不变，仅更换背景并重新打光，电影级布光质感" },
];

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
  const [refImgs, setRefImgs] = useState<{ assetId: number; url: string }[]>([]);
  const [reverseOut, setReverseOut] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pricing, setPricing] = useState<{ engine: string; model: string; unit_price: number; unit: string; discount_pct: number; discount_until: string | null }[]>([]);
  const [loras, setLoras] = useState<{ id: number; name: string; weight: number; license: string }[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<number[]>([]);
  const [comfyModels, setComfyModels] = useState<{ checkpoints: string[]; loras: string[] } | null>(null);
  const [comfyCkpt, setComfyCkpt] = useState("");
  const [comfySelLoras, setComfySelLoras] = useState<Record<string, number>>({}); // LoRA 文件名 -> 权重
  const pasteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/pricing").then((r) => r.ok && r.json()).then((d) => Array.isArray(d) && setPricing(d));
  }, []);

  // 加载收藏的风格模型（LoRA）供出图套用
  useEffect(() => {
    fetch("/api/liblib/models?kind=lora").then((r) => r.ok && r.json()).then((d) => {
      if (Array.isArray(d)) setLoras(d.map((m: { id: number; name: string; weight: number; license: string }) => ({ id: m.id, name: m.name, weight: m.weight, license: m.license })));
    });
  }, []);

  // ComfyUI 引擎：拉取本地可用底模与 LoRA 列表（服务端代理，前端不直连 8188）
  useEffect(() => {
    if (engine !== "comfyui") return;
    fetch("/api/comfyui/models").then((r) => r.ok && r.json()).then((d) => {
      if (Array.isArray(d?.checkpoints)) {
        setComfyModels({ checkpoints: d.checkpoints, loras: d.loras || [] });
        setComfyCkpt((prev) => (prev && d.checkpoints.includes(prev) ? prev : d.checkpoints[0] || ""));
      }
    }).catch(() => setComfyModels(null));
  }, [engine]);

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
    if (res.ok) {
      const d = await res.json();
      setRefImgs((prev) => prev.length >= 4 ? (alert("参考图最多 4 张"), prev) : [...prev, { assetId: d.assetId, url: d.url }]);
    }
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
    const ref = refImgs[0];
    if (!ref) return;
    setBusy("rev"); setReverseOut("");
    const blob = await (await fetch(ref.url)).blob();
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
    // 合规门禁：广告法违禁词扫描（警告不硬拦，最终判断权交人工）
    if (editCn) {
      const cr = await fetch("/api/compliance/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editCn }),
      }).then((r) => r.ok ? r.json() : { safe: true, hits: [] });
      if (cr.hits?.length) {
        const lines = cr.hits.map((h: { word: string; suggestion: string }) => `·「${h.word}」→ ${h.suggestion}`);
        if (!confirm(`⚠️ 文案命中 ${cr.hits.length} 处广告法风险：\n${lines.join("\n")}\n\n仍要继续出图吗？`)) return;
      }
    }
    const est = costInfo ? `预计 ¥${costInfo.price}/${costInfo.unit}${costInfo.multi ? " 起" : ""}` : "费用以引擎实际计费为准";
    if (!confirm(`确认出图？\n引擎：${engine}\n张数：${count}\n${est}`)) return;
    setBusy("gen");
    const res = await fetch("/api/image/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine, prompt: editEn || editCn, negative: editNeg,
        width: curSpec?.width, height: curSpec?.height || undefined, n: count,
        refAssetId: refImgs[0]?.assetId, refAssetIds: refImgs.length ? refImgs.map((r) => r.assetId) : undefined,
        businessLineId: line, channelId, contentTypeId: typeId, promptCn: editCn,
        loraIds: engine === "liblib" && selectedLoras.length ? selectedLoras : undefined,
        ckpt: engine === "comfyui" ? comfyCkpt || undefined : undefined,
        comfyLoras: engine === "comfyui" && Object.keys(comfySelLoras).length
          ? Object.entries(comfySelLoras).map(([name, weight]) => ({ name, weight }))
          : undefined,
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

        {/* 参考图（产品保真：多角度，最多 4 张） */}
        <div>
          <label className="label">参考图（{refImgs.length}/4，产品保真建议传多角度；点这里 Ctrl+V 粘贴）</label>
          <div ref={pasteRef} tabIndex={0}
            className="border border-dashed border-line rounded-lg p-2 min-h-16 flex items-center gap-2 flex-wrap cursor-pointer focus:border-brand outline-none"
            onClick={() => refImgs.length < 4 && document.getElementById("ref-file")?.click()}>
            {refImgs.length === 0 && <span className="text-[12px] text-mute">截屏后按 Ctrl+V，或点击上传（可传正面/侧面/细节多角度）</span>}
            {refImgs.map((r, i) => (
              <div key={r.assetId} className="relative group">
                <img src={r.url} alt={`ref${i + 1}`} className="h-24 w-24 object-cover rounded border border-line" />
                <button
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-panel border border-line text-[11px] leading-none cursor-pointer hover:text-bad"
                  title="移除"
                  onClick={(e) => { e.stopPropagation(); setRefImgs((prev) => prev.filter((x) => x.assetId !== r.assetId)); }}>×</button>
                {i === 0 && <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-panel/80 rounded-b">主参考</span>}
              </div>
            ))}
            {refImgs.length > 0 && refImgs.length < 4 && <span className="text-[11px] text-mute">＋ 继续添加</span>}
          </div>
          <input id="ref-file" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
        </div>

        {/* 产品保真场景模板：一键填入具体要求 */}
        <div>
          <label className="label">保真场景（点一下填入对应模板，配合参考图使用）</label>
          <div className="flex flex-wrap gap-1.5">
            {FIDELITY_SCENES.map((s) => (
              <button key={s.name} className="tag cursor-pointer px-2! py-1! hover:border-brand" title={s.text}
                onClick={() => setRequirement((prev) => (prev ? `${prev}\n${s.text}` : s.text))}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn btn-brand flex-1" onClick={genPrompt} disabled={!!busy || !requirement}>
            {busy === "prompt" ? "生成中…" : "生成提示词"}</button>
          <button className="btn btn-ghost" onClick={reverse} disabled={!!busy || !refImgs.length}>
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
          {prompt?.compliance && prompt.compliance.hits?.length > 0 && (
            <div className="text-[11px] text-bad bg-bad/10 border border-bad/30 rounded-lg p-2">
              ⚠️ 文案命中 {prompt.compliance.hits.length} 处广告法风险：
              {prompt.compliance.hits.map((h) => `「${h.word}」→ ${h.suggestion}`).join("；")}
            </div>
          )}
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
          {engine === "comfyui" && comfyModels && (
            <div className="border border-line rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0!">底模</label>
                <select className="input w-64!" value={comfyCkpt} onChange={(e) => setComfyCkpt(e.target.value)}>
                  {comfyModels.checkpoints.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <span className="text-[11px] text-mute">本地 LoRA（可多选，最多 5 个；文件放 Models/loras/ 目录后自动出现）</span>
              {comfyModels.loras.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {comfyModels.loras.map((l) => {
                      const on = l in comfySelLoras;
                      return (
                        <button key={l}
                          onClick={() => setComfySelLoras((prev) => {
                            const n = { ...prev };
                            if (on) delete n[l];
                            else if (Object.keys(n).length < 5) n[l] = 1;
                            return n;
                          })}
                          className={`tag cursor-pointer px-2! py-1! ${on ? "border-brand text-brand" : ""}`}>
                          {l}
                        </button>
                      );
                    })}
                  </div>
                  {Object.keys(comfySelLoras).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(comfySelLoras).map(([name, weight]) => (
                        <div key={name} className="flex items-center gap-2 text-[12px]">
                          <span className="truncate max-w-[220px]" title={name}>{name}</span>
                          <span className="text-mute">权重</span>
                          <input type="number" step="0.1" min="-2" max="2" value={weight}
                            onChange={(e) => setComfySelLoras((p) => ({ ...p, [name]: Number(e.target.value) }))}
                            className="input w-16! py-0.5!" />
                          <button className="tag cursor-pointer px-1.5! py-0.5!" onClick={() => setComfySelLoras((p) => { const n = { ...p }; delete n[name]; return n; })}>移除</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[11px] text-mute mt-1">本地暂无 LoRA 文件（Models/loras/ 目录为空）</div>
              )}
            </div>
          )}
          {engine === "liblib" && loras.length > 0 && (
            <div className="border border-line rounded-lg p-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] text-mute">风格模型（LoRA，最多 5 个，可多选）</span>
                <a href="/liblib" className="tag cursor-pointer hover:border-brand" target="_blank" rel="noreferrer">管理模型库</a>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {loras.map((l) => {
                  const on = selectedLoras.includes(l.id);
                  const bad = l.license === "forbidden";
                  return (
                    <button key={l.id}
                      onClick={() => setSelectedLoras((prev) => on ? prev.filter((x) => x !== l.id) : prev.length < 5 ? [...prev, l.id] : prev)}
                      disabled={bad}
                      className={`tag cursor-pointer px-2! py-1! ${on ? "border-brand text-brand" : ""} ${bad ? "opacity-40 cursor-not-allowed" : ""}`}>
                      {l.name}{bad ? " · 禁商用" : ""}
                    </button>
                  );
                })}
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
              <TaskCard key={t.taskId} t={t} onChange={setTasks} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
