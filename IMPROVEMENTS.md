# ai-workbench 可落地改进清单

> 生成时间：2026-09-03
> 来源：深挖 infinite-canvas / Open-Generative-AI / clipforge 三个开源项目后，对照本项目现状提炼
> 用途：指导后续"大规模测试和调整"

---

## 现状盘点（已做得好，无需重复）

| 能力 | 现状 | 评价 |
|------|------|------|
| 多引擎 submit + poll 两步模式 | `engines/image.ts` / `video.ts` 已用 submitXxx/pollXxx + 统一 `EngineReply`/`VideoReply` | ✅ 已对齐 Open-Generative-AI 的 `muapi.js` 范式 |
| 异步任务轮询 | `lib/scheduler.ts` + `tasks` 表 | ✅ 已有 |
| 成本预估 | studio/video 页 `costInfo` + `pricing.ts` effectivePrice | ✅ 已有雏形 |
| KEY 加密存储 | `crypto-field.ts` AES-256-GCM | ✅ 业界领先，比三个参考项目都强 |

---

## P0 — 高价值低风险，建议本轮就做

### 1. 引擎注册表「单一真相源」（借鉴 Open-Generative-AI `models.js`） ✅ 已完成（2026-09-03）

> **已落地**：新建 `src/lib/engines/registry.ts`，集中定义 8 个引擎（含 DeepSeek/Qwen-VL）的 code/name/keyHint/kinds/配置字段/模型预设；`IMAGE_ENGINES` / `VIDEO_ENGINES` / `SETTINGS_GROUPS` / `MODEL_PRESETS` 全部由 registry 派生；`api/meta` 路由与 `settings/page.tsx` 改为从 registry import，删掉 image.ts/video.ts/settings 页里的散落常量。加新引擎只需改 registry + 写 submit/poll 适配函数 + `/api/settings/test` 加 case。
> **注**：未实现建议稿里的 `ratios` / `supportsI2I` / `priceUnit` 等更细能力声明，避免过度设计——待后续真正需要（按引擎差异控制宽高比、图生图开关）时再补。

**问题**：引擎元数据散落在 5 个文件里，加一个引擎要改 5 处，极易漏改：
- `engines/image.ts` 的 `IMAGE_ENGINES`（只有 code/name/keyHint，无模型列表、无能力声明）
- `engines/video.ts` 的 `VIDEO_ENGINES`
- `components/AppShell.tsx` 的 `meta.imageEngines/videoEngines`
- `settings/page.tsx` 每个引擎手写配置字段 + 模型 datalist
- `db.ts` 的 settings 默认值 + `PRICING_SEED`

**改法**：新建 `src/lib/engines/registry.ts`，集中定义每个引擎：
```ts
interface EngineMeta {
  code: string; name: string; type: "image" | "video";
  keyFields: string[];          // 需要的 KEY 字段，如 ["lovart_ak","lovart_sk"]
  models: string[];             // 可选模型（settings 页 datalist 从这里派生）
  ratios?: string[];            // 支持的宽高比
  supportsI2I?: boolean;        // 是否支持图生图/参考图
  priceUnit: string;            // 计价单位（张/秒/次）
}
```
`IMAGE_ENGINES`/`VIDEO_ENGINES`/settings 页字段/AppShell meta 全部由 registry 派生。

**收益**：加新引擎只改 registry 一处，其余 UI 自动生成。这是本项目"一平台多引擎"最该补的基础设施。

---

### 2. 付费前守门 + 参数硬校验（借鉴 clipforge 设计三） ✅ 已完成（2026-09-03）

> **已落地**：新建 `src/lib/validate.ts`（`validateImage`/`validateVideo`），在 `api/image/generate`、`api/video/generate` 入口统一做引擎白名单（registry 派生）+ prompt 非空/长度 + n 1-9 + duration 1-16 + ratio 白名单校验，非法即 400 拒绝、不落库。前端 studio/video 提交按钮加 `confirm` 二次确认（显示预计费用）。「不自动重试」核实已满足：scheduler 失败只标记 failed、轮询只查状态，均不重提交付费任务。

**问题**：出图/视频是真实计费场景，需确认以下几件事是否到位：
- 提交前是否有「显式确认」闸门（当前 `costInfo` 只展示成本，未确认是否强校验）
- 参数合法性前置校验（如可灵 n 上限、Vidu duration 1-16s、万相 n≤4 已部分硬编码，但分散在各 submit 里）
- 付费任务失败是否会自动重试（clipforge 原则：**创建付费任务绝不自动重试**）

