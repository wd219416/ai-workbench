"use client";
import { useEffect, useState } from "react";

interface Task {
  id: number; kind: string; engine: string; status: string;
  input: string; output: string; error: string | null; created_at: string;
}

const ENGINE_NAME: Record<string, string> = { lovart: "LOVART", kling: "可灵", wanxiang: "万相", jimeng: "即梦", vidu: "Vidu", comfyui: "ComfyUI" };
const STATUS_CLS: Record<string, string> = { done: "text-ok", failed: "text-bad", error: "text-bad", processing: "text-brand", needs_key: "text-bad" };

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("");

  async function load() {
    const res = await fetch(`/api/tasks${filter ? `?kind=${filter}` : ""}`);
    if (res.ok) setTasks(await res.json());
  }
  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    const t = setInterval(() => { if (tasks.some((x) => x.status === "processing")) load(); }, 5000);
    return () => clearInterval(t);
  }, [tasks, filter]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <div className="font-medium">任务中心</div>
        {[["", "全部"], ["image", "出图"], ["video", "视频"]].map(([v, n]) => (
          <button key={v} onClick={() => setFilter(v)} className={`btn ${filter === v ? "btn-brand" : "btn-ghost"} py-1.5!`}>{n}</button>
        ))}
      </div>

      <div className="card p-4 overflow-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-mute">
              <th className="pb-2 pr-3">ID</th><th className="pb-2 pr-3">类型</th><th className="pb-2 pr-3">引擎</th>
              <th className="pb-2 pr-3">提示词</th><th className="pb-2 pr-3">状态</th><th className="pb-2 pr-3">结果</th><th className="pb-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              let promptCn = "", files: string[] = [];
              try { promptCn = JSON.parse(t.input || "{}").promptCn || JSON.parse(t.input || "{}").prompt || ""; } catch { /* ignore */ }
              try { files = JSON.parse(t.output || "{}").files || []; } catch { /* ignore */ }
              return (
                <tr key={t.id} className="border-t border-line">
                  <td className="py-2 pr-3 text-mute">{t.id}</td>
                  <td className="py-2 pr-3">{t.kind === "image" ? "出图" : "视频"}</td>
                  <td className="py-2 pr-3">{ENGINE_NAME[t.engine] || t.engine}</td>
                  <td className="py-2 pr-3 max-w-64 truncate" title={promptCn}>{promptCn.slice(0, 40) || "—"}</td>
                  <td className={`py-2 pr-3 ${STATUS_CLS[t.status] || "text-mute"}`}>
                    {t.status === "needs_key" ? "缺KEY" : t.status}
                    {t.error && <div className="text-mute text-[11px] max-w-40 truncate" title={t.error}>{t.error}</div>}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-1">
                      {files.slice(0, 3).map((f, i) => (
                        <a key={i} href={f} target="_blank">
                          {t.kind === "image"
                            ? <img src={f} className="w-10 h-10 object-cover rounded" alt="" />
                            : <span className="tag">视频{i + 1}</span>}
                        </a>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 text-mute whitespace-nowrap">{t.created_at}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {tasks.length === 0 && <div className="text-center text-mute text-sm py-6">暂无任务</div>}
      </div>
    </div>
  );
}
