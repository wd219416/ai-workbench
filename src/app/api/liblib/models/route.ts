import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { get, run, all } from "@/lib/db";
import { liblibFetchModel } from "@/lib/engines/liblib";

// GET /api/liblib/models[?kind=lora][&style=产品]
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "";
  const style = searchParams.get("style") || "";
  let sql = "SELECT * FROM liblib_models WHERE 1=1";
  const params: unknown[] = [];
  if (kind) { sql += " AND kind=?"; params.push(kind); }
  if (style) { sql += " AND style=?"; params.push(style); }
  sql += " ORDER BY created_at DESC";
  return NextResponse.json(all(sql, ...params));
}

// POST /api/liblib/models
// body: { versionUuid, name?, kind?, style?, weight?, note?, businessLineId?, fetch? }
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const versionUuid = String(body.versionUuid || "").trim();
  if (!versionUuid) return NextResponse.json({ error: "缺 versionUuid" }, { status: 400 });

  let name = String(body.name || "").trim();
  let kind = String(body.kind || "lora").trim().toLowerCase();
  let style = String(body.style || "").trim();
  let baseAlgo = "";
  let license = String(body.license || "").trim().toLowerCase() || "unknown";
  let modelUrl = "";

  if (body.fetch !== false && !name) {
    try {
      const info = await liblibFetchModel(versionUuid);
      name = name || info.modelName || info.versionName || versionUuid;
      // baseAlgo 是数字枚举，优先存可读的 baseAlgoName（如"基础算法 v1.5"）
      baseAlgo = info.baseAlgoName || String(info.baseAlgo ?? "");
      if (!license || license === "unknown") license = parseLicense(info.commercialUse);
      modelUrl = info.modelUrl || "";
    } catch (e) {
      return NextResponse.json({ error: `拉取模型信息失败: ${(e as Error).message}` }, { status: 502 });
    }
  }
  if (!name) name = versionUuid;

  const weight = Number(body.weight) || 0.6;
  const note = String(body.note || "");
  const businessLineId = body.businessLineId ? Number(body.businessLineId) : null;

  try {
    const r = run(
      "INSERT INTO liblib_models(version_uuid,model_id,name,kind,style,base_algo,license,weight,model_url,note,business_line_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      versionUuid, "", name, kind, style, baseAlgo, license, weight, modelUrl, note, businessLineId
    );
    return NextResponse.json(get("SELECT * FROM liblib_models WHERE id=?", Number(r.lastInsertRowid)));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "该 versionUuid 已收藏" }, { status: 409 });
    }
    throw e;
  }
}

// PUT /api/liblib/models
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "缺 id" }, { status: 400 });
  const existing = get("SELECT id FROM liblib_models WHERE id=?", id);
  if (!existing) return NextResponse.json({ error: "模型不存在" }, { status: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  const add = (k: string, v: unknown) => {
    if (v !== undefined) { fields.push(`${k}=?`); values.push(v); }
  };
  add("name", body.name);
  add("kind", body.kind);
  add("style", body.style);
  add("license", body.license);
  add("weight", body.weight);
  add("note", body.note);
  add("business_line_id", body.businessLineId);
  if (!fields.length) return NextResponse.json({ error: "无更新内容" }, { status: 400 });
  values.push(id);
  run(`UPDATE liblib_models SET ${fields.join(",")} WHERE id=?`, ...values);
  return NextResponse.json(get("SELECT * FROM liblib_models WHERE id=?", id));
}

// DELETE /api/liblib/models
export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "缺 id" }, { status: 400 });
  run("DELETE FROM liblib_models WHERE id=?", id);
  return NextResponse.json({ ok: true, deletedId: id });
}

function parseLicense(v?: string): string {
  if (!v) return "unknown";
  const s = String(v).toLowerCase();
  if (s.includes("forbidden") || s.includes("禁商用") || s.includes("不可商用")) return "forbidden";
  if (s.includes("member") || s.includes("会员")) return "member_only";
  if (s.includes("commercial") || s.includes("可商用")) return "commercial";
  return "unknown";
}