**改法**：
- 在 `api/image/generate` / `api/video/generate` 入口统一做参数 clamp + 校验，失败即拒绝，不落库不重试
- 前端提交按钮明确「本次预计 ¥X，确认生成」二次确认

**收益**：杜绝静默触发付费、杜绝重复扣费。

---

### 3. 提示词库模块（借鉴 infinite-canvas「提示词库」） ✅ 已完成（2026-09-03）

**问题**：本项目有 prompt 生成/优化/反推，但没有「提示词模板库」。`db.ts` 已有 `templates` 表（`ensureExtraTemplates`），但缺少前端展示与分类浏览。

**已落地**：
- 新增 `/templates` 页（`src/app/(app)/templates/page.tsx`）：按业务线/内容类型分类浏览，支持关键词搜索、一键复制中英负面词、`{{变量}}` 占位符高亮
- 导航 `AppShell.tsx` 增加「提示词库 📝」入口
- `db.ts` 的 `EXTRA_TEMPLATES` 种子补充 3 条业务线模板：钛金鼓面字门头、户外广告牌效果图、木盆带货视频封面（合计 17 条模板）
- 端到端验证：构建成功、`/templates` 返回 200、`/api/meta` 返回 17 条模板含新增 3 条

**收益**：把一次性提示词沉淀成可复用的公司资产，贴合王哥「先搭知识库」的方法论。

---

## P1 — 中价值，业务刚需（建议二期）

### 4. 电商带货视频流水线（借鉴 clipforge 全链路） ✅ 已完成（2026-09-03，MVP）

> **已落地**：新建 `src/app/api/clipforge/route.ts`（商品信息 → 卖点提炼 + 脚本 + 视频提示词 + 合规检查）+ `src/app/(app)/clipforge/page.tsx`（带货视频工作台，导航新增「🛒 带货视频」入口）。`llm.ts` 新增 `generateClipforge()`：按平台（抖音/快手/小红书/视频号/淘宝）适配文案风格 + 按脚本类型（痛点/场景/测评）生成，脚本含分镜/口播/字幕/BGM，产出英文 `videoPrompt` 直供可灵/Vidu 图生视频；无 DeepSeek key 时给本地模板兜底。出视频复用现有 `/api/video/generate`（可选首帧图）。实测 DeepSeek 生成 3 分镜脚本成功。
> **留待二期**：分镜逐个出图/出视频、配音合成、字幕烧录、多平台一键导出（当前 MVP 输出脚本+提示词，手动出片）。

商品图 → AI 卖点提炼 → 3 套脚本 → 分镜画面 → 图生视频 → 合成 → 多平台导出。

**现状**：本项目 video 只有「脚本生成 + 单一视频生成」，缺卖点提炼、分镜、配音、字幕、合成、平台适配。

**改法**：作为新模块（`/clipforge` 或扩展 `/video`），复用现有 `prompt.generate`（DeepSeek）+ `video.generate`（可灵/Vidu），新增：
- 商品卖点提炼（复用 `llm.ts`）
- 脚本模板（痛点/场景/测评 3 套）
- 平台适配（抖音/快手/小红书/视频号/淘宝）

**收益**：直接服务实木花盆电商，是五平台运营的核心生产力工具。

---

### 5. 合规检查门禁（借鉴 clipforge 设计八） ✅ 已完成（2026-09-03）

> **已落地**：新建 `src/lib/compliance.ts`（广告法绝对化用语 29 条 + 医疗功效 13 条 + 虚假夸大 10 条，共 52 条词库，含建议替换词）+ `src/app/api/compliance/check/route.ts`（POST 文本扫描）。接入三处：①`studio`/`video`/`clipforge` 提交前扫描 `promptCn`/脚本，命中弹「⚠️ 广告法风险」警告（列出违规词+建议，用户可覆盖，不硬拦）②`prompt/generate` 返回附带 `compliance` 字段，编辑阶段即可见风险。设计原则：仅提示+警告不硬拦，最终判断权交回人工（部分词持证明可合法使用）。

**现状**：无违禁词扫描、无 AIGC 标识。

**改法**：新增 `/lib/compliance.ts`，在出图/视频文案提交前扫：
- 广告法绝对化用语（最/第一/国家级/顶级…）
- 医疗虚假功效（广告业务敏感）
- 出图/视频产物打 AIGC 隐式标识

