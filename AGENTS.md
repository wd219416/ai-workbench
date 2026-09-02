# AGENTS.md — AI 助手接管指令

> 本文件供 Codex / Claude / 其他 AI 助手在接管本项目二次开发时自动读取。
> 改动本文件前请告知用户。

## 项目概述

**典致 AI 内容创作工作台**（ai-workbench）—— 为陕西典致广告有限公司（实木花盆电商 + 广告设计）搭建的局域网 AI 内容生产平台。

核心能力：
- **提示词生成**：大白话需求 → 中英双语提示词（DeepSeek 驱动）
- **AI 出图**：LOVART / 可灵 / 通义万相 / 即梦 Seedream 四引擎
- **AI 出视频**：可灵 / Vidu 视频引擎
- **提示词反推**：上传参考图 → 反推提示词（千问 VL / DeepSeek）
- **品牌客服**：客户咨询登记 → AI 起草回复（知识库上下文）
- **计费表**：引擎单价 / 限时折扣管理 + 出图/视频前成本预估

业务线：木盆电商（line=1）、广告设计（line=2）。

## 技术栈

- **Next.js 15.3.4** App Router + React 19 + TypeScript
- **Tailwind CSS v4**（@theme 令牌，dark 主题，自定义工具类 `text-mute`/`btn-brand`/`card`/`input`/`label`/`tag`）
- **node:sqlite**（DatabaseSync，零原生依赖，单文件 DB 在 `data/app.db`）
- 无云依赖，纯本地 `npm run build && npm start`

## 运行

```bash
# 开发
npm run dev          # next dev -H 0.0.0.0 -p 3100

# 生产
npm run build        # next build
npm start            # next start -H 0.0.0.0 -p 3100

# 默认登录：admin / admin123（首次启动自动 seed）
```

**重要**：构建/启动时必须设 `NODE_OPTIONS=""`，否则 WorkBuddy 的 safe-delete-shim 会干扰文件操作。

## 目录结构

```
src/
├── app/
│   ├── (app)/              # 需登录的页面（layout.tsx 含 AppShell 导航）
│   │   ├── studio/         # 出图工作台（需求表单 + 提示词 + 出图 + 结果墙）
│   │   ├── video/          # 视频工作台（脚本生成 + 视频生成）
│   │   ├── pricing/        # 计费表管理页（admin）
│   │   ├── settings/       # 引擎配置页（API Key + 模型选择）
│   │   ├── service/        # 品牌客服（咨询登记 + AI 回复）
│   │   ├── knowledge/      # 知识库查看
│   │   ├── library/        # 素材库
│   │   ├── plans/          # 发布计划
│   │   └── tasks/          # 任务列表
│   ├── api/
│   │   ├── auth/           # login / logout / me（cookie session + HMAC token）
│   │   ├── image/generate  # 出图（LOVART/可灵/万相/即梦）
│   │   ├── video/generate  # 视频（可灵/Vidu）
│   │   ├── prompt/         # generate / optimize / reverse
│   │   ├── pricing/        # GET（列表/单查+effectivePrice）/ PUT（admin 改）
│   │   ├── service/        # 品牌客服 CRUD + AI 回复
│   │   ├── settings/       # GET/PUT + test（连通性测试）
│   │   ├── tasks/          # 任务列表 + [id] 轮询
│   │   └── ...
│   ├── login/              # 登录页
│   └── layout.tsx          # 根 layout
├── components/
│   └── AppShell.tsx        # 导航壳（meta 注入、业务线切换）
├── lib/
│   ├── db.ts               # ★ 数据库：schema + 迁移 + settings get/set + seed
│   ├── crypto-field.ts     # ★ AES-256-GCM 字段加密（敏感 KEY 自动加解密）
│   ├── auth.ts             # cookie session（HMAC 签名 token，30 天有效）
│   ├── llm.ts              # DeepSeek 对话 + 品牌客服回复 + 提示词生成
│   ├── pricing.ts          # effectivePrice 计算（折扣公式）
│   ├── persist.ts          # 持久化辅助
│   ├── scheduler.ts        # 任务轮询调度
│   └── engines/
│       ├── image.ts        # 出图适配器（LOVART/可灵/万相/即梦）
│       ├── video.ts        # 视频适配器（可灵/Vidu）
│       └── kling-auth.ts   # 可灵统一鉴权（新版单 Key / 旧版 ak/sk JWT）
└── data/                   # 运行时数据（已 gitignore）
    ├── app.db              # SQLite 数据库
    ├── fieldkey.bin        # ★ 加密主密钥（32B，不可提交、不可丢失）
    ├── secret.txt          # ★ session 签名密钥（不可提交）
    └── uploads/            # 出图产物
```

## 安全红线（勿动）

