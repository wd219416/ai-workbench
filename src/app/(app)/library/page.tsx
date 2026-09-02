"use client";
import { useEffect, useState } from "react";
import { useShell } from "@/components/AppShell";

interface Asset {
  id: number; type: string; file_path: string; prompt_cn: string;
  engine: string; created_at: string; business_line_id: number;
}

export default function LibraryPage() {
  const { line } = useShell();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [type, setType] = useState("");

  async function load() {
    const q = new URLSearchParams();
    if (type) q.set("type", type);
    const res = await fetch("/api/assets?" + q.toString());
    if (res.ok) setAssets(await res.json());
  }
  useEffect(() => { load(); }, [type]);

  async function remove(id: number) {
    if (!confirm("删除这条素材？")) return;
    await fetch("/api/assets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  const upload = async (f: File) => {
    const fd = new FormData(); fd.append("image", f); fd.append("kind", "ref");
    await fetch("/api/upload", { method: "POST", body: fd });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="font-medium">素材库</div>
        <select className="input w-36!" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="image">生成图</option>
          <option value="ref">参考图</option>
          <option value="video">视频</option>
        </select>
        <button className="btn btn-ghost" onClick={() => document.getElementById("lib-file")?.click()}>上传参考图</button>
        <input id="lib-file" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {assets.length === 0 && <div className="card p-8 text-center text-mute text-sm">还没有素材</div>}
      <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
        {assets.map((a) => (
          <div key={a.id} className="card p-2 group relative">
            <img src={`/api/file/${a.file_path}`} alt="" className="rounded w-full aspect-square object-cover" />
            <div className="mt-1 flex items-center justify-between">
              <span className="tag">{a.type === "ref" ? "参考图" : a.type}</span>
              <button className="tag cursor-pointer hover:text-bad!" onClick={() => remove(a.id)}>删</button>
            </div>
            <div className="text-[10px] text-mute mt-1 truncate">{a.prompt_cn || a.file_path}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