**收益**：广告公司业务合规刚需，出片即合规。

---

### 6. 提示词/脚本质量闸门（借鉴 clipforge 设计四「判官团」） ✅ 已完成（2026-09-03）

> **已落地**：`llm.ts` 新增 `reviewScript()`——DeepSeek 扮演 5 角色（节奏官/口播官/创意官/结构官/画面官）交叉审查，输出分级采纳（硬伤/应改/品味）+ 总分（1-10）。新增 `/api/clipforge/review` 端点 + clipforge 页「判官团质检」按钮，审查结果按等级着色展示。实测对带货脚本审查，5 角色给出分级意见（结构官点出「只有 3 分镜结构不完整」硬伤、口播官点出「怎么用都不坏」绝对化用语）。

**现状**：prompt 生成是单模型一次产出，无质检。

**改法**：`/api/prompt/generate` 后加多角色交叉审查（节奏/口语/创意/结构/画面），输出分级采纳（硬伤/应改/品味）。

**收益**：提升出图/带货脚本命中率，减少反复重跑（省真金白银的 API 费用）。

---

### 7. 计费表真实数据（借鉴 awesome-ai-video-models / image-models） ✅ 已完成（2026-09-03）

> **已落地**：联网核实各引擎 2026-09 官方 API 公开价，更新 `db.ts` `PRICING_SEED`（即梦 seedream 4.0/4.5/5.0-lite/5.0-pro = 0.20/0.25/0.22/0.30 元/张；万相 2.1-turbo/2.1-plus/2.0-turbo = 0.14/0.20/0.04 元/张；可灵视频 master = 0.8 元/秒；Vidu Q3 pro/turbo = 1.0/0.5 元/秒）。`ensurePricing` 从 `INSERT OR IGNORE` 改为 **upsert（ON CONFLICT DO UPDATE）**——同步官方参考价（unit_price/unit/note），但保留管理页设置的折扣字段（discount_pct/discount_until）。已验证 `/api/pricing` 返回真实价。

**现状**：`db.ts` `PRICING_SEED` 是占位价格。

**改法**：对照 awesome 清单，把 LOVART/可灵/万相/即梦/Vidu 的真实单价 + 折扣填入 `engine_pricing`。

**收益**：成本预估才准确，付费守门（P0-2）才有意义。

---

## P2 — 可选增强（不紧急）

| # | 项 | 借鉴 | 说明 |
|---|----|------|------|
| 8 | 画布编排 | infinite-canvas | 无限画布 + 节点连线，大工程，适合做差异化但不是当前刚需 |
| 9 | 断点续跑强化 | clipforge 设计七 | ✅ 已完成（2026-09-03）：`tasks` 表已有轮询，但 `startScheduler()` 是懒启动（依赖 meta/image/video/plans 请求触发），服务重启后若无人访问则 processing 任务永久卡死。新增 `src/instrumentation.ts`，用 Next.js `register()` 钩子在服务启动时自动拉起调度器（build 阶段跳过）。实测：插入超时 processing 任务 → 重启服务 → 无任何请求下 scheduler 自动把任务判 error 收口 |
| 10 | 多入口（CLI/MCP/Skill） | clipforge 设计九 | ✅ 已完成（2026-09-03，CLI + Skill 两层）：新建 `cli.cjs`（零依赖 Node 脚本，封装登录/出图/视频/提示词/合规/轮询/引擎列表 7 个子命令 + `--wait` 自动轮询）；新建 WorkBuddy skill `~/.workbuddy/skills/ai-workbench/SKILL.md`，让旺财在对话里识别「出图/视频/提示词/合规」需求直接调用 CLI。实测 engines/compliance/tasks/prompt 全通、错误边界正确。MCP 未做（王哥在 WorkBuddy 内，Skill 已够用，MCP 面向外部 AI 工具） |
| 11 | 效果数据回流 | clipforge 设计十 | 导出页回填播放/成交数据，反哺脚本生成策略 |

---

## 建议执行顺序

1. **本轮**：P0-1（引擎注册表）+ P0-2（付费守门）→ 这是测试调整期最该补的地基
2. **下一轮**：P0-3（提示词库）+ P1-7（计费真实数据）
3. **业务驱动时**：P1-4（带货视频流水线）作为独立大模块立项
4. **P1-5/6** 随 P1-4 一并落地
