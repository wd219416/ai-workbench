# LiblibAI（哩布哩布）云端 ComfyUI 接入调研报告

调研日期：2026-09-03。结论基于官方文档入口、第三方 SDK（Go/Java/npm）源码级接口清单与社区教程交叉验证。

## ① 结论先行

- **云端 ComfyUI（浏览器在线版）不暴露标准 ComfyUI REST API**。没有官方公开的 `/prompt`、`/history/{id}`、`/view` 直连地址，在线版走的是 Liblib 自有网关 + 浏览器会话鉴权。我们现有的「标准 ComfyUI 适配器」无法直连复用。
- **能接，但走开放平台替代路径**：`openapi.liblibai.cloud` 提供 `POST /api/generate/comfyui/app`（提交 ComfyUI 工作流任务）+ `POST /api/generate/comfy/status`（轮询结果，图片以 URL 返回）。签名方式与现有 `/api/generate/webui/text2img` 完全一致（AccessKey + SecretKey + HMAC-SHA1，query string 携带签名）。
- **关键限制**：不能直接提交任意标准 ComfyUI API 格式 JSON。工作流必须先在 Liblib 平台「发布为 AI 应用」，拿到 `templateUuid` / `workflowUuid` 后才能调用；工作流内模型引用也被替换为 Liblib 模型 UUID。即：`comfyui_workflow` 配置字段里存的将是「Liblib 变体 API JSON」，与本地 ComfyUI 工作流不互通。
- **要花钱**：API 调用消耗独立的 API 积分（新用户可领 500 试用积分/7 天），与网页端 VIP 会员积分体系分开。生产接入需购买 API 积分包。
- **工作量**：需要新写一个 Liblib provider（签名 + 提交 + 轮询 + 图片 URL 下载），无法套用现有 ComfyUI REST 适配器；每上一个工作流需人工在 Liblib 发布一次。

## ② 云端 ComfyUI API 可达性详情

- 官方仅提供两条程序化路径：网页端（浏览器操作）和 API 开放平台（openapi.liblibai.cloud）。
- 检索官方文档入口（liblib.art/apis、开放平台 Docs）及社区逆向资料，**均未发现**云端 ComfyUI 暴露标准 ComfyUI Server API（/prompt、/ws、/history、/view）的公开地址或文档。在线 ComfyUI 前端与 Liblib 网关通信，鉴权绑定登录会话，不适合外部程序直连。
- 社区对「本地 ComfyUI 界面 + 云端算力」类混合方案的评价中，Liblib 被明确指出「原生 ComfyUI 工作流支持不如 RunningHub 完整」，进一步佐证无直连 API（来源：https://xiangyugongzuoliu.com/comfyui-cloud-platform-guide/ ）。
- 结论：**直连不可行（未发现任何官方或社区可用方案）**。若后续发现变化需重测。

## ③ 替代路径：开放平台 ComfyUI 工作流 API

来源：官方 API 开放平台（https://www.liblib.art/apis ）、第三方 SDK 接口清单（https://github.com/gravitywp/liblib-java-sdk ）、npm liblibai（https://www.npmjs.com/package/liblibai ）、astrbot 插件文档（https://github.com/machinad/astrbot_plugin_liblibapi ）。

### 端点
| 用途 | 端点 | 说明 |
|---|---|---|
| 提交工作流任务 | `POST https://openapi.liblibai.cloud/api/generate/comfyui/app` | 返回 `generateUuid` |
| 轮询结果 | `POST https://openapi.liblibai.cloud/api/generate/comfy/status` | body 携带 `generateUuid`，成功后返回图片 URL 数组 |

### 请求体结构（实测社区示例）
```json
{
  "templateUuid": "4df2efa0f18d46dc9758803e478eb51c",
  "generateParams": {
    "workflowUuid": "955b8928c9604ef3931bbd35d08a4239",
    "3":  { "class_type": "KSampler", "inputs": { "seed": 377101986110064, "steps": 28, "cfg": 7 } },
    "4":  { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "2f32e43f45134387833cb87fa4122df5" } },
    "19": { "class_type": "JjkText", "inputs": { "text": "{{prompt}}" } }
  }
}
```
- `generateParams` 内是「节点 ID 为键、class_type + inputs 为值」的结构——**外观与标准 ComfyUI API 格式 JSON 同构**，但：
  - 必须携带 `templateUuid` + `workflowUuid`，即工作流须先在 Liblib 发布；
  - 模型/LoRA 文件名被替换为 Liblib 平台模型 UUID（如 `ckpt_name` 值为 32 位 UUID）；
  - 通常只需提交「开放配置的节点参数」，未开放的节点由平台侧工作流补全（**待实测验证**：是否可全量覆写未发布工作流——预期不行）。
- 社区工作流只有详情页标注「本工作流已提供API服务」的才可调用（来源：https://aisharenet.com/liblibai-apizhichian ）。
- 图片输入：`LoadImage` 节点的 `image` 填公网图片 URL；本地文件需先上传拿 URL（npm SDK 有 `uploadFile`）。

### 签名（与 webui 端点完全相同）
- query string：`?AccessKey=xxx&Timestamp=毫秒&SignatureNonce=随机串&Signature=xxx`
- 签名串：`uri + '&' + timestamp + '&' + nonce`，HMAC-SHA1(SecretKey) 后 base64url 编码并去掉尾部 `=`（来源：https://adg.csdn.net/69522d8c5b9f5f31781b2d1d.html 及 Go SDK pkg.go.dev/github.com/godeps/aigo/engine/liblib）。
- 注意：轮询接口要用**自己的 uri** 重新签名，不能复用提交时的签名。

