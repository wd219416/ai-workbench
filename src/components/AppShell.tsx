"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User { id: number; username: string; role: string }
interface Line { id: number; code: string; name: string }

interface ShellCtx {
  user: User | null;
  meta: Record<string, unknown[]>;
  line: number;
  setLine: (id: number) => void;
}
const Ctx = createContext<ShellCtx>({ user: null, meta: {}, line: 1, setLine: () => {} });
export const useShell = () => useContext(Ctx);

const NAV = [
  { href: "/studio", name: "作图工作台", icon: "🎨" },
  { href: "/reverse", name: "反推工作台", icon: "🔍" },
  { href: "/video", name: "视频工作台", icon: "🎬" },
  { href: "/clipforge", name: "带货视频", icon: "🛒" },
  { href: "/selling", name: "卖点提炼", icon: "💎" },
  { href: "/tasks", name: "任务中心", icon: "📋" },
  { href: "/plans", name: "发布计划", icon: "📅" },
  { href: "/library", name: "素材库", icon: "🗂" },
  { href: "/templates", name: "提示词库", icon: "📝" },
  { href: "/liblib", name: "风格模型库", icon: "🧩" },
  { href: "/knowledge", name: "知识库", icon: "📚" },
  { href: "/service", name: "品牌客服", icon: "💬" },
  { href: "/pricing", name: "计费表", icon: "💰", admin: true },
  { href: "/settings", name: "设置", icon: "⚙️", admin: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown[]>>({});
  const [line, setLineState] = useState<number>(1);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const saved = Number(localStorage.getItem("wb_line"));
    if (saved) setLineState(saved);
  }, []);

  function setLine(id: number) {
    setLineState(id);
    localStorage.setItem("wb_line", String(id));
  }

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me");
      if (!me.ok) { router.replace("/login"); return; }
      setUser(await me.json());
      const m = await fetch("/api/meta");
      if (m.ok) setMeta(await m.json());
      setReady(true);
    })();
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-mute text-sm">加载中…</div>;
  const lines = (meta.lines || []) as Line[];

  return (
    <Ctx.Provider value={{ user, meta, line, setLine }}>
      <div className="min-h-screen flex">
        <aside className="w-52 shrink-0 border-r border-line bg-panel flex flex-col">
          <div className="p-4 border-b border-line">
            <div className="font-medium text-sm">典致 AI 工作台</div>
            <div className="text-[11px] text-mute mt-0.5">内容创作 · 作图 / 视频</div>
          </div>
          <div className="p-3 border-b border-line">
            <div className="label">业务线</div>
            <div className="flex flex-col gap-1">
              {lines.map((l) => (
                <button key={l.id} onClick={() => setLine(l.id)}
                  className={`text-left px-3 py-2 rounded-lg text-[13px] border transition ${line === l.id ? "border-brand bg-panel2 text-ink" : "border-transparent text-mute hover:bg-panel2"}`}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <nav className="p-3 flex-1 flex flex-col gap-1">
            {NAV.filter((n) => !n.admin || user?.role === "admin").map((n) => (
              <a key={n.href} href={n.href}
                className={`px-3 py-2 rounded-lg text-[13px] transition ${pathname === n.href ? "bg-panel2 text-ink border border-brand" : "text-mute hover:bg-panel2 border border-transparent"}`}>
                <span className="mr-2">{n.icon}</span>{n.name}
              </a>
            ))}
          </nav>
          <div className="p-3 border-t border-line flex items-center justify-between">
            <div className="text-[12px]">
              <div>{user?.username}</div>
              <div className="text-mute text-[11px]">{user?.role === "admin" ? "管理员" : "成员"}</div>
            </div>
            <button onClick={logout} className="btn btn-ghost py-1! px-2! text-[11px]">退出</button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 p-5 overflow-auto">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
