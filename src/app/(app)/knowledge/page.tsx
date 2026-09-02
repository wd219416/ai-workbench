"use client";
import { useEffect, useState } from "react";

type Row = Record<string, string | number | null> & { id: number };

const SECTIONS = [
  { code: "products", name: "产品库", cols: ["sku", "name", "wood", "size", "style", "price", "selling_points"], labels: { sku: "SKU", name: "名称", wood: "木种", size: "尺寸", style: "款式", price: "价格", selling_points: "卖点" } },
  { code: "brand", name: "品牌资料", cols: ["kind", "name", "content", "note"], labels: { kind: "类型", name: "名称", content: "内容", note: "备注" } },
  { code: "copy", name: "文案库", cols: ["title", "content", "tags"], labels: { title: "标题", content: "内容", tags: "标签" } },
  { code: "clients", name: "客户档案", cols: ["name", "industry", "vi", "contacts", "note"], labels: { name: "客户名", industry: "行业", vi: "VI(JSON)", contacts: "联系方式", note: "备注" } },
  { code: "templates", name: "提示词模板", cols: ["name", "business_line_id", "content_type_id", "template", "template_en", "negative"], labels: { name: "模板名", business_line_id: "业务线(1电商/2广告)", content_type_id: "内容类型ID", template: "中文模板", template_en: "英文模板", negative: "负面词" } },
] as const;

export default function KnowledgePage() {
  const [sec, setSec] = useState<(typeof SECTIONS)[number]["code"]>("products");
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const conf = SECTIONS.find((s) => s.code === sec)!;

  async function load() {
    const res = await fetch(`/api/kb/${sec}`);
    if (res.ok) setRows(await res.json());
  }
  useEffect(() => { setForm({}); load(); }, [sec]);

  async function add() {
    await fetch(`/api/kb/${sec}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_line_id: 1, ...form }),
    });
    setForm({}); load();
  }
  async function remove(id: number) {
    if (!confirm("删除这条记录？")) return;
    await fetch(`/api/kb/${sec}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="font-medium">知识库</div>
        {SECTIONS.map((s) => (
          <button key={s.code} onClick={() => setSec(s.code)}
            className={`btn ${sec === s.code ? "btn-brand" : "btn-ghost"} py-1.5!`}>{s.name}</button>
        ))}
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">新增{conf.name}记录</div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          {conf.cols.map((c) => (
            <div key={c}>
              <label className="label">{(conf.labels as Record<string, string>)[c]}</label>
              <input className="input" value={form[c] || ""} onChange={(e) => setForm({ ...form, [c]: e.target.value })} />
            </div>
          ))}
        </div>
        <button className="btn btn-brand mt-3" onClick={add}>保存</button>
      </div>

      <div className="card p-4 overflow-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-mute">
              <th className="pb-2 pr-3">ID</th>
              {conf.cols.map((c) => <th key={c} className="pb-2 pr-3">{(conf.labels as Record<string, string>)[c]}</th>)}
              <th className="pb-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-2 pr-3 text-mute">{r.id}</td>
                {conf.cols.map((c) => <td key={c} className="py-2 pr-3 max-w-48 truncate">{String(r[c] ?? "")}</td>)}
                <td className="py-2"><button className="tag cursor-pointer hover:text-bad!" onClick={() => remove(r.id)}>删</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-center text-mute text-sm py-6">暂无记录</div>}
      </div>
    </div>
  );
}