1. **`data/` 整个目录已 gitignore**——含加密主密钥 `fieldkey.bin`、数据库 `app.db`（含 KEY 密文）、`secret.txt`（session 密钥）。绝不提交。
2. **`src/lib/crypto-field.ts`** 是加密核心——`isSensitiveKey` 正则 `/(_key|_sk|_ak|_token)$/` 决定哪些字段加密。改这个正则会导致存量密文无法解密。
3. **`fieldkey.bin` 不可丢失**——丢了所有已加密 KEY 都无法解密，需重新配置全部 KEY。
4. **API Key 不进代码**——所有 KEY 走 `/settings` 页存数据库（加密），不硬编码在源码里。

## 架构约定

### 数据库（db.ts）

- 单文件 `data/app.db`，WAL 模式
- `globalThis` 缓存单例 `__wb_db`
- Schema 在 `SCHEMA` 常量，`getDb()` 首次调用时建表 + 跑迁移
- 迁移模式：`try { ALTER TABLE ... ADD COLUMN } catch {}`（幂等）
- `getSetting`/`setSetting`/`allSettings` 对敏感 KEY 透明加解密
- seed：`ensureExtraTemplates` / `ensurePricing` 用 `INSERT OR IGNORE` by-name upsert
- 表：users / settings / tasks / assets / templates / specs / channels / content_types / products / brand_assets / copy_lib / service_records / engine_pricing / plans

### API 路由约定

- **路由文件只能导出 HTTP 方法**（GET/POST/PUT/DELETE/HEAD/OPTIONS）+ `config`/`generateStaticParams`。导出其他函数会触发 Next.js 类型错误 `Type 'xxx' is incompatible with index signature`。公共函数放 `src/lib/`。
- 所有 API 需 `currentUser()` 鉴权（cookie `wb_session`），admin 操作额外查 `role`
- 引擎 KEY 测试走 `/api/settings/test`，每个引擎一个 case

### 添加新引擎（出图或视频）

1. `db.ts` 的 `SCHEMA` 加默认配置（base/key/model）+ 迁移 UPDATE
2. `PRICING_SEED` 加价格行
3. `engines/image.ts`（或 `video.ts`）加适配函数：`submitXxx`（提交）+ `pollXxx`（轮询）+ `extractXxx`（提结果）
4. `/api/settings/test` 加连通性测试 case
5. `AppShell.tsx` 的 `meta.imageEngines`/`videoEngines` 加引擎元数据
6. `settings/page.tsx` 加配置字段（KEY + 模型 datalist）

参考实现：LOVART 适配器（`image.ts` 的 `lovartConf`/`lovartSign`/`lovartApi`/`submitLovart`/`pollLovart`）是最完整的范例。

### 计费

- `engine_pricing` 表：`UNIQUE(engine, model)`，字段 `unit_price`/`unit`/`discount_pct`/`discount_until`/`note`
- `discount_pct` 是**减免百分比**：50 = 减 50% = 5 折，30 = 减 30% = 7 折
- 折扣文案公式：`(100 - discount_pct) / 10` → "限时X折"
- `pricing.ts` 的 `effectivePrice()` 计算折后价 + 文案
- 出图页（studio）/视频页（video）显示 `costInfo`（取该引擎最低价，多模型"起"）

## 常见坑

1. **`NODE_OPTIONS=""`**：构建/启动时必加，否则 WorkBuddy safe-delete-shim 干扰
2. **路由文件不导出非 HTTP 方法**：公共函数放 `src/lib/`（如 `pricing.ts`）
3. **多文件批量编辑后必须 grep 验证**：Edit 工具有时会静默丢编辑，每批改完 `grep -n` 确认
4. **改完走完整验证**：`grep 验证 → 停旧 server（TaskStop 工具）→ rm -rf .next → NODE_OPTIONS="" npm run build → 启动 → curl 验证 API → 看页面`
5. **WorkBuddy 托管的 server 任务**用 `TaskStop` 工具停，`taskkill` 看不到其进程名

## 二次开发建议方向

- **自动记账**：`tasks` 表已有 `usage`/`cost` 列，在 `/api/tasks/[id]` 轮询完成时解析引擎返回的 usage 字段落库，无 usage 时按价目表估算
- **万相视频**：阿里云百炼 API 接入 Wan2.2 视频模型（当前万相只接了图像）
- **多平台分发**：`plans` 表已有"待发布"状态，接飞书/抖音/淘宝发布通道
- **ChatGPT 通道**：`prompt.semiAuto` 已预留半自动指令，可接浏览器自动化

## 联系

- 用户：王哥（王东），陕西典致广告有限公司
- 业务：实木花盆电商 + 广告设计，五平台运营
- AI 助手：旺财（WorkBuddy）
