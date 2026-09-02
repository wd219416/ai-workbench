import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { all, run, get } from "@/lib/db";

const TABLES: Record<string, string> = {
  products: "products",
  clients: "clients",
  copy: "copy_lib",
  brand: "brand_assets",
  templates: "prompt_templates",
};

export async function GET(_req: Request, ctx: { params: Promise<{ section: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { section } = await ctx.params;
  const table = TABLES[section];
  if (!table) return NextResponse.json({ error: "未知分区" }, { status: 404 });
  return NextResponse.json(all(`SELECT * FROM ${table} ORDER BY id DESC`));
}

export async function POST(req: Request, ctx: { params: Promise<{ section: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { section } = await ctx.params;
  const body = await req.json();
  let r;
  if (section === "products") {
    r = run("INSERT INTO products(business_line_id,sku,name,wood,size,style,price,selling_points,note) VALUES(?,?,?,?,?,?,?,?,?)",
      body.business_line_id || 1, body.sku || "", body.name || "", body.wood || "", body.size || "", body.style || "", body.price || "", body.selling_points || "", body.note || "");
  } else if (section === "clients") {
    r = run("INSERT INTO clients(name,industry,vi,contacts,note) VALUES(?,?,?,?,?)",
      body.name || "", body.industry || "", typeof body.vi === "string" ? body.vi : JSON.stringify(body.vi || {}), body.contacts || "", body.note || "");
  } else if (section === "copy") {
    r = run("INSERT INTO copy_lib(business_line_id,channel_id,title,content,tags) VALUES(?,?,?,?,?)",
      body.business_line_id || 1, body.channel_id || null, body.title || "", body.content || "", body.tags || "");
  } else if (section === "brand") {
    r = run("INSERT INTO brand_assets(business_line_id,kind,name,content,note) VALUES(?,?,?,?,?)",
      body.business_line_id || 1, body.kind || "", body.name || "", body.content || "", body.note || "");
  } else {
    return NextResponse.json({ error: "未知分区" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ section: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { section } = await ctx.params;
  const table = TABLES[section];
  if (!table) return NextResponse.json({ error: "未知分区" }, { status: 404 });
  const { id } = await req.json();
  const row = get(`SELECT id FROM ${table} WHERE id=?`, Number(id));
  if (!row) return NextResponse.json({ error: "不存在" }, { status: 404 });
  run(`DELETE FROM ${table} WHERE id=?`, Number(id));
  return NextResponse.json({ ok: true });
}
