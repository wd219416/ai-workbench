# LiblibAI 深度引入方案（ai-workbench）

> 版本 v1 · 2026-09-03 · 旺财出品
> 目标：把 LiblibAI（哩布哩布）的「聚合生图 + LoRA 生态 + ComfyUI 云端工作流」三层能力，深度接进典致自研的 ai-workbench，让王哥用「一套大白话 → 一张图」的直觉式界面就能调用，无需精通 ComfyUI 节点和 API 签名。

---

## 0. 结论先行（TL;DR）

Liblib 不是「又一个生图工具」，它是 ai-workbench 目前缺的**三块能力**：

| 能力 | Liblib 提供 | ai-workbench 现状 | 引入后 |
|---|---|---|---|
| **聚合生图** | 一个 API 通吃即梦/可灵/万相/Vidu/FLUX/MJ | 挨个直签官方 API | 新增 `liblib` 引擎，一个 Key 走天下 |
| **风格模型库** | 50 万+ LoRA/底模，可搜索/收藏/应用 | 无 | 新增「风格模型库」页，一键套用电商/产品风格 |
| **ComfyUI 工作流** | 云端免部署，节点式复现 | 适配器已预留但未启用 | 云端先跑，后期迁移本地 |

**核心落地逻辑（三个用户入口，从傻瓜到专业）**：

```
入口① 快速出图（傻瓜式）   → 现有 studio 页加一个「Liblib」引擎选项
入口② 风格模型库（半自动） → 新页：搜 Liblib 模型 → 收藏 → 出图时一键套用
入口③ 工作流（专业级）     → 新页：云端 ComfyUI 工作流，固化成可复用模板
```

---

## 1. Liblib 平台资源手册（速查卡）

### 1.1 平台定位（2026 最新）

- **运营主体**：北京演语科技（原奇点星宇），创始人陈冕（前字节剪映/CapCut 全球商业化负责人）
- **体量**：用户 3000 万+，模型 50 万+（LoRA 为主），日均生成 500 万+ 图，全球访问量 1 亿+
- **融资**：2026.6 B+ 轮近 3 亿美元，估值 20-30 亿美元，拟冲港股 IPO
- **合规**：国内首家通过《生成式 AI 服务管理暂行办法》备案的 AI 社区

### 1.2 模型资源（2026 最新，按用途分类）

**图片模型（聚合官方 + 自研）**：

| 模型 | 出品方 | 定位 | 对你的用途 |
|---|---|---|---|
| Seedream 5.0 Pro / Lite | 字节 | 精准编辑、原生多语言排版 | 广告文案配图、多语言排版 |
| 智能图片 V2 / 全能图片 V2-Flash | 自研 | 长文本、联网图搜 | 复杂需求直接出图 |
| Qwen-Image | 阿里 | 通义万相系 | 通用电商图 |
| FLUX / SDXL / MJ V7 | 社区 | 底模生态 | 配合 LoRA 出风格图 |

**视频模型（LibTV 平台，2026.3 上线）**：

| 模型 | 定位 |
|---|---|
| Seedance 2.0 / 2.5 | 字节最强视频，15-30s 音画同出 |
| 可灵 3.0 / 3.0 Omni | 快手，一致性最强 |
| Happy Horse 1.0 | 阿里，多参生成，0.25 元/秒起 |
| Minmax H3 | 全模态输入 |

> 视频结论（上一轮已给）：Liblib 视频是补充，主力仍用「即梦（抖音）+ 可灵（画质）+ 海螺（性价比）」。

### 1.3 API 接入（关键，两套体系必须分清）

Liblib 有**两套 API**，用途和财务路径不同：

