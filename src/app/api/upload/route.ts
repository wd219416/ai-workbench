import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { run, uploadDir } from "@/lib/db";
import path from "node:path";
import fs from "node:fs";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const fd = await req.formData();
  const file = fd.get("image") as File | null;
  const kind = String(fd.get("kind") || "ref");
  if (!file) return NextResponse.json({ error: "缺文件" }, { status: 400 });
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(uploadDir(), name), Buffer.from(await file.arrayBuffer()));
  const r = run(
    "INSERT INTO assets(type,file_path,status,meta,created_by) VALUES(?,?,?,?,?)",
    kind, name, "done", JSON.stringify({ origName: file.name }), u.id
  );
  return NextResponse.json({ assetId: Number(r.lastInsertRowid), url: `/api/file/${name}`, name });
}
