"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr("");
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (res.ok) { router.replace("/studio"); return; }
    const d = await res.json();
    setErr(d.error || "登录失败");
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={submit} className="card p-8 w-[340px]">
        <div className="text-lg font-medium mb-1">典致 AI 内容创作工作台</div>
        <div className="text-xs text-mute mb-6">木盆电商 · 广告设计</div>
        <label className="label">账号</label>
        <input className="input mb-3" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label className="label">密码</label>
        <input className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div className="text-xs text-bad mb-3">{err}</div>}
        <button className="btn btn-brand w-full" disabled={loading}>
          {loading ? "登录中…" : "登录"}
        </button>
        <div className="text-[11px] text-mute mt-4">初始账号 admin / admin123，登录后到设置页改密加人</div>
      </form>
    </div>
  );
}
