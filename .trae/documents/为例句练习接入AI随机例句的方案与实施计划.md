## 目标
- 在“例句练习”中为指定单词动态生成随机、可控质量的英文例句（附中文释义），用于打字练习。
- 保障安全、隐私与成本控制，提供可回退的本地/词典例句方案。

## 技术选型
- **LLM服务提供者**（任选其一或多提供者容灾）：
  - OpenAI / Azure OpenAI / Anthropic / Google Gemini
  - 也可采用开源模型（如 llama.cpp + Web API 网关），需自托管成本与运维
- **后端代理**：使用轻量后端隐藏密钥并做风控与缓存（推荐）
  - 方案：Vercel/Netlify/Cloudflare Workers/Node Express 任意其一

## 接入方式
1. **Prompt设计**（保证句子包含目标词与难度可控）
   - 系统指令：产出 1-3 条自然英文例句，必须包含目标英文单词本身，长度适中（10-20词），不含敏感/不当内容
   - 用户指令示例："Generate 3 English sentences using the word 'travel'. Return JSON with fields: sentence, zh, level"
   - 可选难度：A1/A2/B1/B2，控制词汇与结构复杂度
2. **响应格式**：统一返回 JSON 数组 [{sentence, zh, level}]，便于解析
3. **校验器**（前/后端）
   - 检查是否包含目标单词（区分词形变化可选）
   - 长度与字符合法性（仅英文字母与常见标点）
   - 敏感内容过滤（黑名单/LLM自检）
   - 失败则降级到词典例句或本地示例

## 架构与模块
- **后端**（api/aiExamples）
  - POST /examples { word, count=3, level? }
  - 中间件：速率限制、鉴权（可选）、缓存（KV/内存/Redis）
  - 逻辑：Prompt→LLM→解析→校验→缓存（TTL）→返回
- **前端服务层**（src/services/aiExamples.ts）
  - fetchAiExamples(word, opts) → [{sentence, zh, level}]
  - 具备重试与降级（词典/本地）
- **练习层集成**（TypingPractice）
  - 新增“AI例句”模式选项：
    - 点击“获取随机例句”→调用前端服务→渲染为单词输入单元
    - 维持现有逐字母实时校验、禁止错误继续输入、空格/Enter跳转规则
  - 缓存与去重：localStorage 按单词维护最近N条例句，避免重复

## 安全与合规
- 不在前端存储密钥；所有 LLM 调用走后端代理
- 敏感内容过滤与回退，避免生成不当句子
- 限流与成本控制：
  - 单词/用户/时间窗维度限流（如 3 次/分钟）
  - 先读缓存后再请求；批量预生成常用词例句

## 成本与性能
- 单次例句生成延迟 ~300ms-2s；建议加载态与重试提示
- 使用缓存（TTL 24h）与预热热门词
- 前端降级路径：优先用缓存→AI→词典例句→本地示例

## 失败与回退策略
- LLM失败/超时：显示“使用词典例句”，并带重新获取按钮
- 返回例句不包含目标词：直接弃用该条并重试或降级

## 可选增强
- 支持词形变化（travel/traveled/travelling），校验时可放宽到词根匹配
- 难度分级与主题过滤（旅游/校园/商务）
- 语音合成：整句 TTS（现已支持浏览器 speechSynthesis）
- 质量自检：二次LLM对返回例句进行“是否自然/是否包含词”的校验

## 实施步骤
1. 创建后端代理（/api/aiExamples），完成密钥管理、限流与缓存
2. 编写前端服务模块（aiExamples.ts），实现调用、解析、重试与降级
3. TypingPractice集成“AI例句”模式开关与“获取随机例句”按钮
4. 将例句渲染为单词输入单元，沿用逐字母校验与跳转规则
5. 增加缓存与去重逻辑（localStorage），以及失败回退到词典/本地
6. 添加设置面板：选择例句数量与难度
7. 加入埋点：调用成功/失败、用户时长与正确率，用于后续优化

## 交付物
- 后端：/api/aiExamples（可运行于 Vercel/Netlify/Workers）
- 前端：src/services/aiExamples.ts、TypingPractice 的新模式与UI入口
- 安全与风控：限流、缓存、敏感过滤、降级策略

请确认以上方案与实施步骤，我即可开始落地实现。