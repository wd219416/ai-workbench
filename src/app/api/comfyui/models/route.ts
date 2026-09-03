import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getSetting } from "@/lib/db";

/** 代理本地/云端 ComfyUI 的 /object_info，拉取可用底模（checkpoints）与 LoRA 列表。
 *  前端无法直连 8188（ComfyUI 默认无 CORS 头），由服务端代取。 */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const url = (getSetting("comfyui_cloud_url") || getSetting("comfyui_local_url"))?.replace(/\/$/, "");
  if (!url) return NextResponse.json({ error: "未配置 ComfyUI 地址" }, { status: 400 });

  const fetchList = async (node: string, field: string): Promise<string[]> => {
    const res = await fetch(`${url}/object_info/${node}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`${node} HTTP ${res.status}`);
    const data = await res.json();
    const arr = data?.[node]?.input?.required?.[field]?.[0];
    return Array.isArray(arr) ? arr.map(String) : [];
  };

  try {
    const [checkpoints, loras] = await Promise.all([
      fetchList("CheckpointLoaderSimple", "ckpt_name"),
      fetchList("LoraLoader", "lora_name"),
    ]);
    return NextResponse.json({ checkpoints, loras, url });
  } catch (e) {
    return NextResponse.json(
      { error: `ComfyUI 不可达：${e instanceof Error ? e.message.slice(0, 120) : String(e)}` },
      { status: 502 }
    );
  }
}