| 维度 | SD 模型/工作流 API | 官方聚合模型 API |
|---|---|---|
| 域名 | `https://openapi.liblibai.cloud` | `https://api.liblib.art` |
| 鉴权 | AccessKey + SecretKey，**HMAC-SHA1 签名** | Bearer api_key |
| 调什么 | 自定义 checkpoint/LoRA/**工作流** | 聚合的即梦/可灵/万相等官方模型 |
| 计费 | API 积分（企业认证后购买） | 按调用量 |
| 适用 | 入口②风格模型、入口③工作流 | 入口①快速出图 |

**HMAC-SHA1 签名算法（SD 模型 API，稳定机制）**：

```
签名串 = URI + "&" + Timestamp(毫秒) + "&" + SignatureNonce(UUID去横线)
Signature = Base64URL( HMAC-SHA1(SecretKey, 签名串) )  去尾部等号
query 附带：AccessKey / Signature / Timestamp / SignatureNonce
流程：POST `/api/generate/webui/text2img` 提交 → 返回 `data.generateUuid` → POST `/api/generate/webui/status` 轮询 → `generateStatus=5` 取 `images[].imageUrl`
```

**门槛（重要）**：个人免费账号拿不到 API Key，必须**企业实名认证** + 领取试用积分（500 积分/7 天）或购买 API 积分。这正好对得上你的营业执照（陕西典致广告有限公司）。

### 1.4 LoRA 生态（Liblib 的护城河）

- **Checkpoint 底模** = 画工（一次装一个），**LoRA** = 风格滤镜（可叠多个）
- **50 万+ 现成模型**：电商/国潮/新中式/产品/人像/摄影是重头
- **在线训练**：上传 15-30 张图，云端 30-60 分钟炼专属模型，**免本地显卡**
- **商用授权三档**：`可商用` / `仅会员可商用` / `企业禁商用` —— 出商业图只挑「可商用」
- **变现**：炼的专属 LoRA 可上架社区分成

### 1.5 ComfyUI 云端（入口③的基础）

- **免部署**：首页 → ComfyUI，浏览器直接开节点画布，无需显卡/环境
- **能力**：粘贴 JSON 工作流 / 上传文件复现；预装 ControlNet 等插件；模型下拉菜单直接选
- **适配建议**：20-30 步、512×512 起步；云端适合「复现社区方案 + 固化生产流程」

---

## 2. 现有平台现状与接入点（已摸清）

### 2.1 现有引擎（5 出图 + 2 视频）

出图引擎在 `src/lib/engines/image.ts`，每个引擎三个函数 `submitXxx`（提交）/ `pollXxx`（轮询）/ 同步返回：

| 引擎 | 适配器 | 状态 |
|---|---|---|
| LOVART | submitLovart / pollLovart | ✅ 双KEY HMAC-SHA256，已实测 |
| 可灵 | submitKling / pollKling | ✅ ak/sk |
| 万相 | submitWanxiang / pollWanxiang | ✅ 百炼KEY |
| 即梦 | submitJimeng | ✅ 方舟ARK，同步返回 |
| **ComfyUI** | submitComfyUI / pollComfyUI | ⚠️ **已预留，未启用** |

### 2.2 引擎注册机制（加引擎只改 4 处，已封装好）

`src/lib/engines/registry.ts` 是单一真相源，加引擎只需：

1. `registry.ts` 的 `ENGINES` 加一条 `EngineDef`（code/name/keyHint/kinds/fields/models）
2. `image.ts` 加 `submitLiblib` / `pollLiblib` 适配函数
3. `/api/settings/test` 加连通性测试 case
4. `db.ts` 的 `DEFAULT_SETTINGS` + `PRICING_SEED` 补默认配置 / 价格

**好消息**：ComfyUI 适配器（第 217-250 行）已经写好了，支持 `{{prompt}}` 占位符 + `/prompt` 提交 + `/history/{id}` 轮询 + `/view` 取图。**接入 ComfyUI 云端只需填 `comfyui_cloud_url` 和 `comfyui_workflow` 两个字段，代码零改动。**

---

## 3. 深度引入架构设计

### 3.1 总体思路

把 Liblib 拆成**三层能力**，分别落到平台的**三个入口**，用户按需逐级深入：

```
┌─────────────────────────────────────────────────────────┐
│  入口① 快速出图（现有 studio 页，零学习成本）            │
│  → 新增「liblib」引擎选项，复用现有 需求→提示词→出图 流程 │
├─────────────────────────────────────────────────────────┤
│  入口② 风格模型库（新页面）                              │
│  → 搜/收藏 Liblib 的电商·产品·国潮 LoRA，出图一键套用    │
├─────────────────────────────────────────────────────────┤
│  入口③ ComfyUI 工作流（新页面，前期走云端）              │
│  → 云端部署 ComfyUI，固化「木盆场景图/广告实景合成」流程  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 数据模型（新增）

**settings 表新增字段**（走现有 AES-256-GCM 加密，`_sk`/`_ak` 自动加密）：

| key | 说明 |
|---|---|
| `liblib_ak` | SD 模型 API 的 AccessKey（敏感） |
| `liblib_sk` | SD 模型 API 的 SecretKey（敏感） |
| `liblib_base` | 默认 `https://openapi.liblibai.cloud` |
| `liblib_api_key` | 聚合模型 API 的 Bearer key（敏感，入口①用） |
| `liblib_checkpoint_id` | 默认底模 ID（入口①） |

**新增表 `liblib_models`**（入口②风格模型库）：

```sql
CREATE TABLE IF NOT EXISTS liblib_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,        -- Liblib 模型ID
  name TEXT NOT NULL,            -- 模型名
  kind TEXT NOT NULL,            -- checkpoint / lora
  style TEXT,                    -- 风格标签（电商/国潮/产品…）
  license TEXT NOT NULL DEFAULT 'unknown', -- 商用授权：commercial/member_only/forbidden
  business_line_id INTEGER,      -- 归属业务线（1木盆/2广告）
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(model_id)
);
```

> 这套表同时解决「收藏的模型哪个能商用」的合规痛点——出图前按 `license` 过滤，杜绝误用禁商用模型。

### 3.3 引擎适配器（伪代码，HMAC-SHA1 签名已定型）

```ts
// src/lib/engines/image.ts 新增
function liblibConf() {
  return {
    ak: getSetting("liblib_ak"), sk: getSetting("liblib_sk"),
    base: getSetting("liblib_base") || "https://openapi.liblibai.cloud",
  };
}
function liblibSign(uri: string, sk: string) {
  const ts = String(Date.now());                 // 毫秒
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const sig = crypto.createHmac("sha1", sk)
    .update(`${uri}&${ts}&${nonce}`).digest("base64url").replace(/=+$/, "");
  return { AccessKey: ak, Signature: sig, Timestamp: ts, SignatureNonce: nonce };
}
async function submitLiblib(job: ImageJob): Promise<EngineReply> {
  // 文生图：POST /api/generate/webui/text2img
  // 图生图：先 POST /api/generate/upload/signature 拿 OSS 签名 → FormData 上传参考图 →
  //        用返回 URL 作为 sourceImage，POST /api/generate/webui/img2img
  // 返回 data.generateUuid → status "submitted"
}
async function pollLiblib(uuid: string) {
  // POST /api/generate/webui/status，body { generateUuid } → done/failed/processing + images[].imageUrl
}
```

> ✅ **阶段 1 已实测跑通（2026-09-03）**：真实 Key 端到端验证通过。
>
> - **文生图**：`submitLiblib` 提交 `{ templateUuid, generateParams: { prompt, width, height, steps, cfgScale, seed, imgCount, negativePrompt? } }` → 返回 `data.generateUuid`；`pollLiblib` POST `/api/generate/webui/status` → `generateStatus: 2=处理中 / 5=成功 / 6/7=失败`，成功时图片在 `data.images[].imageUrl`。普通文生图模板 UUID 默认 `e10adc3949ba59abbe56e057f20f883e`，实测木盆图已生成并落库。
>
> - **图生图**：`submitLiblib` 检测到 `job.refImagePath` 存在时自动切换：① `POST /api/generate/upload/signature` 取 OSS 直传签名（接口返回驼峰 `xOss*` 字段，官方 SDK 示例代码误写为小写 `xoss*`）；② FormData 直传阿里云 OSS（字段 `x-oss-signature`/`x-oss-date`/`x-oss-signature-version`/`policy`/`key`/`x-oss-credential`/`x-oss-expires`/`file`）；③ 用返回图片 URL 作为 `generateParams.sourceImage`，调 `/api/generate/webui/img2img`（必填 `resizeMode`/`resizedWidth`/`resizedHeight`/`denoisingStrength`）。普通图生图模板 UUID 默认 `9c7d531dc75f476aa833b3d452b8f7ad`。2026-09-03 实测端到端成功，任务 `taskId=31` 完成落盘。
>
> - **计费**：文生图 5 积分/张，图生图 4 积分/张。任务完成后 `data.pointsCost`/`data.accountBalance` 返回消耗与余额。

### 3.4 三个入口的界面改造

| 入口 | 改哪个文件 | 改动量 | 用户看到什么 |
|---|---|---|---|
| ① 快速出图 | `registry.ts` + `studio/page.tsx` | 小 | 引擎下拉多一个「Liblib」 |
| ② 风格模型库 | 新增 `src/app/(app)/liblib/page.tsx` + `/api/liblib/*` | 中 | 侧栏新增「风格模型」页 |
| ③ 工作流 | 新增 `src/app/(app)/comfyui/page.tsx` + 复用现有适配器 | 中 | 侧栏新增「ComfyUI 工作流」页 |

---

## 4. 分阶段落地路线图

| 阶段 | 内容 | 依赖 | 状态 |
|---|---|---|---|
| **阶段 0** | Liblib 企业实名认证 → 领 500 试用积分 → 拿 AccessKey/SecretKey | 营业执照（已有） | ✅ 已完成（2026-09-03） |
| **阶段 1** | 入口①：`liblib` 聚合出图引擎接入（文生图 + 图生图，registry + 适配器 + 设置页 + 定价） | 阶段 0 的 Key | ✅ 已实测跑通（木盆文生图 + 图生图均落库） |
| **阶段 2** | 入口②：风格模型库页（搜/收藏/套用 Liblib LoRA） | 阶段 1 | 待开发 |
| **阶段 3** | 入口③：ComfyUI 云端工作流（填 `comfyui_cloud_url` + 固化木盆/广告工作流） | Liblib 云端 ComfyUI 开通 | 代码已就绪 |
| **阶段 4** | 专属 LoRA 训练闭环（上传 20 张木盆图 → 炼「实木花盆」风格 → 商用） | 阶段 2 | 规划中 |

**最快见效路径**：阶段 0（你花 10 分钟认证）+ 阶段 1（我写代码）→ 立刻能用 Liblib 一个 Key 调即梦/可灵/万相/FLUX 出图。

---

## 5. ComfyUI 云端部署路径（你的第 4 点）

**前期（云端，零成本起步）**：
1. 登录 Liblib → 首页 → ComfyUI，浏览器直接开节点画布
2. 从「工作流」广场搜「电商产品图」「实景合成」现成工作流 → 一键复现
3. 把跑通的工作流 JSON 复制下来，贴进 ai-workbench 设置页的 `comfyui_workflow` 字段
4. 在 ai-workbench 里就能「大白话需求 → 填工作流 → 出图」，不用再碰节点

**后期（本地，你的 5060 能扛）**：
- 你这台 i5-12600KF + RTX 5060 + 32GB，本地跑 SDXL 级别 ComfyUI 完全够（FLUX 会吃力）
- 从云端复制工作流 JSON → 本地 ComfyUI 导入，路径重映射即可
- 好处：不花 Liblib 算力点，商用权更干净

**关键建议**：前期先云端跑通「木盆场景图」「标识实景合成」两个高频工作流，验证流程可行性；等量大到算力费超过电费，再迁本地。

---

## 6. 风险与决策点

| 风险 | 影响 | 对策 |
|---|---|---|
| **API Key 门槛**：个人账号无 API | 阶段 1 卡住 | 走企业认证（你有营业执照，顺手） |
| **商用授权**：部分模型禁商用 | 出商业图有隐患 | `liblib_models` 表强制记 `license`，出图前过滤 |
| **接口迭代**：SD 模型 API 偶有变动 | 适配器要跟进 | 签名机制稳定，只动路径/参数；以官方文档为准 |
| **内容合规**（2026.4 央视曝光后已整改） | 平台上市前硬伤 | 对你的木盆/广告图无影响，正常使用 |
| **差价**：Liblib 聚合比直签官方贵 | 成本略高 | 用「一张发票、一个余额池」换省事；量大再回直签 |

---

## 7. 下一步

1. ~~阶段 1 代码~~ ✅ 已完成；~~企业认证拿 Key + 实测校对~~ ✅ 已完成（2026-09-03，真实木盆文生图 + 图生图均已生成落库，任务号 taskId=31）。
2. **阶段 2（入口②：风格模型库）**：搜/收藏/套用 Liblib LoRA 模型。要不要我接下来开写？
3. **阶段 3（入口③：ComfyUI 云端工作流）**：Liblib 云端跑通 → 固化木盆/招牌工作流 → 填 `comfyui_cloud_url` + workflow JSON 即可启用，代码已预留。要不要现在接？
4. **持续更新** ✅ 已建每周一 09:00 自动化，自动抓 Liblib 最新模型/价格/API 变动并更新本手册。

> 本文档沉淀在项目根目录，随项目迭代维护。接口细节以 Liblib 开发者中心实时文档为准。
