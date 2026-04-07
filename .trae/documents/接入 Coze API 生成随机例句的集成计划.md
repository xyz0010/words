## 目标
- 为“打字练习”的例句模式接入 Coze API（@coze/api），按单词实时生成随机英文例句并返回中文释义或保留英文。
- 保证安全与成本可控：密钥不暴露在前端，提供缓存与降级。

## 安全与架构
- 前端不直接持有 `token`；由后端代理统一调用 Coze API。
- 设计一个轻量后端路由：`POST /api/ai/examples`，参数 `{ word: string, count?: number }`。
- 后端使用环境变量 `COZE_TOKEN`, `COZE_BASE_URL`, `COZE_WORKFLOW_ID`，避免硬编码。

## 后端实现
- 运行环境：Node 18+（与官方 SDK 要求一致）。
- 依赖：`@coze/api`。
- 路由逻辑：
  1. 校验入参 `word`，做速率限制与黑名单过滤（可选）。
  2. 调用 `CozeAPI.workflows.runs.stream({ workflow_id, parameters: { input: word } })`。
  3. 聚合流式返回：将事件中的 `content` 片段按顺序拼接为完整字符串。
  4. 解析返回：
     - 第一层：`JSON.parse(content)` 得到对象，如 `{ output: "..." }`。
     - 第二层：`JSON.parse(obj.output)` 得到 `{ sentences: string[] }`。
  5. 标准化响应：返回 `{ sentences: string[], source: 'coze', cached: boolean }`。
  6. 缓存：按 `word` 缓存最近一次结果（KV/内存/文件/Redis，或简易内存 + TTL 24h）。
  7. 降级：若失败，返回词典例句或本地示例。

## 前端服务层
- 创建 `src/services/aiExamples.ts`：
  - `fetchAiExamples(word: string, opts?: { count?: number })`
  - 调用后端 `/api/ai/examples`，解析响应。
  - 失败重试与降级；将结果写入 `localStorage`（避免重复请求）。

## 练习页面集成
- 在 `TypingPractice` 增加“AI例句”入口按钮：
  - 点击后请求 `fetchAiExamples(word)`，将返回的第一条或多条例句渲染为当前练习句子。
  - 保持现有拆分为单词单元、逐字母校验、错误禁止继续输入、空格/Enter 仅在正确时跳转等规则。
- UI：显示加载态与重试按钮；若无结果则自动回退到词典/本地例句。

## 配置与部署
- `.env`（或云端环境变量）：
  - `COZE_TOKEN=...`
  - `COZE_BASE_URL=https://api.coze.cn`
  - `COZE_WORKFLOW_ID=7573516923795980294`（示例）
- 本地与云端（Vercel/Netlify/Cloudflare Workers/自建 Node）均可。

## 解析示例（基于你提供的返回格式）
- 原始事件字段：`content : "{\"output\":\"{\\\"sentences\\\":[\\\"Every student in the class must take the exam.\\\", ... ]\"}""`
- 解析步骤：
  - `const outer = JSON.parse(content);`
  - `const inner = JSON.parse(outer.output);`
  - `const sentences = inner.sentences;`

## 风控与成本控制
- 每词限流：如每分钟最多 3 次。
- 先读缓存后请求，热门词预生成。
- 过滤不当内容：
  - PROMPT 要求必须包含目标词，长度与难度范围。
  - 返回后做包含校验，不符合则重试或降级。

## 实施步骤
1. 在后端创建 `/api/ai/examples` 路由，完成 Coze SDK 调用与解析。
2. 增加缓存（内存/KV/Redis）与错误降级逻辑。
3. 编写前端服务 `fetchAiExamples` 并接入至 `TypingPractice` 的“AI例句”按钮。
4. 加载态/错误提示与重试；本地持久化最近结果。
5. 验证严格校验与跳转规则在 AI 例句下也正确工作。

## 交付物
- 后端代理代码（隐藏密钥）
- 前端服务模块与练习页集成入口
- 文档：环境变量与部署说明

确认后，我将开始实现后端路由与前端接入，并把解析与缓存全部打通。