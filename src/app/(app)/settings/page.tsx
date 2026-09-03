"use client";
import { useEffect, useState } from "react";
import { SETTINGS_GROUPS, MODEL_PRESETS } from "@/lib/engines/registry";

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

      {SETTINGS_GROUPS.map((g) => (
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
            {g.fields.map((f) => (
              <div key={f.key} className={f.long ? "col-span-2" : ""}>
                <label className="label">{f.label}</label>
                {f.long
                  ? <textarea className="input h-20 resize-none text-[11px]" value={settings[f.key] || ""} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} />
                  : MODEL_PRESETS[f.key]
                    ? <div>
                        <input className="input" list={`dl-${f.key}`} placeholder="可下拉选，也可手填" value={settings[f.key] || ""} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} />
                        <datalist id={`dl-${f.key}`}>{MODEL_PRESETS[f.key].map((m) => <option key={m.v} value={m.v}>{m.tip ? `${m.v}（${m.tip}）` : m.v}</option>)}</datalist>
                      </div>
                    : <input className="input" value={settings[f.key] || ""} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} />}
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
