"use client";
import { useEffect, useState } from "react";

interface Asset { id: number; type: string; file_path: string }
interface Plan {
  id: number; asset_id: number | null; platform: string; title: string; content: string;
  scheduled_at: string; status: string; task_id: number | null;
  asset_path: string | null; task_status: string | null; task_output: string | null;
}

const PLATFORMS = ["抖店", "视频号", "小红书", "淘宝逛逛", "拼多多"];
const STATUS_LABEL: Record<string, [string, string]> = {
  scheduled: ["已排期", "text-brand"], generating: ["生成中", "text-mute"],
  ready: ["待发布", "text-ok"], failed: ["失败", "text-bad"], cancelled: ["已取消", "text-mute"], draft: ["草稿", "text-mute"],
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState({ assetId: 0, platform: "视频号", title: "", content: "", scheduledAt: "" });
  const [msg, setMsg] = useState("");

  async function load() {
    const [p, a] = await Promise.all([fetch("/api/plans"), fetch("/api/assets?type=image")]);
    if (p.ok) setPlans(await p.json());
    if (a.ok) setAssets(await a.json());
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  async function add() {
    if (!form.content || !form.scheduledAt) { setMsg("内容和定时必填"); return; }
    const res = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, scheduledAt: form.scheduledAt.replace("T", " ") + (form.scheduledAt.length === 16 ? ":00" : "") }),
    });
    setMsg(res.ok ? "已排期" : "保存失败");
    setForm({ ...form, title: "", content: "" });
    load(); setTimeout(() => setMsg(""), 3000);
  }
  async function cancel(id: number) {
    await fetch("/api/plans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "cancelled" }) });
    load();
  }
  async function remove(id: number) {
    if (!confirm("删除这条计划？")) return;
    await fetch("/api/plans", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="font-medium">发布计划<span className="text-mute text-[12px] ml-2">到点自动生成视频 → 待发布队列（发布动作后续接平台）</span></div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">新建计划</div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="label">平台</label>
            <select className="input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">定时</label>
            <input type="datetime-local" className="input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </div>
          <div>
            <label className="label">首帧图（素材，可空）</label>
            <select className="input" value={form.assetId} onChange={(e) => setForm({ ...form, assetId: Number(e.target.value) })}>
              <option value={0}>纯文生视频</option>
              {assets.map((a) => <option key={a.id} value={a.id}>#{a.id} {a.file_path.slice(0, 24)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">标题</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="发布时的标题" />
          </div>
          <div className="col-span-2 xl:col-span-4">
            <label className="label">视频要求（到点拿这段生成视频）</label>
            <textarea className="input h-16 resize-none" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="如：碳化木花盆在阳台微风吹拂，镜头缓慢环绕，5秒" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button className="btn btn-brand" onClick={add}>排期</button>
          {msg && <span className="text-[12px] text-ok">{msg}</span>}
        </div>
      </div>

      <div className="card p-4 overflow-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-mute">
              <th className="pb-2 pr-3">ID</th><th className="pb-2 pr-3">平台</th><th className="pb-2 pr-3">标题/内容</th>
              <th className="pb-2 pr-3">定时</th><th className="pb-2 pr-3">状态</th><th className="pb-2 pr-3">视频</th><th className="pb-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const [label, cls] = STATUS_LABEL[p.status] || [p.status, "text-mute"];
              let video = "";
              try { video = JSON.parse(p.task_output || "{}").files?.[0] || ""; } catch { /* ignore */ }
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-2 pr-3 text-mute">{p.id}</td>
                  <td className="py-2 pr-3">{p.platform}</td>
                  <td className="py-2 pr-3 max-w-56">
                    <div className="truncate">{p.title || "—"}</div>
                    <div className="truncate text-mute">{p.content}</div>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{p.scheduled_at}</td>
                  <td className={`py-2 pr-3 ${cls}`}>{label}</td>
                  <td className="py-2 pr-3">
                    {video ? <a className="text-brand underline" href={video} target="_blank">看片</a> : <span className="text-mute">—</span>}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {(p.status === "scheduled" || p.status === "generating") &&
                      <button className="tag cursor-pointer mr-1" onClick={() => cancel(p.id)}>取消</button>}
                    <button className="tag cursor-pointer hover:text-bad!" onClick={() => remove(p.id)}>删</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {plans.length === 0 && <div className="text-center text-mute text-sm py-6">暂无计划</div>}
      </div>
    </div>
  );
}
