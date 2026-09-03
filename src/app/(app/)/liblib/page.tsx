"use client";
import { useEffect, useMemo, useState } from "react";

interface Model {
  id: number;
  version_uuid: string;
  model_id: string;
  name: string;
  kind: string;
  style: string;
  base_algo: string;
  license: string;
  weight: number;
  model_url: string;
  note: string;
  business_line_id: number | null;
  created_at: string;
}

const KINDS = [
  { v: "lora", label: "LoRA" },
  { v: "checkpoint", label: "Checkpoint 底模" },
];

const LICENSES = [
  { v: "commercial", label: "可商用", cls: "bg-emerald-100 text-emerald-700" },
  { v: "member_only", label: "会员可商用", cls: "bg-amber-100 text-amber-700" },
  { v: "unknown", label: "授权未知", cls: "bg-slate-100 text-slate-600" },
  { v: "forbidden", label: "禁商用", cls: "bg-rose-100 text-rose-700" },
];

export default function LiblibModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Partial<Model>>({ kind: "lora", weight: 0.6, license: "unknown" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const fetchModels = async () => {
    setLoading(true);
    const r = await fetch("/api/liblib/models" + (kindFilter ? `?kind=${kindFilter}` : ""));
    const data = await r.json();
    setModels(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchModels(); }, [kindFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (!q) return true;
      const hay = `${m.name} ${m.style} ${m.base_algo} ${m.note}`.toLowerCase();
      return hay.includes(q);
    });
  }, [models, query]);

  const resetForm = () => {
    setForm({ kind: "lora", weight: 0.6, license: "unknown" });
    setEditingId(null);
    setMsg("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, fetch: true };
    const url = "/api/liblib/models";
    const r = await fetch(url, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { ...body, id: editingId } : body),
    });
    const data = await r.json();
    if (!r.ok) { setMsg(data.error || "保存失败"); return; }
    resetForm();
    await fetchModels();
  };

  const edit = (m: Model) => {
    setForm({ ...m });
    setEditingId(m.id);
    setMsg("");
  };

  const remove = async (id: number) => {
    if (!confirm("确定删除这个模型收藏？")) return;
    const r = await fetch("/api/liblib/models", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.ok) fetchModels();
  };

  const licenseBadge = (license: string) => {
    const item = LICENSES.find((l) => l.v === license) || LICENSES[2];
    return <span className={`text-[11px] px-1.5 py-0.5 rounded ${item.cls}`}>{item.label}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-medium text-sm">Liblib 风格模型库</div>
          <div className="text-[11px] text-mute mt-0.5">
            收藏 Liblib 的 LoRA / Checkpoint，出图时一键套用；授权状态用于合规过滤
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-40!" placeholder="搜索模型…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="input w-28!" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">全部</option>
            {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
          </select>
        </div>
      </div>

      <form onSubmit={submit} className="card p-4 space-y-3">
        <div className="text-xs font-medium">{editingId ? "编辑模型" : "新增模型"}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="label">versionUuid（Liblib 模型版本 UUID）{editingId ? "" : <span className="text-rose-500">*</span>}</label>
            <input className="input w-full" value={form.version_uuid || ""} onChange={(e) => setForm({ ...form, version_uuid: e.target.value })} placeholder="如 18229ae22da74831a5b1ae6517dfaf59" required={!editingId} />
          </div>
          <div>
            <label className="label">类型</label>
            <select className="input w-full" value={form.kind || "lora"} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">模型名（留空则从 Liblib 自动拉取）</label>
            <input className="input w-full" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="模型名" />
          </div>
          <div>
            <label className="label">风格标签</label>
            <input className="input w-full" value={form.style || ""} onChange={(e) => setForm({ ...form, style: e.target.value })} placeholder="电商 / 国潮 / 产品摄影…" />
          </div>
          <div>
            <label className="label">默认权重</label>
            <input className="input w-full" type="number" step="0.1" min="0.1" max="1.5" value={form.weight ?? 0.6} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">商用授权</label>
            <select className="input w-full" value={form.license || "unknown"} onChange={(e) => setForm({ ...form, license: e.target.value })}>
              {LICENSES.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">备注 / 触发词</label>
            <input className="input w-full" value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="触发词、推荐参数、使用场景…" />
          </div>
        </div>
        {msg && <div className="text-[11px] text-rose-500">{msg}</div>}
        <div className="flex gap-2">
          <button className="btn btn-brand" type="submit">{editingId ? "保存" : "收藏"}</button>
          {editingId && <button className="btn btn-ghost" type="button" onClick={resetForm}>取消</button>}
        </div>
      </form>

      {loading ? (
        <div className="text-mute text-sm py-8 text-center">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-mute text-sm">
          还没有收藏模型。去 Liblib 官网找到模型版本 UUID，贴到上方即可收藏。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((m) => (
            <div key={m.id} className="card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-sm truncate flex-1" title={m.name}>{m.name}</div>
                {licenseBadge(m.license)}
              </div>
              <div className="text-[11px] text-mute space-y-0.5">
                <div className="flex gap-2"><span className="tag">{m.kind}</span>{m.style && <span className="tag">{m.style}</span>}</div>
                <div>权重: {m.weight}</div>
                {m.base_algo && <div>基础算法: {m.base_algo}</div>}
                <div className="truncate" title={m.version_uuid}>UUID: {m.version_uuid}</div>
                {m.note && <div className="line-clamp-2">{m.note}</div>}
              </div>
              <div className="flex gap-2 pt-1">
                <button className="btn btn-sm btn-ghost" onClick={() => edit(m)}>编辑</button>
                <button className="btn btn-sm btn-ghost text-rose-600" onClick={() => remove(m.id)}>删除</button>
                {m.model_url && <a className="btn btn-sm btn-ghost" href={m.model_url} target="_blank" rel="noreferrer">官网</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
