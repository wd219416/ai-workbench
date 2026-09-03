"use client";
import { useState } from "react";
import { useShell } from "@/components/AppShell";

interface Product { id: number; sku: string | null; name: string; wood: string | null; size: string | null; style: string | null; price: string | null; selling_points: string | null }
interface FabeRow { feature: string; advantage: string; benefit: string; evidence: string }
interface SellingResult {
  mode?: string;
  usp: string;
  fabe: FabeRow[];
  painPointHook: string;
  cta: string;
  platforms: Record<string, string>;
  source: string;
  note?: string;
  instruction?: string;
  compliance?: { safe: boolean; hits: { word: string; suggestion: string }[] };
}

const PLATFORMS = ["淘宝", "抖店", "拼多多", "视频号", "小红书"];

export default function SellingPage() {
  const { meta } = useShell();
  const products = (meta.products || []) as Product[];

  const [product, setProduct] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [audience, setAudience] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(PLATFORMS);
  const [engine, setEngine] = useState<"deepseek" | "codex">("deepseek");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SellingResult | null>(null);
  const [pasteJson, setPasteJson] = useState("");
  const [pasteError, setPasteError] = useState("");

  function pickProduct(id: number) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setProduct(`${p.name}，${p.wood || "实木"}材质，${p.size || ""}，${p.style || ""}，参考价${p.price || ""}`);
    setSellingPoints(p.selling_points || "");
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function generate() {
    setBusy(true);
    setPasteError("");
    setResult(null);
    setPasteJson("");
    const res = await fetch("/api/selling", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, sellingPoints, audience, platform: platforms.join(","), engine }),
    });
    setBusy(false);
    if (!res.ok) return;
    setResult(await res.json());
  }

  function parsePasted() {
    setPasteError("");
    try {
      const m = pasteJson.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("未找到 JSON");
      const p = JSON.parse(m[0]);
      setResult({
        mode: "codex",
        usp: p.usp || "",
        fabe: (Array.isArray(p.fabe) ? p.fabe : []).slice(0, 3).map((r: Record<string, unknown>) => ({
          feature: String(r.feature ?? ""), advantage: String(r.advantage ?? ""), benefit: String(r.benefit ?? ""), evidence: String(r.evidence ?? ""),
        })),
        painPointHook: String(p.painPointHook ?? ""),
        cta: String(p.cta ?? ""),
        platforms: p.platforms && typeof p.platforms === "object" ? p.platforms as Record<string, string> : {},
        source: "codex",
      });
    } catch (e) {
      setPasteError(`解析失败：${(e as Error).message}`);
    }
  }

  const copy = (t: string) => navigator.clipboard.writeText(t);

  return (
    <div className="grid grid-cols-[360px_1fr] gap-4 h-full">
      {/* 左：商品信息 */}
      <div className="card p-4 space-y-3 overflow-auto">
        <div className="font-medium text-sm">产品卖点提炼</div>
        {products.length > 0 && (
          <div>
            <label className="label">从产品库选择（可选）</label>
            <select className="input" onChange={(e) => pickProduct(Number(e.target.value))} defaultValue="">
              <option value="" disabled>选择商品…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">商品信息（名称 + 核心描述）</label>
          <textarea className="input h-24 resize-none" placeholder="如：碳化木方形花盆 30×30×30cm，整木裁切、高温碳化防腐、带托盘，阳台庭院两用" value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <div>
          <label className="label">已有卖点（可选，逗号分隔）</label>
          <input className="input" placeholder="留空则 AI 自动提炼" value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} />
        </div>
        <div>
          <label className="label">目标人群（可选）</label>
          <input className="input" placeholder="如：阳台养花爱好者 / 宝妈 / 上班族" value={audience} onChange={(e) => setAudience(e.target.value)} />
        </div>
        <div>
          <label className="label">目标平台（可多选，用于生成各平台文案变体）</label>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => (
              <button key={p} onClick={() => togglePlatform(p)}
                className={`tag cursor-pointer transition ${platforms.includes(p) ? "text-brand! border-brand!" : ""}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">生成引擎</label>
          <div className="flex gap-1">
            <button onClick={() => setEngine("deepseek")} className={`tag cursor-pointer ${engine === "deepseek" ? "text-brand! border-brand!" : ""}`}>DeepSeek 直连</button>
            <button onClick={() => setEngine("codex")} className={`tag cursor-pointer ${engine === "codex" ? "text-brand! border-brand!" : ""}`}>Codex 半自动</button>
          </div>
          {engine === "codex" && <div className="text-[11px] text-mute mt-1">生成结构化指令 → 复制到 Codex/ChatGPT 网页执行 → 把结果 JSON 粘回来解析。</div>}
        </div>
        <button className="btn btn-brand w-full" onClick={generate} disabled={busy || !product}>
          {busy ? "生成中…" : engine === "deepseek" ? "提炼卖点" : "生成 Codex 指令"}
        </button>
      </div>

      {/* 右：结果 */}
      <div className="space-y-4 overflow-auto">
        {!result && (
          <div className="card p-6 text-center text-mute text-[13px]">
            填好商品信息后点「提炼卖点」。输出：一句话卖点 + FABE 卖点表 + 痛点开场 + 各平台文案变体。
          </div>
        )}

        {/* Codex 半自动：指令 + 粘贴框 */}
        {result?.mode === "codex" && result.instruction && (
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">Codex 执行指令</div>
              <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(result.instruction!)}>复制指令</button>
            </div>
            <textarea className="input h-40 resize-none text-[12px] font-mono" readOnly value={result.instruction} />
            <div>
              <div className="flex items-center justify-between">
                <label className="label">粘贴 Codex 返回的 JSON 结果</label>
                <button className="tag cursor-pointer hover:border-brand" onClick={parsePasted} disabled={!pasteJson}>解析结果</button>
              </div>
              <textarea className="input h-24 resize-none text-[12px] font-mono" placeholder='粘贴形如 {"usp":"...","fabe":[...]} 的 JSON' value={pasteJson} onChange={(e) => setPasteJson(e.target.value)} />
              {pasteError && <div className="text-[11px] text-bad mt-1">{pasteError}</div>}
            </div>
          </div>
        )}

        {result && (result.usp || result.fabe.length > 0) && (
          <div className="card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">提炼结果</div>
              <span className="tag">{result.source === "deepseek" ? "DeepSeek 生成" : result.source === "codex" ? "Codex 生成" : "本地模板"}</span>
            </div>
            {result.note && <div className="text-[11px] text-brand">{result.note}</div>}
            {result.compliance && result.compliance.hits?.length > 0 && (
              <div className="text-[11px] text-bad bg-bad/10 border border-bad/30 rounded-lg p-2">
                ⚠️ 文案命中 {result.compliance.hits.length} 处广告法风险：
                {result.compliance.hits.map((h) => `「${h.word}」→ ${h.suggestion}`).join("；")}
              </div>
            )}

            {result.usp && (
              <div className="border border-brand/40 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-brand">一句话核心卖点（USP）</span>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(result.usp)}>复制</button>
                </div>
                <div className="text-[15px] font-medium mt-1 leading-relaxed">{result.usp}</div>
              </div>
            )}

            {result.fabe.length > 0 && (
              <div>
                <label className="label">FABE 卖点表</label>
                <div className="border border-line rounded-lg overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-panel2 text-mute">
                        <th className="text-left p-2 font-medium border-b border-line w-[18%]">特性 F</th>
                        <th className="text-left p-2 font-medium border-b border-line w-[22%]">优势 A</th>
                        <th className="text-left p-2 font-medium border-b border-line w-[30%]">利益 B</th>
                        <th className="text-left p-2 font-medium border-b border-line w-[30%]">证据 E</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.fabe.map((r, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="p-2 align-top">{r.feature}</td>
                          <td className="p-2 align-top">{r.advantage}</td>
                          <td className="p-2 align-top">{r.benefit}</td>
                          <td className="p-2 align-top text-mute">{r.evidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.painPointHook && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">痛点开场 + 转化话术</label>
                  <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(result.painPointHook)}>复制</button>
                </div>
                <textarea className="input w-full h-24 resize-none text-[12px]" readOnly value={result.painPointHook} />
              </div>
            )}

            {result.cta && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-mute">行动号召：</span>
                <span className="tag">{result.cta}</span>
                <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(result.cta)}>复制</button>
              </div>
            )}

            {Object.keys(result.platforms).length > 0 && (
              <div>
                <label className="label">各平台文案变体</label>
                <div className="space-y-2">
                  {Object.entries(result.platforms).map(([p, txt]) => (
                    <div key={p} className="border border-line rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="tag">{p}</span>
                        <button className="tag cursor-pointer hover:border-brand" onClick={() => copy(txt)}>复制</button>
                      </div>
                      <div className="text-[12px] leading-relaxed mt-1.5">{txt}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
