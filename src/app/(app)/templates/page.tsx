"use client";
import { useMemo, useState } from "react";
import { useShell } from "@/components/AppShell";

interface Tpl {
  id: number;
  business_line_id: number;
  content_type_id: number | null;
  name: string;
  template: string;
  template_en: string;
  negative: string;
  sort: number;
}
interface Type { id: number; business_line_id: number; name: string }

export default function TemplatesPage() {
  const { meta, line } = useShell();
  const types = useMemo(
    () => ((meta.types || []) as Type[]).filter((t) => t.business_line_id === line),
    [meta.types, line]
  );
  const tpls = useMemo(
    () => ((meta.templates || []) as Tpl[])
      .filter((t) => t.business_line_id === line)
      .slice()
      .sort((a, b) => (a.sort - b.sort) || (a.id - b.id)),
    [meta.templates, line]
  );

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(0);
  const [copied, setCopied] = useState("");

  const filtered = tpls.filter((t) => {
    if (typeFilter && t.content_type_id !== typeFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = `${t.name} ${t.template} ${t.template_en} ${t.negative}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  // 高亮 {{变量}} 占位符
  const highlight = (text: string) =>
    text.split(/(\{\{[^}]+\}\})/g).map((p, i) =>
      p.startsWith("{{") && p.endsWith("}}")
        ? <span key={i} className="text-brand font-medium">{p}</span>
        : <span key={i}>{p}</span>
    );

  const typeName = (id: number | null) =>
    id ? types.find((t) => t.id === id)?.name || "通用" : "通用";

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-medium text-sm">提示词库</div>
          <div className="text-[11px] text-mute mt-0.5">
            公司沉淀的提示词资产 · 按业务线 / 内容类型分类，一键复制即用
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-48!" placeholder="搜索模板 / 关键词…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="input w-40!" value={typeFilter} onChange={(e) => setTypeFilter(Number(e.target.value))}>
            <option value={0}>全部类型</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="text-[12px] text-mute">
        {line === 1 ? "木盆电商" : "广告设计"} · 共 {filtered.length} 个模板
      </div>

      {filtered.length === 0 && (
        <div className="card p-8 text-center text-[12px] text-mute">没有匹配的模板。</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {filtered.map((t) => (
          <div key={t.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm truncate">{t.name}</span>
                <span className="tag shrink-0">{typeName(t.content_type_id)}</span>
              </div>
              <span className="text-[11px] text-mute shrink-0">#{t.id}</span>
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label className="label mb-0!">中文提示词</label>
                <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(t.template, `cn-${t.id}`)}>
                  {copied === `cn-${t.id}` ? "已复制 ✓" : "复制"}
                </button>
              </div>
              <div className="text-[12px] leading-relaxed bg-panel2 rounded-lg p-2 mt-1 min-h-10">{highlight(t.template)}</div>
            </div>

            {t.template_en && (
              <div>
                <div className="flex justify-between items-center">
                  <label className="label mb-0!">英文提示词</label>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(t.template_en, `en-${t.id}`)}>
                    {copied === `en-${t.id}` ? "已复制 ✓" : "复制"}
                  </button>
                </div>
                <div className="text-[12px] leading-relaxed text-mute bg-panel2 rounded-lg p-2 mt-1">{t.template_en}</div>
              </div>
            )}

            {t.negative && (
              <div>
                <div className="flex justify-between items-center">
                  <label className="label mb-0!">负面提示词</label>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(t.negative, `neg-${t.id}`)}>
                    {copied === `neg-${t.id}` ? "已复制 ✓" : "复制"}
                  </button>
                </div>
                <div className="text-[11px] text-mute bg-panel2 rounded-lg p-2 mt-1">{t.negative}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
