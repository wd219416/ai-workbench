import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { currentUser } from "@/lib/auth";
import { getSetting } from "@/lib/db";
import { klingAuth } from "@/lib/engines/kling-auth";

async function ping(url: string, init?: RequestInit): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (res.ok) return { ok: true, message: `连通正常（HTTP ${res.status}）` };
    if (res.status === 401 || res.status === 403) return { ok: false, message: `服务可达，但鉴权失败（HTTP ${res.status}），请检查 KEY` };
    return { ok: false, message: `服务可达，返回 HTTP ${res.status}（接口路径可能需按官方文档调整）` };
  } catch (e) {
    return { ok: false, message: `连不通：${e instanceof Error ? e.message.slice(0, 120) : String(e)}` };
  }
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "仅管理员" }, { status: 403 });
  // 优先取表单当前值（掩码值回退到已保存值）
  const raw = await req.json().catch(() => ({})) as { group?: string; values?: Record<string, string> };
  const val = (k: string) => {
    const v = raw.values?.[k];
    if (v && !v.includes("****")) return v;
    return getSetting(k) || "";
  };

  const g = raw.group;
  switch (g) {
    case "deepseek": {
      const key = val("deepseek_key");
      if (!key) return NextResponse.json({ ok: false, message: "未填写 API Key" });
      const base = val("deepseek_base") || "https://api.deepseek.com";
      return NextResponse.json(await ping(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } }));
    }
    case "qwen": {
      const key = val("qwen_key");
      if (!key) return NextResponse.json({ ok: false, message: "未填写 API Key" });
      const base = val("qwen_base") || "https://dashscope.aliyuncs.com/compatible-mode/v1";
      return NextResponse.json(await ping(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } }));
    }
    case "wanxiang": {
      const key = val("wanxiang_key") || val("qwen_key");
      if (!key) return NextResponse.json({ ok: false, message: "未填写百炼 KEY（填 qwen_key 或 wanxiang_key）" });
      return NextResponse.json(await ping("https://dashscope.aliyuncs.com/compatible-mode/v1/models", { headers: { Authorization: `Bearer ${key}` } }));
    }
    case "liblib": {
      const ak = val("liblib_ak"), sk = val("liblib_sk");
      if (!ak || !sk) return NextResponse.json({ ok: false, message: "未填写双 KEY（企业认证后获取）" });
      // 官方开放平台：HMAC-SHA1 签名探测文生图接口（无裸 GET 探测端点）。
      // 故意发不完整参数（不带 templateUuid），签名通过→HTTP 200+业务code(100050)；签名错→401/403。
      const base = (val("liblib_base") || "https://openapi.liblibai.cloud").replace(/\/$/, "");
      const path = "/api/generate/webui/text2img";
      const ts = String(Date.now());
      const nonce = crypto.randomUUID().replaceAll("-", "");
      const sig = crypto.createHmac("sha1", sk).update(`${path}&${ts}&${nonce}`).digest("base64url");
      const q = new URLSearchParams({ AccessKey: ak, Signature: sig, Timestamp: ts, SignatureNonce: nonce }).toString();
      try {
        const res = await fetch(`${base}${path}?${q}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "ping" }), signal: AbortSignal.timeout(8000),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403 || data?.code === 401 || data?.code === 403) {
          return NextResponse.json({ ok: false, message: `服务可达，但鉴权失败（HTTP ${res.status} code=${data?.code}），请检查双 KEY` });
        }
        // HTTP 200 即签名通过（业务 code 100050 属"参数不完整"，正说明鉴权已过）
        if (res.ok) {
          return NextResponse.json({ ok: true, message: "连通正常，双KEY签名鉴权通过" });
        }
        return NextResponse.json({ ok: false, message: `服务可达，HTTP ${res.status} ${String(data?.msg || data?.message || "").slice(0, 60)}` });
      } catch (e) {
        return NextResponse.json({ ok: false, message: `连不通：${e instanceof Error ? e.message.slice(0, 100) : String(e)}` });
      }
    }
    case "jimeng": {
      const key = val("jimeng_key");
      if (!key) return NextResponse.json({ ok: false, message: "未填写方舟 API Key" });
      const base = val("jimeng_base") || "https://ark.cn-beijing.volces.com/api/v3";
      return NextResponse.json(await ping(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } }));
    }
    case "lovart": {
      const ak = val("lovart_ak"), sk = val("lovart_sk");
      if (!ak || !sk) return NextResponse.json({ ok: false, message: "未填写双 KEY" });
      // 官方 Agent OpenAPI：HMAC-SHA256 签名探测 mode/query（已实测通过）
      const base = (val("lovart_base") || "https://lgw.lovart.ai").replace(/\/$/, "");
      const path = `${val("lovart_path") || "/v1/openapi"}/mode/query`;
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac("sha256", sk).update(`POST\n${path}\n${ts}`).digest("hex");
      try {
        const res = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Access-Key": ak, "X-Timestamp": ts, "X-Signature": sig, "X-Signed-Method": "POST", "X-Signed-Path": path },
          body: "{}",
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.code === 0) return NextResponse.json({ ok: true, message: "连通正常，双KEY签名鉴权通过" });
        if (res.status === 401 || res.status === 403 || data?.code === 401 || data?.code === 403) {
          return NextResponse.json({ ok: false, message: `服务可达，但双KEY鉴权失败（HTTP ${res.status} code=${data?.code}），请检查 KEY` });
        }
        return NextResponse.json({ ok: false, message: `服务可达，HTTP ${res.status} ${String(data?.message || "").slice(0, 60)}` });
      } catch (e) {
        return NextResponse.json({ ok: false, message: `连不通：${e instanceof Error ? e.message.slice(0, 100) : String(e)}。LOVART 是海外服务，大陆直连需代理（TUN/全局模式）` });
      }
    }
    case "kling": {
      // 新版单 API Key：只填 Access Key 即可；Secret Key 留空走 Bearer 直传
      const auth = klingAuth(val("kling_ak"), val("kling_sk"));
      if (!auth.ok) return NextResponse.json({ ok: false, message: "未填写 API Key（新版单 Key 只填 Access Key 一栏）" });
      return NextResponse.json(await ping(`${auth.base}/v1/images/generations?limit=1`, { headers: { Authorization: auth.header! } }));
    }
    case "vidu": {
      const key = val("vidu_key");
      if (!key) return NextResponse.json({ ok: false, message: "未填写 Token" });
      const base = val("vidu_base") || "https://api.vidu.cn";
      // 官方无裸 GET 探测端点：POST 空 body，400=鉴权通过（参数不全），401/403=KEY 错
      try {
        const res = await fetch(`${base}/ent/v2/text2video`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Token ${key}` },
          body: "{}",
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 400 || res.ok) return NextResponse.json({ ok: true, message: `连通正常，Token 有效（HTTP ${res.status}）` });
        if (res.status === 401 || res.status === 403) return NextResponse.json({ ok: false, message: `服务可达，但 Token 鉴权失败（HTTP ${res.status}），请检查 KEY` });
        return NextResponse.json({ ok: false, message: `服务可达，返回 HTTP ${res.status}` });
      } catch (e) {
        return NextResponse.json({ ok: false, message: `连不通：${e instanceof Error ? e.message.slice(0, 120) : String(e)}` });
      }
    }
    case "comfyui": {
      const url = (val("comfyui_cloud_url") || val("comfyui_local_url")).replace(/\/$/, "");
      if (!url) return NextResponse.json({ ok: false, message: "未填写本地或云端地址" });
      return NextResponse.json(await ping(`${url}/system_stats`));
    }
    default:
      return NextResponse.json({ ok: false, message: `未知分组 ${g}` }, { status: 400 });
  }
}