## ④ 费用 / 会员要求

- **API 积分（程序化调用）**：独立计费体系。新用户登录开放平台可领 500 试用积分（限时 7 天）；之后需购买 API 积分。comfyui/app 每次调用的具体积分单价未见公开明细——**待实测验证**（试用积分足够验证）。
- **网页端 VIP（与 API 无关，仅供参考）**：基础版 399 元/年（800 积分/月）、专业版 499 元/年（1800/月）、大师版 1299 元/年（5800/月）、旗舰版 2999 元/年（15800/月）；大师及以上可加购积分。团队版最高 8579 元/年。来源：https://news.qq.com/rain/a/20260414A07MU800 。
- 网页端有每日免费算力额度（社区资料称约每日 300 点，**待实测验证**），高峰期排队、会员加速有限。
- API 侧限速/QPS：官方文档未检索到公开数值——**待实测验证**。

## ⑤ 推荐接入方案（结合现有 ComfyUI 适配器）

**推荐：新建 `liblib` provider，不复用标准 ComfyUI REST 适配器。**

1. **适配层**：新增 LiblibComfyProvider，实现三步：HMAC-SHA1 签名提交 `/api/generate/comfyui/app` → 轮询 `/api/generate/comfy/status`（间隔 3~5s）→ 从 `data.images[].imageUrl` 直接下载（无需 /view）。
2. **工作流配置**：`comfyui_workflow` 字段存上文 §③ 的 Liblib 变体 JSON（含 templateUuid/workflowUuid + 节点参数表）；`{{prompt}}` 占位符继续放在文本节点 `inputs.text` 中，替换逻辑可复用现有实现（astrbot 社区插件已验证此占位符用法可行）。
3. **运营流程**：每个工作流上线前需在 Liblib「发布-工作流 → 编辑 AI 应用 → 运行后发布」，并在应用详情页复制 API 配置 JSON（即 §③ 请求体），录入我们平台。模型须使用 Liblib 站内可商用模型（UUID 引用）。
4. **凭据**：AccessKey/SecretKey 从 liblib.art「API 开放平台」后台获取，按 provider 级配置存储。
5. **不建议**的路径：逆向网页端云端 ComfyUI 的会话接口（脆弱、违反 ToS 风险）；以及等待官方开放标准 ComfyUI REST 直连（无任何公开计划）。
6. 若业务上要求「任意标准工作流 JSON 即刻可跑」，Liblib 目前满足不了，可对比评估 RunningHub（节点生态更全、同样有 API）——超出本次调研范围，仅提示。

## ⑥ 工作流导出与本地模型库（附查）

- **工作流导出**：Liblib 云端 ComfyUI 基于 ComfyUI 前端，「保存工作流」可导出标准 .json（可直接在本地 ComfyUI 加载）；但 `.lbb` 项目文件为私有格式，纯 ComfyUI 不识别。是否保留「导出 (API 格式)」菜单**待实测验证**（理论上 ComfyUI 前端自带该功能）。注意：导出的 API JSON 中模型引用仍是 Liblib UUID/站内路径，导入我们平台前需人工替换。来源：https://m.php.cn/faq/2751041.html 。
- **本地 ComfyUI 用 Liblib 模型库**：官方方案是 **Liblib 桌面客户端（Windows）**——内置整合版 ComfyUI/WebUI，可一键下载站内模型与工作流、统一管理模型目录（来源：https://www.liblib.art/ 右上角客户端下载；教程见 https://ima.qq.com/wiki/?shareId=2c1d7dafec8fa8bd371098df3df4711dec1a936b8c8f84d9597a89acdd6306c1 ）。另存在官方 org 的 ComfyUI 自定义节点 `ComfyUI-liblib`（在本地 ComfyUI 内调 Liblib API 生图，仅文生图，来源：https://github.com/liblib-co-work/ComfyUI-liblib ）。纯网页端则通过模型页「复制下载链接」获取直链手动装进本地 models 目录（社区方法，非官方 API）。
- **没有**「本地 ComfyUI 直接挂载 Liblib 云端模型库按需推理」的官方方案（无类似网络文件系统挂载能力）。

## 参考链接汇总

- API 开放平台入口：https://www.liblib.art/apis （文档需登录后查看）
- ComfyUI 工作流 API 官宣（社区转载）：https://aisharenet.com/liblibai-apizhichian
- Java SDK（含 comfyui/app、comfy/status 完整接口清单）：https://github.com/gravitywp/liblib-java-sdk
- npm liblibai（runComfy 示例）：https://www.npmjs.com/package/liblibai
- 签名与调用 Python 教程：https://adg.csdn.net/69522d8c5b9f5f31781b2d1d.html
- 请求体/占位符实测示例：https://github.com/machinad/astrbot_plugin_liblibapi
- Go SDK（端点与签名佐证）：https://pkg.go.dev/github.com/godeps/aigo/engine/liblib
- 云平台横向对比（Liblib 无原生直连佐证）：https://xiangyugongzuoliu.com/comfyui-cloud-platform-guide/
- 会员定价报道：https://news.qq.com/rain/a/20260414A07MU800
- 工作流导出方法：https://m.php.cn/faq/2751041.html
- ComfyUI-liblib 自定义节点：https://github.com/liblib-co-work/ComfyUI-liblib
