import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { liblibFetchModel } from "@/lib/engines/liblib";

/** 解析 Liblib 商业授权字段：commercialUse 是数字 0/1/2/3 枚举 → commercial / member_only / unknown / forbidden */
function parseLicense(cu: unknown): string {
  if (cu === 1 || cu === "1") return "commercial";
  if (cu === 2 || cu === "2") return "member_only";
  if (cu === 3 || cu === "3") return "forbidden";
  return "unknown";
}

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const style = url.searchParams.get("style");
  const db = getDb();
  const wheres: string[] = [];
  const args: (string | number | null)[] = [];
  if (kind) { wheres.push("kind=?"); args.push(kind); }
  if (style) { wheres.push("style=?"); args.push(style); }
  const sql = "SELECT * FROM liblib_models" + (wheres.length ? " WHERE " + wheres.join(" AND ") : "") + " ORDER BY id DESC";
  const rows = db.prepare(sql).all(...args);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const { versionUuid, kind, weight, style, note, business_line_id, fetch: autoFetch } = body as {
    versionUuid?: string; kind?: string; weight?: number; style?: string;
    note?: string; business_line_id?: number; fetch?: boolean;
  };
  if (!versionUuid) return NextResponse.json({ error: "缺 versionUuid" }, { status: 400 });
  const db = getDb();
  const exist = db.prepare("SELECT id FROM liblib_models WHERE version_uuid=?").get(versionUuid);
  if (exist) return NextResponse.json({ error: "该 versionUuid 已收藏", id: (exist as { id: number }).id }, { status: 409 });

  // 默认元数据
  let model: Awaited<ReturnType<typeof liblibFetchModel>> = {};
  let name = kind === "checkpoint" ? "Checkpoint" : "LoRA";
  let baseAlgo = "";
  let license = "unknown";
  let modelUrl = "";
  if (autoFetch) {
    try {
      model = await liblibFetchModel(versionUuid);
      name = model.modelName || model.versionName || name;
      baseAlgo = model.baseAlgoName || String(model.baseAlgo || "");
      license = parseLicense(model.commercialUse);
      modelUrl = model.modelUrl || "";
    } catch (e) {
      return NextResponse.json({ error: "拉取模型详情失败：" + (e as Error).message.slice(0, 160) }, { status: 502 });
    }
  }
  const stmt = db.prepare(`INSERT INTO liblib_models(version_uuid,model_id,name,kind,style,base_algo,license,weight,model_url,note,business_line_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`);
  const r = stmt.run(
    versionUuid,
    (model as { modelName?: string })?.modelName || versionUuid.slice(0, 12),
    name, kind || "lora", style || "", baseAlgo, license, weight ?? 0.7, modelUrl, note || "", business_line_id || null
  );
  return NextResponse.json({ ok: true, id: r.lastInsertRowid });
}

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const { id, weight, style, note, business_line_id, name, base_algo } = body as Record<string, unknown>;
  if (!id) return NextResponse.json({ error: "缺 id" }, { status: 400 });
  const db = getDb();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (weight !== undefined) { fields.push("weight=?"); args.push(Number(weight)); }
  if (style !== undefined) { fields.push("style=?"); args.push(String(style)); }
  if (note !== undefined) { fields.push("note=?"); args.push(String(note)); }
  if (business_line_id !== undefined) { fields.push("business_line_id=?"); args.push(business_line_id ? Number(business_line_id) : null); }
  if (name !== undefined) { fields.push("name=?"); args.push(String(name)); }
  if (base_algo !== undefined) { fields.push("base_algo=?"); args.push(String(base_algo)); }
  if (!fields.length) return NextResponse.json({ error: "无字段可更新" }, { status: 400 });
  args.push(Number(id));
  const r = db.prepare(`UPDATE liblib_models SET ${fields.join(",")} WHERE id=?`).run(...args);
  if (r.changes === 0) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "缺 id" }, { status: 400 });
  const db = getDb();
  const r = db.prepare("DELETE FROM liblib_models WHERE id=?").run(id);
  if (r.changes === 0) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
