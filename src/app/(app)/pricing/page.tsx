"use client";
import { useEffect, useState } from "react";

interface P {
  id: number; engine: string; model: string; unit_price: number; unit: string;
  discount_pct: number; discount_until: string | null; note: string | null;
}

export default function PricingPage() {
  const [rows, setRows] = useState<P[]>([]);
  const [edit, setEdit] = useState<Record<number, { unit_price: string; discount_pct: string; discount_until: string; note: string }>>({});
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/pricing");
    if (r.ok) setRows(await r.json());
  }
  useEffect(() => { load(); }, []);

  function startEdit(p: P) {
    setEdit({ ...edit, [p.id]: {
      unit_price: String(p.unit_price),
      discount_pct: String(p.discount_pct || ""),
      discount_until: p.discount_until ? p.discount_until.slice(0, 10) : "",
      note: p.note || "",
    } });
  }
  async function save(p: P) {
    const e = edit[p.id];
    const res = await fetch("/api/pricing", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: p.id, unit_price: Number(e.unit_price) || 0,
        discount_pct: Number(e.discount_pct) || 0, discount_until: e.discount_until, note: e.note,
      }),
    });
    if (res.ok) {
      setMsg(`${p.engine}/${p.model} 已更新`);
      const { [p.id]: _, ...rest } = edit;
      setEdit(rest);
      load(); setTimeout(() => setMsg(""), 2500);
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="font-medium">计费表<span className="text-mute text-[12px] ml-2">价格仅供参考，以各平台官网为准；折扣字段手填（如限时5折填 50、到期日 2026-09-30）</span></div>
      <div className="card p-4 overflow-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-mute">
              <th className="pb-2 pr-3">引擎</th><th className="pb-2 pr-3">模型</th>
              <th className="pb-2 pr-3">单价(¥)</th><th className="pb-2 pr-3">单位</th>
              <th className="pb-2 pr-3">折扣%</th><th className="pb-2 pr-3">到期</th>
              <th className="pb-2 pr-3">备注</th><th className="pb-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const e = edit[p.id];
              const until = p.discount_until ? new Date(p.discount_until) : null;
              const active = p.discount_pct > 0 && (!until || until.getTime() > Date.now());
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-2 pr-3">{p.engine}</td>
                  <td className="py-2 pr-3 font-mono text-[11px]">{p.model}</td>
                  {e ? (
                    <>
                      <td className="py-1 pr-3"><input className="input w-20!" value={e.unit_price} onChange={(ev) => setEdit({ ...edit, [p.id]: { ...e, unit_price: ev.target.value } })} /></td>
                      <td className="py-1 pr-3 text-mute">{p.unit}</td>
                      <td className="py-1 pr-3"><input className="input w-16!" placeholder="如50" value={e.discount_pct} onChange={(ev) => setEdit({ ...edit, [p.id]: { ...e, discount_pct: ev.target.value } })} /></td>
                      <td className="py-1 pr-3"><input type="date" className="input w-36!" value={e.discount_until} onChange={(ev) => setEdit({ ...edit, [p.id]: { ...e, discount_until: ev.target.value } })} /></td>
                      <td className="py-1 pr-3"><input className="input w-40!" value={e.note} onChange={(ev) => setEdit({ ...edit, [p.id]: { ...e, note: ev.target.value } })} /></td>
                      <td className="py-1 whitespace-nowrap"><button className="btn btn-brand text-[11px] py-0.5! px-2!" onClick={() => save(p)}>存</button></td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-3">{p.unit_price}</td>
                      <td className="py-2 pr-3 text-mute">{p.unit}</td>
                      <td className={`py-2 pr-3 ${active ? "text-brand" : "text-mute"}`}>{p.discount_pct || "—"}{active ? ` ${p.discount_pct / 10}折` : ""}</td>
                      <td className="py-2 pr-3 text-mute whitespace-nowrap">{p.discount_until ? p.discount_until.slice(0, 10) : "—"}</td>
                      <td className="py-2 pr-3 text-mute max-w-40 truncate">{p.note || "—"}</td>
                      <td className="py-2"><button className="tag cursor-pointer" onClick={() => startEdit(p)}>改</button></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-center text-mute text-sm py-6">暂无计费记录</div>}
      </div>
      {msg && <div className="text-[12px] text-ok">{msg}</div>}
    </div>
  );
}
