# 数据库体检报告（阶段一）

> 体检时间：2026-09-03 11:57 ｜ 工具：`diag-db.cjs`（已加入自检工具集，与 `diag-network.cjs` 并列）
> **结论：数据库整体健康。** 16 张表齐全、8 个引擎 KEY 全部加密可解、无数据损坏。
> 发现 3 个待办：1 个架构级（任务轮询依赖前端）+ 2 个运维级（可灵充值 / LOVART 网络）。

## 一、体检结果

### 1. 表结构 ✅ 完整
16 张业务表全部存在，无缺失（迁移日志里"17 张"含系统表，业务表实为 16 张）：

| 表 | 行数 | 表 | 行数 |
|---|---|---|---|
| assets | 4 | publish_plans | 1 |
| brand_assets | 3 | service_records | 1 |
| business_lines | 2 | settings | 24 |
| channels | 8 | spec_presets | 12 |
| clients | 0 | tasks | 15 |
| content_types | 18 | users | 1 |
| copy_lib | 2 | engine_pricing | 14 |
| products | 3 | prompt_templates | 14 |

### 2. 加密字段 ✅ 全部可解
8 个敏感 KEY 全部 AES-256-GCM 加密、可正常解密：**明文泄露 0、解密失败 0**。

### 3. 引擎 KEY 配置（解密后实测）

| 引擎 | 状态 |
|------|------|
| LOVART | ✅ 双 key（ak/sk） |
| 可灵 | ✅ 单 key（新版） |
| 万相 | ✅（与百炼共用同一个 key） |
| **即梦 jimeng** | ✅ **已配**（原记录"未配置"已过时，需更正） |
| Vidu | ✅ |
| DeepSeek | ✅ |
| Qwen-VL | ✅ |

## 二、发现的问题

### P1-1（架构级）任务轮询依赖前端 → processing 任务会卡死 ✅ 已修复
- **原状**：任务的 `processing → done` 转换，只由前端 studio/video 页的 `setInterval` 调 `/api/tasks/[id]` 触发 `pollImage/pollVideo`；后端 `scheduler.ts` 只处理发布计划，**不轮询普通任务**。
- **后果**：前端页面关闭/切页/刷新后，processing 任务永久卡住——引擎侧其实已生成，但图片 URL 拿不回来落库。
- **证据**：任务 `#13`（LOVART，11:52 创建）已卡 5 分钟无状态更新。
- **修复**（2026-09-03）：`scheduler.ts` 新增 `sweepTasks()`，每轮（60s）扫描所有 `processing` 任务逐个 poll 收口；`image/generate`、`video/generate` 路由新增 `startScheduler()` 确保兜底轮询随任务提交启动。
  - 三条分支已端到端验证通过：轮询收口（LOVART done）、超时兜底（>2h 判 error）、网络抖动不误杀（error 保留 processing）。
  - 安全约束：只查询不重提（无二次计费），对齐 clipforge「付费任务不重试」铁律。

### 运维-1 可灵余额不足
任务 `#7`：可灵 429 `Account balance not enough`（code 1102）。待充值，非代码问题。

### 运维-2 LOVART fetch failed ×3
任务 `#9/#10/#11`（09:41–09:59）：`LOVART: fetch failed`，网络/代理层失败。当前已恢复（11:56 新提交的任务能正常拿 thread_id）。需保证 Clash TUN 模式常开。

### 运维-3 万相内容审核拦截
任务 `#8`：`Output data may contain inappropriate content`（安全审核不过，非 bug，属正常拦截）。

## 三、附带产出
- `diag-db.cjs` —— 数据库只读自检脚本，用法 `node diag-db.cjs`，输出表清单/加密状态/引擎 KEY 配置/任务分布。
