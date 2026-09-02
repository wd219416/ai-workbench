"use client";
import { useEffect, useState } from "react";

/** 模型下拉预设：key → 列表（input 用 datalist，可下拉也可手填） */
const MODEL_PRESETS: Record<string, { v: string; tip?: string }[]> = {
  jimeng_model: [
    { v: "doubao-seedream-5-0-pro", tip: "🔥 旗舰·最新·编辑可控" },
    { v: "doubao-seedream-4-5-250911", tip: "文生图+图生图+组图" },
    { v: "doubao-seedream-5-0-lite", tip: "可联网·轻量·热点类" },
    { v: "doubao-seedream-4-0-250828", tip: "上一代稳定款" },
  ],
  wanxiang_model: [
    { v: "wanx2.1-t2i-turbo", tip: "通义万相 2.1 快速版（默认）" },
    { v: "wanx2.1-t2i-plus", tip: "通义万相 2.1 高质量" },
    { v: "wanx2.0-t2i-turbo", tip: "通义万相 2.0 快速版" },
  ],
  deepseek_model: [
    { v: "deepseek-chat", tip: "通用对话（默认）" },
    { v: "deepseek-reasoner", tip: "深度推理（R1）" },
  ],
  qwen_vl_model: [
    { v: "qwen-vl-max", tip: "最强视觉理解（默认）" },
    { v: "qwen-vl-plus", tip: "均衡款" },
  ],
};

const GROUPS = [
  { name: "DeepSeek（提示词生成）", test: "deepseek", keys: [["deepseek_key", "API Key"], ["deepseek_base", "Base URL"], ["deepseek_model", "模型"]] },
  { name: "阿里百炼 Qwen-VL（反推提示词）", test: "qwen", keys: [["qwen_key", "API Key"], ["qwen_base", "Base URL"], ["qwen_vl_model", "视觉模型"]] },
  { name: "通义万相（出图 · 用百炼KEY）", test: "wanxiang", keys: [["wanxiang_key", "API Key（留空则用上面的百炼KEY）"], ["wanxiang_model", "模型（默认 wanx2.1-t2i-turbo）"]] },
  { name: "即梦 Seedream（出图 · 火山方舟）", test: "jimeng", keys: [["jimeng_key", "方舟 API Key"], ["jimeng_base", "Base URL"], ["jimeng_model", "模型（默认 doubao-seedream-4-0）"]] },
  { name: "LOVART（出图 · 双KEY · 需代理）", test: "lovart", keys: [["lovart_ak", "Access Key"], ["lovart_sk", "Secret Key"], ["lovart_base", "Base URL（默认 lgw.lovart.ai）"], ["lovart_path", "API 前缀（默认 /v1/openapi）"], ["lovart_project_id", "项目ID（留空自动创建）"]] },
  { name: "可灵（出图 + 出视频）", test: "kling", keys: [["kling_ak", "API Key（新版单 Key 只填这栏）"], ["kling_sk", "Secret Key（仅旧版双KEY填，否则留空）"], ["kling_base", "Base URL"]] },
  { name: "Vidu Q3（出视频）", test: "vidu", keys: [["vidu_key", "Token"], ["vidu_base", "Base URL"]] },
  { name: "ComfyUI（预留）", test: "comfyui", keys: [["comfyui_local_url", "本地地址"], ["comfyui_cloud_url", "云端地址"], ["comfyui_workflow", "Workflow JSON（用 {{prompt}} 占位）"]] },
  { name: "默认引擎", test: null, keys: [["default_image_engine", "默认出图引擎"], ["default_video_engine", "默认视频引擎"]] },
] as const;

