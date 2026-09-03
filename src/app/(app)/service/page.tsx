"use client";
import { useEffect, useState } from "react";

interface Client { id: number; name: string }
interface ServiceRecord {
  id: number; client_id: number | null; client_name: string | null;
  kind: string; content: string; reply: string | null; status: string; created_at: string;
}

const KINDS = ["咨询", "报价", "售后", "投诉", "定制"];
const STATUS_LABEL: Record<string, [string, string]> = {
  pending: ["待回复", "text-bad"], replied: ["已起草", "text-brand"], closed: ["已完结", "text-ok"],
};

export default function ServicePage() {
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState({ clientId: 0, kind: "咨询", content: "" });
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState(0);
  const [note, setNote] = useState("");

  async function load() {
    const [r, c] = await Promise.all([fetch("/api/service"), fetch("/api/kb/clients")]);
    if (r.ok) setRecords(await r.json());
    if (c.ok) setClients(await c.json());
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.content) { setMsg("咨询内容必填"); return; }
    const res = await fetch("/api/service", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setMsg(res.ok ? "已登记" : "保存失败");
    setForm({ ...form, content: "" });
    load(); setTimeout(() => setMsg(""), 3000);
  }

  async function aiReply(id: number) {
    setBusyId(id); setNote("");
    const res = await fetch("/api/service", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reply", id }),
    });
    const data = await res.json();
    if (!res.ok) setNote(data.error || "生成失败");
    else if (data.note) setNote(data.note);
    setBusyId(0); load();
  }

  async function setStatus(id: number, status: string) {
    await fetch("/api/service", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    load();
  }
  async function remove(id: number) {
    if (!confirm("删除这条记录？")) return;
    await fetch("/api/service", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    setMsg("回复已复制"); setTimeout(() => setMsg(""), 2000);
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="font-medium">品牌客服<span className="text-mute text-[12px] ml-2">登记各平台客户咨询 → AI 结合知识库起草回复 → 人工确认后发出</span></div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">登记咨询</div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="label">客户（可空）</label>
            <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value) })}>
              <option value={0}>散客/平台买家</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">类型</label>
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">客户原话</label>
            <input className="input" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="粘贴客户咨询内容，如：这个花盆是什么木头？包邮吗？" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button className="btn btn-brand" onClick={add}>登记</button>
          {msg && <span className="text-[12px] text-ok">{msg}</span>}
          {note && <span className="text-[12px] text-mute">{note}</span>}
        </div>
      </div>

      <div className="space-y-3">
        {records.map((r) => {
          const [label, cls] = STATUS_LABEL[r.status] || [r.status, "text-mute"];
          return (
            <div key={r.id} className="card p-4">
              <div className="flex items-center gap-2 text-[12px] text-mute mb-2">
                <span>#{r.id}</span>
                <span className="tag">{r.kind}</span>
                <span>{r.client_name || "散客"}</span>
                <span className={cls}>{label}</span>
                <span className="ml-auto">{r.created_at}</span>
              </div>
              <div className="text-sm mb-2">{r.content}</div>
              {r.reply && (
                <div className="bg-panel2 rounded-lg p-3 text-[13px] mb-2 whitespace-pre-wrap">{r.reply}</div>
              )}
              <div className="flex items-center gap-2">
                <button className="btn btn-brand text-[12px] py-1!" disabled={busyId === r.id} onClick={() => aiReply(r.id)}>
                  {busyId === r.id ? "生成中…" : r.reply ? "重新起草" : "AI 起草回复"}
                </button>
                {r.reply && <button className="tag cursor-pointer" onClick={() => copy(r.reply!)}>复制回复</button>}
                {r.status !== "closed" && <button className="tag cursor-pointer" onClick={() => setStatus(r.id, "closed")}>完结</button>}
                {r.status === "closed" && <button className="tag cursor-pointer" onClick={() => setStatus(r.id, "pending")}>重开</button>}
                <button className="tag cursor-pointer hover:text-bad! ml-auto" onClick={() => remove(r.id)}>删</button>
              </div>
            </div>
          );
        })}
        {records.length === 0 && <div className="card p-6 text-center text-mute text-sm">暂无咨询记录</div>}
      </div>
    </div>
  );
}
