import path from "node:path";
import fs from "node:fs";
import { run, uploadDir } from "./db";

/** 引擎返回的外网文件落盘 + 入素材库，返回本地 /api/file/ 地址 */
export async function persistFiles(files: string[], kind: string, input: Record<string, unknown>, uid: number): Promise<string[]> {
  const local: string[] = [];
  for (const f of files) {
    if (!/^https?:\/\//.test(f)) { local.push(f); continue; }
    try {
      const res = await fetch(f);
      if (!res.ok) { local.push(f); continue; }
      const ext = kind === "video" ? "mp4" : (f.match(/\.(png|jpe?g|webp)/i)?.[1] || "png");
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext.toLowerCase()}`;
      fs.writeFileSync(path.join(uploadDir(), name), Buffer.from(await res.arrayBuffer()));
      run(
        "INSERT INTO assets(type,business_line_id,channel_id,content_type_id,prompt_cn,prompt_en,engine,file_path,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
        kind === "video" ? "video" : "image",
        input.businessLineId ?? null, input.channelId ?? null, input.contentTypeId ?? null,
        input.promptCn ?? "", input.prompt ?? "", input.engine ?? "", name, "done", uid
      );
      local.push(`/api/file/${name}`);
    } catch {
      local.push(f);
    }
  }
  return local;
}