interface U { id: number; username: string; role: string; created_at: string }

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<U[]>([]);
  const [nu, setNu] = useState({ username: "", password: "", role: "member" });
  const [msg, setMsg] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [pwd, setPwd] = useState({ oldPassword: "", newPassword: "", confirm: "" });
  const [pwdMsg, setPwdMsg] = useState("");

  async function load() {
    const s = await fetch("/api/settings");
    if (s.status === 403) { setForbidden(true); return; }
    if (s.ok) setSettings((await s.json()).settings);
    const us = await fetch("/api/users");
    if (us.ok) setUsers(await us.json());
  }
  useEffect(() => { load(); }, []);

  async function save() {
    await fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
    });
    setMsg("已保存（掩码的 key 未改动时保持原值）");
    setTimeout(() => setMsg(""), 3000);
  }
  async function testGroup(g: string) {
    setTesting(g);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: g, values: settings }),
      });
      setTestResult({ ...testResult, [g]: await res.json() });
    } catch {
      setTestResult({ ...testResult, [g]: { ok: false, message: "请求失败" } });
    }
    setTesting(null);
  }
  async function changePwd() {
    if (pwd.newPassword !== pwd.confirm) { setPwdMsg("两次新密码不一致"); return; }
    const res = await fetch("/api/users", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword: pwd.oldPassword, newPassword: pwd.newPassword }),
    });
    const d = await res.json();
    setPwdMsg(res.ok ? "已改好，下次登录用新密码" : d.error || "失败");
    if (res.ok) setPwd({ oldPassword: "", newPassword: "", confirm: "" });
    setTimeout(() => setPwdMsg(""), 4000);
  }
  async function addUser() {
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nu),
    });
    if (res.ok) { setNu({ username: "", password: "", role: "member" }); load(); }
  }
  async function delUser(id: number) {
    if (!confirm("删除该账号？")) return;
    await fetch("/api/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  if (forbidden) return <div className="card p-8 text-center text-mute text-sm">设置页仅管理员可见</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="font-medium">设置</div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-[12px] text-ok">{msg}</span>}
          <button className="btn btn-brand" onClick={save}>保存全部</button>
        </div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.name} className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">{g.name}</div>
            {g.test && (
              <div className="flex items-center gap-2">
                {testResult[g.test] && (
                  <span className={`text-[12px] ${testResult[g.test].ok ? "text-ok" : "text-bad"}`}>
                    {testResult[g.test].ok ? "✓ " : "✕ "}{testResult[g.test].message}
                  </span>
                )}
                <button className="tag cursor-pointer" disabled={testing === g.test} onClick={() => testGroup(g.test!)}>
                  {testing === g.test ? "测试中…" : "测试连接"}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {g.keys.map(([k, label]) => (
              <div key={k} className={k.includes("workflow") ? "col-span-2" : ""}>
                <label className="label">{label}</label>
                {k.includes("workflow")
                  ? <textarea className="input h-20 resize-none text-[11px]" value={settings[k] || ""} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
                  : MODEL_PRESETS[k]
                    ? <div>
                        <input className="input" list={`dl-${k}`} placeholder="可下拉选，也可手填" value={settings[k] || ""} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
                        <datalist id={`dl-${k}`}>{MODEL_PRESETS[k].map((m) => <option key={m.v} value={m.v}>{m.tip ? `${m.v}（${m.tip}）` : m.v}</option>)}</datalist>
                      </div>
                    : <input className="input" value={settings[k] || ""} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">修改我的密码</div>
        <div className="flex gap-2 items-center flex-wrap">
          <input className="input w-40!" type="password" placeholder="旧密码" value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} />
          <input className="input w-40!" type="password" placeholder="新密码（≥6位）" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
          <input className="input w-40!" type="password" placeholder="再输一遍" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
          <button className="btn btn-brand" onClick={changePwd}>改密码</button>
          {pwdMsg && <span className="text-[12px] text-ok">{pwdMsg}</span>}
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">账号管理（5 人访问）</div>
        <div className="flex gap-2 mb-3">
          <input className="input w-40!" placeholder="账号" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
          <input className="input w-40!" placeholder="密码" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          <select className="input w-28!" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
            <option value="member">成员</option><option value="admin">管理员</option>
          </select>
          <button className="btn btn-brand" onClick={addUser}>加人</button>
        </div>
        {users.map((x) => (
          <div key={x.id} className="flex items-center justify-between border-t border-line py-2 text-[13px]">
            <span>{x.username} <span className="tag ml-2">{x.role === "admin" ? "管理员" : "成员"}</span></span>
            <button className="tag cursor-pointer hover:text-bad!" onClick={() => delUser(x.id)}>删</button>
          </div>
        ))}
      </div>
    </div>
  );
}
