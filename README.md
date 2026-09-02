# 典致 AI 内容创作工作台

为陕西典致广告有限公司（实木花盆电商 + 广告设计）搭建的局域网 AI 内容生产平台。

## 功能

- **提示词生成**：大白话需求 → 中英双语提示词（DeepSeek 驱动）
- **AI 出图**：LOVART / 可灵 / 通义万相 / 即梦 Seedream 四引擎
- **AI 出视频**：可灵 / Vidu 视频引擎
- **提示词反推**：上传参考图 → 反推提示词（千问 VL / DeepSeek）
- **品牌客服**：客户咨询登记 → AI 起草回复（知识库上下文）
- **计费管理**：引擎单价 / 限时折扣 / 出图前成本预估

## 技术栈

- Next.js 15 App Router + React 19 + TypeScript
- Tailwind CSS v4（dark 主题）
- node:sqlite（零原生依赖，单文件 DB）
- AES-256-GCM 字段级加密（API Key 存储加密）

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产模式
NODE_OPTIONS="" npm run build
NODE_OPTIONS="" npm start
```

打开 http://localhost:3100，默认登录 `admin` / `admin123`。

首次启动后到 `/settings` 页配置各引擎 API Key。

## 项目结构

```
src/
├── app/              # Next.js App Router（页面 + API 路由）
├── components/       # AppShell 导航壳
└── lib/
    ├── db.ts         # 数据库 schema + 迁移 + settings
    ├── crypto-field.ts  # AES-256-GCM 字段加密
    ├── auth.ts       # cookie session
    ├── llm.ts        # DeepSeek 对话 + 提示词生成
    ├── pricing.ts    # 计价 + 折扣计算
    └── engines/      # 引擎适配器（image/video/kling-auth）
```

详细架构与开发约定见 [AGENTS.md](./AGENTS.md)。

## 安全

- `data/` 目录已 gitignore（含加密主密钥、数据库、出图产物）
- API Key 存数据库时 AES-256-GCM 加密，读取时透明解密
- `.env.example` 列出所有可配置项，真实值填 `.env`（已 gitignore）

## License

私有项目，陕西典致广告有限公司。
