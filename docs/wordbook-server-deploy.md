# 单词本服务端化部署说明

## 目标

本次改造先完成一个最小闭环：

- 网页端不再只依赖本地 `localStorage`
- 我的单词本改为读写服务端 API
- 服务端数据先保存在 Docker 挂载卷中的 JSON 文件
- 先不引入登录和数据库，优先跑通网页到服务器的读写链路

后续如果要升级到 MySQL，可以在保持前端接口不变的前提下替换存储层。

## 当前接口

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/health`
- `GET /api/wordbook?userId=demo-user`
- `POST /api/wordbook`
- `POST /api/wordbook/import`
- `DELETE /api/wordbook/:word?userId=demo-user`

## 当前实现说明

- 服务端入口：[`server.js`](file:///Users/shixiao/Desktop/trae/words-main/server.js)
- 单词本存储逻辑：[`wordbookStore.js`](file:///Users/shixiao/Desktop/trae/words-main/server/wordbookStore.js)
- 前端单词本 API：[`wordbook.ts`](file:///Users/shixiao/Desktop/trae/words-main/src/services/wordbook.ts)
- 前端单词本上下文：[`WordbookContext.tsx`](file:///Users/shixiao/Desktop/trae/words-main/src/context/WordbookContext.tsx)

## 本地开发

### 1. 准备环境变量

复制一份环境变量文件：

```bash
cp .env.example .env.local
```

至少确认以下字段：

```env
DEFAULT_WORDS_USER_ID=demo-user
VITE_WORDS_USER_ID=demo-user
WORDS_DATA_DIR=./data
```

### 2. 启动开发环境

继续使用现有前端开发方式：

```bash
npm install
npm run dev
```

说明：

- 本地 `vite` 开发代理已经支持 `/api/wordbook`
- 本地新增或删除单词会写入 `data/wordbooks.json`
- 如果服务端单词本为空，会自动把旧的本地 `localStorage` 单词导入服务端

## Docker 本地验证

### 1. 构建并启动

```bash
docker compose -f docker-compose.wordbook.yml up -d --build
```

### 2. 检查健康接口

```bash
curl http://localhost:8080/api/health
```

预期返回：

```json
{
  "ok": true,
  "service": "words-api"
}
```

### 3. 验证单词本接口

查询：

```bash
curl "http://localhost:8080/api/wordbook?userId=demo-user"
```

新增：

```bash
curl -X POST "http://localhost:8080/api/wordbook" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user",
    "word": {
      "word": "example",
      "phonetic": "/igˈzɑːmpəl/",
      "meanings": [
        {
          "partOfSpeech": "n.",
          "definitions": [
            {
              "definition": "例子"
            }
          ]
        }
      ]
    }
  }'
```

## 腾讯云轻量服务器部署

以下步骤基于你的服务器已经安装 Docker 和 Docker Compose。

### 1. 上传项目代码

推荐放到：

```text
/srv/words-main
```

### 2. 准备环境变量

在服务器项目目录创建：

```bash
cp .env.example .env.local
```

然后补齐你当前在用的配置，例如：

```env
COZE_TOKEN=...
COZE_WORKFLOW_ID=...
YOUDAO_APP_KEY=...
YOUDAO_APP_SECRET=...
DEFAULT_WORDS_USER_ID=demo-user
VITE_WORDS_USER_ID=demo-user
WORDS_DATA_DIR=/app/data
WORDS_APP_PORT=8080
```

如果你的 Coze `PAT Token` 经常失效，建议改成 OAuth JWT 自动续期，增加这些配置：

```env
COZE_OAUTH_CLIENT_ID=你的OAuth应用ID
COZE_OAUTH_KID=你的公钥指纹
COZE_OAUTH_PRIVATE_KEY=你的PEM私钥内容
COZE_OAUTH_TOKEN_TTL=3600
```

说明：

- 当前项目已支持 Coze OAuth JWT 自动换取 `access_token`
- 会在服务端内存中缓存 token，并在过期前自动重新申请
- 如果同时配置了 OAuth 和旧的 `COZE_TOKEN`，会优先使用 OAuth

### 3. 启动容器

```bash
docker compose -f docker-compose.wordbook.yml up -d --build
```

### 4. 检查运行状态

```bash
docker compose -f docker-compose.wordbook.yml ps
docker compose -f docker-compose.wordbook.yml logs -f
```

### 5. 开放端口

如果你暂时不挂 Nginx，先在腾讯云安全组放行 `8080`。

浏览器访问：

```text
http://你的服务器IP:8080/
```

接口检查：

```text
http://你的服务器IP:8080/api/health
```

## 当前阶段的限制

- 已支持最小账号体系：用户名 + 密码
- 未登录时仍可继续用 `demo-user` 作为兼容用户
- 还没有接 MySQL，服务端数据先保存在 JSON 文件中
- 还没有小程序接入，当前先让网页端完成服务端读写

## 最小登录使用方式

当前前端首页右上角已经提供：

- `登录 / 注册`
- 登录后显示当前用户名
- 退出登录

规则：

- 登录后，单词本按账号隔离
- 未登录时，仍会使用 `demo-user`
- 如果你想验证多用户隔离，可以注册两个不同账号分别测试

## 下一步建议

完成本次部署后，建议按下面顺序继续做：

1. 给单词本接口补上正式用户标识
2. 将 JSON 存储迁移到 MySQL
3. 小程序接入同一套单词本接口
4. 练习记录也迁移到服务端
