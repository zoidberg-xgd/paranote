# ParaNote

轻量级段落评论服务 + 通用网页阅读器。为任何网页提供沉浸式阅读体验和段落级评论互动。

🔴 **[在线演示](https://zoidbergxgd.pythonanywhere.com/ngVZlqHl/)** (集成在 TapNote 中)

## ✨ 核心特性

- **双重模式** - 既是独立的阅读器，也是可嵌入的评论插件
- **段落级评论** - 精确到段落的互动，支持回复、点赞和删除
- **通用阅读模式** - 输入任意 URL (知乎、公众号、博客等)，自动提取正文，生成纯净阅读页面
- **强力抗反爬** - 内置 Puppeteer + Stealth + BrowserForge，自动处理 Cloudflare 验证，支持人机协作过验证码
- **模糊定位** - 采用内容指纹定位，即使原文段落增删或改版，评论也能自动归位
- **现代 UI** - Hypothesis 风格的卡片式侧边栏，支持多彩头像、Markdown 引用和丝滑动画
- **移动端适配** - 专为手机优化的底部抽屉交互，体验流畅
- **原样导入优化** - 针对 SPA (如知乎) 自动移除干扰脚本并强制展开折叠内容
- **匿名支持** - 自动生成访客身份 (访客-a1b2c3)，IP 防重复点赞
- **油猴脚本** - 一键在任意网站启用评论

## 📖 模式一：ParaNote 阅读器 (独立使用)

作为一个独立的 Web 服务运行，为你提供带评论功能的纯净阅读体验。

### 1. 启动服务

**Docker Compose (推荐)**
```bash
docker-compose up -d
```

**Docker 命令行**
```bash
docker build -t paranote .
docker run -d -p 4000:4000 -v $(pwd)/data:/app/data paranote
```

**本地开发**
```bash
npm install
npm start
# http://localhost:4000
```

### 2. 使用方式

| 模式 | URL | 说明 |
|------|-----|------|
| 纯净阅读 | `/read?url=<URL>` | 提取正文，去除广告和侧边栏，适合长文阅读 |
| 原样导入 | `/import?url=<URL>` | 保留原始样式，适合排版复杂的页面 (如 Wikipedia) |
| Telegra.ph | `/p/<slug>` | 针对 Telegra.ph 的深度优化 |

**抗反爬说明**：遇到 Cloudflare 时，服务器会自动启动浏览器尝试绕过。本地运行且 `PUPPETEER_HEADLESS=false` 时会弹出窗口让你点击验证码。

### 3. 油猴脚本

在任意网站启用 ParaNote 评论功能：

1. 访问 `http://localhost:4000/paranote.user.js` 安装
2. 在任意网页按 `Alt+P` 启用/禁用评论

## 🔌 模式二：ParaNote 插件 (嵌入式使用)

为您的博客或小说站添加段落评论功能。

### 1. 标记正文

```html
<article data-na-root data-work-id="novel_001" data-chapter-id="chapter_001">
  <p>正文第一段...</p>
  <p>正文第二段...</p>
</article>
```

### 2. 引入脚本

```html
<script async src="https://your-server/embed.js" data-site-id="my-site" data-api-base="https://your-server"></script>
```

## 👤 匿名用户追踪

未接入用户系统时，ParaNote 自动根据 IP 生成唯一访客身份：

- **稳定身份**：`访客-a1b2c3` (基于 IP hash)
- **稳定头像**：同一 IP 用户拥有固定头像颜色
- **点赞支持**：匿名用户可点赞 (基于 IP 防重复)

## 📚 站长集成指南

### 脚本配置参数

| 属性名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `src` | 是 | - | 指向 embed.js 的 URL |
| `data-site-id` | 是 | default-site | 站点唯一标识，隔离不同网站数据 |
| `data-api-base` | 否 | 自动推导 | 后端 API 地址，同域名可省略 |

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

**PHP**
```php
use Firebase\JWT\JWT;
$token = JWT::encode([
    "siteId" => "my-site",
    "sub" => $user->id,
    "name" => $user->username
], $secret_key, 'HS256');
```

**前端注入**
```html
<script>window.PARANOTE_TOKEN = "eyJhbGciOiJIUzI1Ni...";</script>
```

**服务端配置**
```bash
SITE_SECRETS='{"my-site":"YOUR_SECRET"}'
```

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

## 🚀 部署

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 4000 | 服务端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `DEPLOY_MODE` | full | `full` / `api` / `reader` |
| `STORAGE_TYPE` | file | `file` / `mongo` |
| `MONGO_URI` | - | MongoDB 连接串 |
| `ADMIN_SECRET` | - | 管理员密钥 (导入导出) |
| `SITE_SECRETS` | {} | JWT 密钥 (JSON 格式) |
| `ENABLE_PUPPETEER` | true | 启用 Puppeteer 抓取 |
| `PUPPETEER_HEADLESS` | true | 无头模式 |
| `PUPPETEER_TIMEOUT` | 60000 | 超时时间 (ms) |
| `RATE_LIMIT` | true | 启用速率限制 |
| `RATE_LIMIT_MAX` | 100 | 每分钟最大请求数 |

### 部署模式

| 模式 | 说明 |
|------|------|
| `full` | 完整部署：首页 + 阅读器 + 所有 API |
| `api` | 仅核心 API：评论 CRUD，无抓取功能 |
| `reader` | API + 阅读器：含抓取，无首页 |

### Docker

**使用 Docker Compose (推荐)**
```bash
docker-compose up -d
```

`docker-compose.yml` 配置示例：
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
      - PUPPETEER_HEADLESS=true
      # - ENABLE_PUPPETEER=false      # 禁用以节省内存
      # - STORAGE_TYPE=mongo
      # - MONGO_URI=mongodb+srv://...
      # - SITE_SECRETS={"my-site":"secret"}
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G
```

**使用 Docker 命令行**
```bash
# 构建镜像
docker build -t paranote .

# 完整部署
docker run -d -p 4000:4000 -v $(pwd)/data:/app/data paranote

# 仅 API 模式 (低内存 <100MB)
docker run -d -p 4000:4000 -e DEPLOY_MODE=api -e ENABLE_PUPPETEER=false paranote
```

## 🛠 技术细节

### 模糊定位 (Fuzzy Anchoring)

保存评论时记录段落「内容指纹」(前 32 字符)。加载时如果段落索引不匹配，前端自动全篇搜索指纹，将评论纠正到正确位置。

### 存储

- **文件存储** (默认)：`/data` 目录，JSON 格式
- **MongoDB**：设置 `STORAGE_TYPE=mongo` + `MONGO_URI`，适合 Render/Zeabur 等平台

### 低内存模式

设置 `ENABLE_PUPPETEER=false` 禁用 Chrome：
- ✅ 内存占用 <100MB
- ❌ 无法抓取 Cloudflare 保护的网站

### API 概览

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/comments` | 获取评论 |
| POST | `/api/v1/comments` | 发布评论 (支持 `parentId` 回复) |
| POST | `/api/v1/comments/like` | 点赞 |
| DELETE | `/api/v1/comments` | 删除 (需权限) |
| GET | `/api/v1/fetch` | 抓取网页 (`mode=reader/raw`) |
| GET | `/api/v1/export` | 导出数据 (需 `x-admin-secret`) |
| POST | `/api/v1/import` | 导入数据 (需 `x-admin-secret`) |

### 数据迁移

```bash
# 设置管理员密钥
export ADMIN_SECRET=your_strong_secret_key

# 导出
curl -H "x-admin-secret: $ADMIN_SECRET" http://localhost:4000/api/v1/export -o backup.json

# 导入
curl -X POST -H "x-admin-secret: $ADMIN_SECRET" -H "Content-Type: application/json" -d @backup.json http://localhost:4000/api/v1/import
```

## 🧪 开发

```bash
npm test              # 运行测试
npm run test:watch    # 监听模式
npm run test:coverage # 覆盖率报告
npm run lint          # 代码检查
npm run build:embed   # 构建压缩版 embed.js
```

### 目录结构

```
├── server-new.js      # 主服务入口
├── config.js          # 配置管理
├── routes/api.js      # API 路由
├── storage.js         # 存储层抽象
├── storage-file.js    # 文件存储实现
├── storage-mongo.js   # MongoDB 存储实现
├── fetcher.js         # 网页抓取 (Readability + Puppeteer)
├── browser-forge.js   # BrowserForge 指纹生成
├── utils.js           # 工具函数
├── public/
│   ├── embed.js       # 前端评论组件
│   ├── loader.js      # 自动加载器
│   ├── paranote.user.js # 油猴脚本
│   ├── index.html     # 首页
│   └── reader.html    # 阅读器页面
└── tests/             # 测试文件
```

## 致谢

本项目受到以下开源项目的启发和影响：

- **[Hypothesis](https://github.com/hypothesis/h)** - 开源网页注释系统，ParaNote 的 UI 设计和段落级评论理念受其启发
- **[BrowserForge](https://github.com/daijro/browserforge)** - 智能浏览器指纹生成库，用于绕过反爬检测

## License

MIT
