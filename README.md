# SBTI 人格测试

镜像自 [sbti.unun.dev](https://sbti.unun.dev)，原作者：[B站@蛆肉儿串儿](https://www.bilibili.com/video/BV1LpDHByET6/)

## 在线体验
[SBTI-test/model-test](https://caixu.me/SBTI-test/model-test.html)

直接打开 `index.html` 或用任意 HTTP 服务器：

```bash
python3 -m http.server 8080
```

## CLI 模型测试工具

`cli/` 目录提供了一套 Node.js 命令行工具，可以让 LLM 自动答题并计算人格结果。

### 用法

```bash
# stub 模式（随机答题，验证流程）
node cli/run_sbti_model.js

# 调用 OpenAI 兼容 API
SBTI_API_KEY=sk-xxx SBTI_BASE_URL=https://api.xxx.com/v1 SBTI_MODEL=gpt-4o-mini \
  node cli/run_sbti_model.js --adapter=openai
```

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `SBTI_API_KEY` | API 密钥 | - |
| `SBTI_BASE_URL` | API 地址 | `https://api.openai.com/v1` |
| `SBTI_MODEL` | 模型名 | `gpt-4o-mini` |
| `SBTI_TEMPERATURE` | 温度 | `0.3` |
| `SBTI_SYSTEM_PROMPT` | 额外系统提示词 | - |
| `SBTI_MAX_RETRIES` | 最大重试次数 | `3` |
| `SBTI_SEED` | 随机种子（题目顺序） | `42` |

### 测试结果

12 个模型的完整测试报告见 [cli/report.md](cli/report.md)。

| 系列 | 模型 | 人格类型 | 匹配度 |
|---|---|---|---|
| Claude | claude-sonnet-4-6 | Dior-s（屌丝） | 83% |
| Claude | claude-opus-4-6 | GOGO（行者） | 80% |
| Claude | claude-haiku-4-5 | WOC!（握草人） | 80% |
| GPT | gpt-5.1 | CTRL（拿捏者） | 83% |
| GPT | gpt-5.2 | CTRL（拿捏者） | 80% |
| GPT | gpt-5.4 | GOGO（行者） | 80% |
| GPT | gpt-5-mini | CTRL（拿捏者） | 73% |
| GPT | gpt-oss-120b | ATM-er（送钱者） | 70% |
| DeepSeek | deepseek-r1:671b | CTRL（拿捏者） | 87% |
| DeepSeek | deepseek-r1:671b-64k | WOC!（握草人） | 80% |
| DeepSeek | deepseek-r1:671b-0528 | CTRL（拿捏者） | 77% |
| DeepSeek | deepseek-r1:32b | WOC!（握草人） | 77% |
