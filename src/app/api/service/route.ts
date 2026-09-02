import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { serviceReply } from "@/lib/llm";

/** 知识库上下文：产品 + 品牌资料 + 文案库，喂给大模型起草回复 */
function kbContext(): string {
  const products = all<{ name: string; wood: string; size: string; price: string; selling_points: string }>(
    "SELECT name,wood,size,price,selling_points FROM products ORDER BY id DESC LIMIT 15"
  ).map((p) => `产品:${p.name}|材质:${p.wood || "-"}|尺寸:${p.size || "-"}|价格:${p.price || "-"}|卖点:${p.selling_points || "-"}`);
  const brands = all<{ kind: string; name: string; content: string }>(
    "SELECT kind,name,content FROM brand_assets ORDER BY id DESC LIMIT 8"
  ).map((b) => `品牌资料[${b.kind}]${b.name}:${(b.content || "").slice(0, 200)}`);
  const copies = all<{ title: string; content: string }>(
    "SELECT title,content FROM copy_lib ORDER BY id DESC LIMIT 8"
  ).map((c) => `文案[${c.title}]:${(c.content || "").slice(0, 150)}`);
  return [...products, ...brands, ...copies].join("\n");
}

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(all(
    `SELECT s.*, c.name AS client_name FROM service_records s
     LEFT JOIN clients c ON c.id = s.client_id
     ORDER BY s.id DESC LIMIT 50`
  ));
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();

  // action=reply：为已有记录生成 AI 回复草稿
  if (body.action === "reply") {
    const rec = get<{ id: number; content: string }>("SELECT id,content FROM service_records WHERE id=?", Number(body.id));
    if (!rec) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    const r = await serviceReply(rec.content || "", kbContext());
    run("UPDATE service_records SET reply=?, status='replied' WHERE id=?", r.reply, rec.id);
    return NextResponse.json({ ok: true, reply: r.reply, source: r.source, note: r.note });
  }

  const { clientId, kind, content } = body;
  if (!content) return NextResponse.json({ error: "咨询内容必填" }, { status: 400 });
  const r = run(
    "INSERT INTO service_records(client_id,kind,content,status) VALUES(?,?,?,'pending')",
    clientId ? Number(clientId) : null, String(kind || "咨询"), String(content)
  );
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

/** 手动改状态/改回复：status: pending|replied|closed */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, status, reply } = await req.json();
  const rec = get<{ id: number }>("SELECT id FROM service_records WHERE id=?", Number(id));
  if (!rec) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  if (status) run("UPDATE service_records SET status=? WHERE id=?", String(status), Number(id));
  if (reply !== undefined) run("UPDATE service_records SET reply=? WHERE id=?", String(reply), Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await req.json();
  run("DELETE FROM service_records WHERE id=?", Number(id));
  return NextResponse.json({ ok: true });
}
