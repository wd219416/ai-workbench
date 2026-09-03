# 引擎连通性与实战测试报告

> 生成时间：2026-09-03 12:40  
> 测试环境：ai-workbench @ http://localhost:3100  
> 网络状态：TUN 模式已生效（diag-network.cjs 全绿）

## 一、连通性探测（/api/settings/test）

| 引擎 | 分组 | 结果 | 说明 |
|------|------|------|------|
| DeepSeek | deepseek | ✅ 连通 | HTTP 200，models 接口正常 |
| 阿里百炼 Qwen-VL | qwen | ✅ 连通 | HTTP 200 |
| 通义万相 | wanxiang | ✅ 连通 | 复用百炼 KEY，models 正常 |
| 即梦 Seedream | jimeng | ✅ 连通 | 方舟 API /models 正常 |
| LOVART | lovart | ✅ 连通 | 双 KEY HMAC 签名鉴权通过 |
| 可灵 | kling | ✅ 连通 | HTTP 200（但余额不足，见下文） |
| Vidu Q3 | vidu | ✅ 连通 | Token 有效（HTTP 400 为接口正常响应） |
| ComfyUI | comfyui | ⚪ 未运行 | 本地 127.0.0.1:8188 未启动，属预留项 |

**结论**：除 ComfyUI 预留未启动外，其余 7 个引擎 API 层全部可连通。

> ⚠️ 重要区分：**连通 ≠ 可用**。可灵虽然 API 能 ping 通，但实际提交会返回 429「Account balance not enough」。

## 二、LLM 真实调用

### 2.1 DeepSeek 提示词生成

- 接口：`POST /api/prompt/generate`
- 输入：木盆电商场景图需求
- 结果：✅ 成功返回结构化 JSON（cn/en/negative），`source: "deepseek"`
- 耗时：约 2~4 秒
- 示例输出要点：
  - 中文提示词完整包含主体、场景、光线、构图、尺寸
  - 英文提示词可直接用于 LOVART/可灵/万相/即梦
  - 负面提示词覆盖模糊、水印、文字、低质量等

### 2.2 Qwen-VL 反推提示词

- 接口：`POST /api/prompt/reverse`
- 输入：本地已生成 LOVART 图片（assets #6）
- 结果：✅ 成功返回 JSON（cn/en），`source: "qwen-vl"`
- 耗时：约 3~5 秒
- 反推质量：准确识别主体（白发老者、松树盆景、中式庭院、木制方盆）、光线（柔和自然光）、风格（写实高清）

## 三、出图引擎端到端实战

### 3.1 LOVART 真实出图

- 接口：`POST /api/image/generate`
- 引擎：lovart
- 参数：800×800，n=1，中式庭院老人浇花场景
- 提交结果：✅ `submitted`，`engineTaskId: 2d4e3651-7fe0-4c82-a446-ff77604d72a2`
- 最终状态：✅ `done`
- 生成文件：`/api/file/1788410279635_x7z92j.png`
- 总耗时：约 3 分钟
- 兜底验证：前端未持续轮询，任务由后端 scheduler.sweepTasks() 自动收口落库，证明 P1-1 修复有效

## 四、已知限制与下一步

| 项目 | 状态 | 说明 |
|------|------|------|
| 可灵 | ⚠️ 余额不足 | 连通测试 200，但实际提交 429，需充值 |
| 万相 | ⚠️ 待真实出图验证 | 连通正常，但实际生成偶发内容审核问题（历史任务 #8） |
| 即梦 | ⚠️ 接入方式待确认 | 当前走「跳转官网」预留路径，真实 API 调用需确认 AI 动力 KEY 权限 |
| Vidu | ⚠️ 待真实出视频验证 | 连通正常，未实测视频生成 |
| ComfyUI | ⚠️ 未部署 | 本地 8188 未启动，需本地或云端部署后填 workflow |

## 五、测试命令备忘

```bash
# 网络自检
node diag-network.cjs

# 数据库自检
node diag-db.cjs

# API 冒烟测试
node diag-api.cjs

# 登录后手动测单个引擎连通
curl -c wb_cookies.txt -X POST http://localhost:3100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

curl -b wb_cookies.txt -X POST http://localhost:3100/api/settings/test \
  -H "Content-Type: application/json" \
  -d '{"group":"lovart"}'
```
