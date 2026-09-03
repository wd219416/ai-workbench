# 典致 AI 工作台 — 可借鉴开源资源清单

> 搜集时间：2026-09-03
> 来源：GitHub 搜索（按项目能力线归类）
> 用途：为 ai-workbench（AI 出图/视频聚合工作台）的大规模测试调整提供学习与借用参考

---

## 项目能力 → 资源映射

| 本项目能力 | 引擎/技术 | 对应资源分组 |
|-----------|----------|-------------|
| AI 出图 | LOVART / 可灵 / 万相 / 即梦 | B 组（引擎接入）+ D 组（提示词） |
| AI 视频 | 可灵 / Vidu | B 组 + D 组 |
| LLM 提示词 | DeepSeek | D 组 |
| 整体工作台架构 | Next.js 15 + React 19 + node:sqlite | A 组 |
| 电商业务线 | 实木花盆电商 | C 组 |

---

## A 组：同类工作台 / 平台（整体架构直接借鉴）

| 仓库 | 星数 | 语言 | 为什么值得看 |
|------|------|------|-------------|
| [infinite-canvas](https://github.com/basketikun/infinite-canvas) | ⭐5970 | TypeScript | **定位最接近本项目**——AI 创作无限画布工作台，集成生图、参考图编辑、视频生成、Agent 助手、提示词库、素材管理；兼容 OpenAI 接口生态（chatgpt2api/grok2api/newapi） |
| [Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) | ⭐27601 | JavaScript | 开源 AI 出图/视频聚合平台，600+ 模型（Flux/Midjourney/Kling/Sora/Veo），**多引擎聚合范式**最佳参考，MIT |
| [tongflow](https://github.com/tong-io/tongflow) | ⭐1013 | TypeScript | 多模态 GenAI Studio，工作台 + 画布 + 视频 + 语音，架构现代 |
| [Open-AI-Design-Agent](https://github.com/Anil-matcha/Open-AI-Design-Agent) | ⭐343 | JavaScript | **Lovart 开源替代**——海报/社媒/品牌 Kit 设计 agent，可参考其 agent 编排 |
| [Loomic](https://github.com/fancyboi999/Loomic) | ⭐209 | TypeScript | Lovart/Canva 替代，chat 驱动无限画布生图/视频，Next.js + LangGraph |

---

## B 组：引擎 API 接入参考（本项目适配器直接借鉴）

| 引擎 | 仓库 | 星数 | 说明 |
|------|------|------|------|
| 即梦 Jimeng | [ComfyUI-Jimeng-API](https://github.com/fkxianzhou/ComfyUI-Jimeng-API) | ⭐84 | 火山方舟 API 调 Seedream/Seedance，**即梦缺 KEY 时可参考接入方式** |
| 即梦 Jimeng | [jimeng-mcp](https://github.com/c-rick/jimeng-mcp) | ⭐53 | 即梦 MCP，TypeScript |
| Vidu | [tryAGI/Vidu](https://github.com/tryAGI/Vidu) | ⭐0 | 生数科技 Vidu SDK，text-to-video / reference-to-video / image-to-video 参数参考 |
| 万相 Wanx | [tongyi-wanx-mcp-server](https://github.com/Suixinlei/tongyi-wanx-mcp-server) | ⭐6 | 通义万相 MCP 服务器 |
| 万相 Wanx | [tongyi-wanx-mcp](https://github.com/jesxion/tongyi-wanx-mcp) | ⭐2 | 通义万相文生图 MCP |
| LOVART | [lovart-skill](https://github.com/lovartai/lovart-skill) | ⭐124 | **Lovart 官方 skill**（用户正在评估 MCP/CLI 接入） |
| 多引擎 CLI | [egaki](https://github.com/remorses/egaki) | ⭐165 | 终端生图/视频，聚合 Google/OpenAI/Fal/Seedance，多引擎适配思路 |

---

## C 组：电商带货场景（用户电商业务直接复用）

| 仓库 | 星数 | 语言 | 说明 |
|------|------|------|------|
| [clipforge](https://github.com/xixihhhh/clipforge) | ⭐687 | TypeScript | **AI 带货短视频神器**——商品图 → 卖点提炼 → 脚本 → 视频，适配抖店/快手/小红书/TikTok，Next.js + Kling/Vidu/Seedance/Veo3 |
| [daihuo-jianshou](https://github.com/witty-suckerpunch492/daihuo-jianshou) | ⭐246 | TypeScript | clipforge 前身，同场景 |
| [Shopro-AI](https://github.com/wyxpro/Shopro-AI) | ⭐7 | TypeScript | 抖音/TikTok/快手/小红书带货视频端到端（脚本→数字人→分镜→混剪→发布） |
| [agent_part](https://github.com/JianFeiGan/agent_part) | ⭐15 | Python | 多 Agent 商品图/视频生成（主图/场景图/卖点图/分镜） |

---

## D 组：提示词工程 + 模型/价格对比（提示词生成、计费表参考）

| 仓库 | 星数 | 说明 |
|------|------|------|
| [Awesome-AI-Images-Prompts](https://github.com/dongyubin/Awesome-AI-Images-Prompts) | ⭐246 | 各模型提示词精选（即梦/Seedream 4.0/GPT Image 2/Gemini/FLUX/Midjourney） |
| [awesome-ai-video-models](https://github.com/Anil-matcha/awesome-ai-video-models) | ⭐190 | **视频模型对比：哪个模型、哪个 API、什么价格、多快** → 计费表直接参考 |
| [awesome-ai-image-models](https://github.com/Anil-matcha/awesome-ai-image-models) | ⭐81 | 出图模型对比（价格/API） |
| [awesome-kling](https://github.com/DSeaStar/awesome-kling) | ⭐0 | Kling 3.0 提示词 + Motion Control 工作流 + API 资源 |
| [kling-skills](https://github.com/full-aigc-skills/kling-skills) | ⭐0 | 可灵提示词工程（戏剧结构/镜头语言/多镜头叙事） |
| [GPT-Image-2-Seedance-2.5-Workflow](https://github.com/EvoLinkAI/GPT-Image-2-Seedance-2.5-Workflow) | ⭐587 | GPT Image 2 → Seedance 工作流（用户关注 GPT Image 2） |
| [awesome-video-generation](https://github.com/backblaze-labs/awesome-video-generation) | ⭐26 | AI 视频生成 API/SDK/tools 总清单 |

---

## E 组：通用资源导航

| 仓库 | 星数 | 说明 |
|------|------|------|
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | ⭐14253 | DeepSeek Harness 插件精选（可灵/即梦等插件生态） |
| [awesome-generative-ai-apps](https://github.com/Anil-matcha/awesome-generative-ai-apps) | ⭐3123 | 50+ 开源生成式 AI 应用，Next.js 一键部署 |
| [awesome-comfyui](https://github.com/ComfyUI-Workflow/awesome-comfyui) | ⭐736 | ComfyUI 节点合集 |

---

## 优先学习建议（王哥）

1. **先看 `infinite-canvas`** —— 定位、能力、技术栈最接近本项目，可对照补强工作台体验。
2. **`Open-Generative-AI`** —— 多引擎聚合的成熟范式，本项目"一平台多引擎"可借鉴其抽象层。
3. **`clipforge`** —— 电商带货视频是实木花盆业务刚需，可直接借鉴甚至复用其视频流水线。
4. **`awesome-ai-video-models` + `awesome-ai-image-models`** —— 计费表（engine_pricing）需要真实价格/速度数据，这里最全。
5. **即梦/Vidu/万相 SDK**（B 组）—— 补齐三个未跑通引擎的接入参考。
