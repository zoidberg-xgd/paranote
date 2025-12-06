# ParaNote

轻量级段落评论服务 + 通用网页阅读器。为任何网页提供沉浸式阅读体验和段落级评论互动。

[![npm version](https://img.shields.io/npm/v/paranote.svg)](https://www.npmjs.com/package/paranote)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/zoidberg-xgd/paranote?style=social)](https://github.com/zoidberg-xgd/paranote)

🔴 **[在线演示](https://zoidbergxgd.pythonanywhere.com/ngVZlqHl/)** (集成在 TapNote 中) | 📦 **[npm](https://www.npmjs.com/package/paranote)** | 💻 **[GitHub](https://github.com/zoidberg-xgd/paranote)**

## 目录

- [核心特性](#-核心特性)
- [快速开始](#-快速开始)
- [CLI 命令行工具](#-cli-命令行工具)
- [使用模式](#-使用模式)
- [站长集成指南](#-站长集成指南)
- [部署](#-部署)
- [API 参考](#-api-参考)
- [开发](#-开发)

---

## ✨ 核心特性

- **双重模式** - 既是独立的阅读器，也是可嵌入的评论插件
- **段落级评论** - 精确到段落的互动，支持回复、点赞和删除
- **通用阅读模式** - 输入任意 URL，自动提取正文，生成纯净阅读页面
- **强力抗反爬** - 内置 Puppeteer + Stealth + BrowserForge，自动处理 Cloudflare 验证
- **模糊定位** - 采用内容指纹定位，即使原文段落增删，评论也能自动归位
- **现代 UI** - Hypothesis 风格的卡片式侧边栏，支持多彩头像和丝滑动画
- **移动端适配** - 专为手机优化的底部抽屉交互
- **匿名支持** - 自动生成访客身份，IP 防重复点赞
- **用户拉黑** - 管理员可拉黑恶意用户
- **CLI 管理** - 完整的命令行工具，无需 Web 界面即可管理

---

## 📦 快速开始

### 方式一：npm 全局安装 (推荐)

```bash
npm install -g paranote

# 初始化配置
paranote init

# 启动服务
paranote start

# 查看帮助
paranote help
```

### 方式二：npx 直接运行

```bash
npx paranote start --port 4000
```

### 方式三：Docker

```bash
docker run -d -p 4000:4000 -v $(pwd)/data:/app/data paranote
```

### 方式四：作为项目依赖

```bash
npm install paranote
```

```javascript
import { startServer } from 'paranote';

// 启动服务器
await startServer({ port: 4000 });

// 或者更细粒度的控制
import { initStorage, server, config } from 'paranote';

await initStorage();
server.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
```

---

## 🖥 CLI 命令行工具

ParaNote 提供完整的命令行工具，让你无需 Web 管理后台即可管理评论和用户。

### 服务器命令

```bash
# 启动服务器
paranote start [options]
  --port, -p    指定端口 (默认: 4000)
  --host        指定主机 (默认: 0.0.0.0)
  --mode, -m    部署模式: full | api | reader

# 初始化配置文件
paranote init

# 构建嵌入脚本
paranote build

# 查看版本
paranote version
```

### 数据管理

```bash
# 查看统计信息
paranote stats

# 列出评论
paranote list [options]
  --site        按站点过滤
  --work        按作品过滤
  --chapter     按章节过滤
  --limit, -n   限制数量
  --json        JSON 格式输出

# 搜索评论
paranote search <keyword> [options]
  --site        按站点过滤
  --limit, -n   限制数量
  --json        JSON 格式输出

# 删除评论
paranote delete <comment-id> [options]
  --yes, -y     跳过确认

# 导出数据
paranote export [options]
  --output, -o  输出文件路径
  --storage, -s 存储类型: file | mongo

# 导入数据
paranote import <file> [options]
  --storage, -s 存储类型: file | mongo
```

### 用户管理

```bash
# 拉黑用户
paranote ban <user-id> --site <site-id> [options]
  --reason      拉黑原因
  --yes, -y     跳过确认

# 解除拉黑
paranote unban <user-id> --site <site-id>

# 查看黑名单
paranote banlist [options]
  --site        按站点过滤
  --json        JSON 格式输出
```

### 使用示例

```bash
# 查看最新 10 条评论
paranote list --limit 10

# 搜索包含"垃圾"的评论
paranote search "垃圾" --site my-site

# 删除评论 (会显示详情并要求确认)
paranote delete abc123

# 静默删除 (用于脚本)
paranote delete abc123 -y

# 拉黑用户
paranote ban ip_abc123 --site my-site --reason "发布垃圾评论" -y

# 导出备份
paranote export -o backup.json

# 从 MongoDB 导出
paranote export -s mongo -o mongo-backup.json

# 以 JSON 格式输出 (便于管道处理)
paranote list --json | jq '.[] | .id'
```

---

## 📖 使用模式

### 模式一：ParaNote 阅读器 (独立使用)

作为独立 Web 服务运行，提供带评论功能的纯净阅读体验。

| 功能 | URL | 说明 |
|------|-----|------|
| 纯净阅读 | `/read?url=<URL>` | 提取正文，去除广告和侧边栏 |
| 原样导入 | `/import?url=<URL>` | 保留原始样式 |
| Telegra.ph | `/p/<slug>` | 针对 Telegra.ph 优化 |
| 管理后台 | `/admin.html` | 评论管理、黑名单、数据导入导出 |

**油猴脚本**：访问 `http://localhost:4000/paranote.user.js` 安装，在任意网页按 `Alt+P` 启用评论。

### 模式二：ParaNote 插件 (嵌入式使用)

为博客或小说站添加段落评论功能。

**1. 标记正文**

```html
<article data-na-root data-work-id="novel_001" data-chapter-id="chapter_001">
  <p>正文第一段...</p>
  <p>正文第二段...</p>
</article>
```

**2. 引入脚本**

```html
<script async src="https://your-server/embed.js" 
        data-site-id="my-site" 
        data-api-base="https://your-server"></script>
```

---

## 📚 站长集成指南

### 脚本配置参数

| 属性名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `src` | 是 | - | 指向 embed.js 的 URL |
| `data-site-id` | 是 | default-site | 站点唯一标识 |
| `data-api-base` | 否 | 自动推导 | 后端 API 地址 |

### JWT 用户认证

Token 是标准 HS256 JWT，Payload 必须包含 `siteId` 和 `sub`。

**Node.js**
```javascript
const jwt = require('jsonwebtoken');
const token = jwt.sign({
  siteId: 'my-site',
  sub: user.id,
  name: user.username,
  avatar: user.avatarUrl,
  role: 'admin'  // 可选，管理员可删除任意评论
}, process.env.PARANOTE_SECRET);
```

**Python**
```python
import jwt, time
token = jwt.encode({
    "siteId": "my-site",
    "sub": str(user.id),
    "name": user.username,
    "exp": int(time.time()) + 3600
}, "YOUR_SECRET", algorithm="HS256")
```

**前端注入**
```html
<script>window.PARANOTE_TOKEN = "eyJhbGciOiJIUzI1Ni...";</script>
```

**服务端配置**
```bash
SITE_SECRETS='{"my-site":"YOUR_SECRET"}'
```

### 匿名用户

未接入用户系统时，ParaNote 自动根据 IP 生成唯一访客身份：

- **稳定身份**：`访客-a1b2c3` (基于 IP hash)
- **稳定头像**：同一 IP 用户拥有固定头像颜色
- **点赞支持**：匿名用户可点赞 (基于 IP 防重复)

### 样式定制

```css
:root {
  --na-bg: #f7f7f7;          /* 背景色 */
  --na-card-bg: #ffffff;     /* 卡片背景 */
  --na-primary: #bd1c2b;     /* 主题色 */
  --na-text: #333333;        /* 文字颜色 */
  --na-sidebar-width: 380px; /* 侧边栏宽度 */
}
```

---

## 🚀 部署

### 环境变量

```bash
# 初始化配置
paranote init

# 或手动创建
cp .env.example .env
nano .env
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 4000 | 服务端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `DEPLOY_MODE` | full | `full` / `api` / `reader` |
| `STORAGE_TYPE` | file | `file` / `mongo` |
| `MONGO_URI` | - | MongoDB 连接串 |
| `ADMIN_SECRET` | - | 管理员密钥 |
| `SITE_SECRETS` | {} | JWT 密钥 (JSON 格式) |
| `ENABLE_PUPPETEER` | true | 启用 Puppeteer 抓取 |
| `PUPPETEER_HEADLESS` | true | 无头模式 |
| `RATE_LIMIT` | true | 启用速率限制 |
| `RATE_LIMIT_MAX` | 100 | 每分钟最大请求数 |

### 部署模式

| 模式 | 说明 | 内存占用 |
|------|------|----------|
| `full` | 首页 + 阅读器 + 所有 API | ~500MB |
| `api` | 仅核心 API，无抓取 | <100MB |
| `reader` | API + 阅读器，无首页 | ~500MB |

### Docker Compose (推荐)

```yaml
version: '3.8'
services:
  paranote:
    build: .
    ports:
      - "4000:4000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - ADMIN_SECRET=${ADMIN_SECRET}
    restart: always
```

```bash
docker-compose up -d
```

### Docker 命令行

```bash
# 完整部署
docker run -d -p 4000:4000 -v $(pwd)/data:/app/data paranote

# 低内存模式
docker run -d -p 4000:4000 -e DEPLOY_MODE=api -e ENABLE_PUPPETEER=false paranote
```

### 更新部署

```bash
git pull
docker-compose up -d --build
```

> 💡 数据存储在 `/app/data` 卷中，重建容器不会丢失评论数据。

---

## 📡 API 参考

### 评论 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/comments` | 获取评论 |
| POST | `/api/v1/comments` | 发布评论 |
| POST | `/api/v1/comments/like` | 点赞 |
| DELETE | `/api/v1/comments` | 删除评论 |

### 用户管理 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/ban` | 获取黑名单 |
| POST | `/api/v1/ban` | 拉黑用户 |
| DELETE | `/api/v1/ban` | 解除拉黑 |

### 数据管理 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/export` | 导出数据 (需 `x-admin-secret`) |
| POST | `/api/v1/import` | 导入数据 (需 `x-admin-secret`) |
| GET | `/api/v1/fetch` | 抓取网页 |

### 数据迁移示例

```bash
# 使用 CLI (推荐)
paranote export -o backup.json
paranote import backup.json

# 使用 API
curl -H "x-admin-secret: $ADMIN_SECRET" http://localhost:4000/api/v1/export -o backup.json
curl -X POST -H "x-admin-secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
     -d @backup.json http://localhost:4000/api/v1/import
```

---

## 🧪 开发

```bash
npm install           # 安装依赖
npm start             # 启动开发服务器
npm test              # 运行测试
npm run test:watch    # 监听模式
npm run test:coverage # 覆盖率报告
npm run lint          # 代码检查
npm run build:embed   # 构建压缩版 embed.js
```

### 目录结构

```
├── index.js           # npm 包入口
├── server.js          # 主服务入口
├── config.js          # 配置管理
├── storage.js         # 存储层抽象
├── storage-file.js    # 文件存储实现
├── storage-mongo.js   # MongoDB 存储实现
├── fetcher.js         # 网页抓取
├── browser-forge.js   # 浏览器指纹生成
├── utils.js           # 工具函数
├── bin/
│   └── paranote.js    # CLI 入口
├── routes/
│   ├── api.js         # API 路由
│   └── static.js      # 静态文件路由
├── public/
│   ├── embed.js       # 前端评论组件
│   ├── loader.js      # 自动加载器
│   ├── paranote.user.js # 油猴脚本
│   ├── index.html     # 首页
│   ├── reader.html    # 阅读器页面
│   └── admin.html     # 管理后台
└── tests/             # 测试文件 (240+ 测试用例)
```

### 技术细节

**模糊定位 (Fuzzy Anchoring)**：保存评论时记录段落「内容指纹」(前 32 字符)。加载时如果段落索引不匹配，前端自动全篇搜索指纹，将评论纠正到正确位置。

**低内存模式**：设置 `ENABLE_PUPPETEER=false` 禁用 Chrome，内存占用 <100MB，但无法抓取 Cloudflare 保护的网站。

---

## 致谢

- **[Hypothesis](https://github.com/hypothesis/h)** - 开源网页注释系统，UI 设计灵感来源
- **[BrowserForge](https://github.com/daijro/browserforge)** - 智能浏览器指纹生成库

## License

MIT
