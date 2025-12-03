# ParaNote

**ParaNote** 是一个轻量级的**段落评论服务**，同时也是一个**通用网页阅读器**。它可以为任何网页提供沉浸式的阅读体验和段落级的评论互动。

---

## ✨ 核心特性

- **双重模式**：既是独立的**阅读器**，也是可嵌入的**评论插件**。
- **段落级评论**：精确到段落的互动，支持点赞和删除。
- **通用阅读模式**：输入任意 URL (知乎、公众号、博客等)，自动提取正文，生成纯净阅读页面。
- **强力抗反爬**：内置 Puppeteer + Stealth 插件，自动处理 Cloudflare 验证，支持人机协作过验证码。
- **模糊定位 (Fuzzy Anchoring)**：采用内容指纹定位，即使原文段落增删或改版，评论也能自动归位，不再错位。
- **现代 UI 设计**：Hypothesis 风格的卡片式侧边栏，支持多彩头像、Markdown 引用和丝滑动画。
- **移动端适配**：专为手机优化的底部抽屉交互，体验流畅。
- **原样导入优化**：针对 SPA (如知乎) 自动移除干扰脚本并强制展开折叠内容。

---

## 📖 模式一：ParaNote 阅读器 (独立使用)

作为一个独立的 Web 服务运行，为你提供带评论功能的纯净阅读体验。

### 1. 启动服务

**推荐：使用 Docker Compose (一键启动)**

```bash
# 后台启动
docker-compose up -d
```

**配置环境变量 (docker-compose.yml)**

```yaml
environment:
  - STORAGE_TYPE=mongo               # 可选: file (默认) 或 mongo
  - MONGO_URI=mongodb+srv://...      # 如果使用 mongo，必填
  - ENABLE_PUPPETEER=false           # 可选: false 禁用 Puppeteer 以节省内存
```

**或者使用 Docker 命令行**

```bash
docker build -t paranote .
docker run -d -p 4000:4000 -v $(pwd)/data:/app/data paranote
```

**本地开发启动**

```bash
npm install
npm start
# 默认运行在 http://localhost:4000
```

### 2. 使用方式

访问部署好的地址，输入目标文章链接即可：

- **通用阅读模式**: `http://localhost:4000/read?url=https://example.com/article`
    - **特点**：提取正文，去除广告和侧边栏，重新排版，适合长文阅读。
    - **抗反爬**：如果遇到 Cloudflare，服务器会自动启动浏览器尝试绕过。如果需要验证码，服务器端（如果是本地运行且 `PUPPETEER_HEADLESS=false`）会弹出窗口让你点击。

- **原样导入模式**: `http://localhost:4000/import?url=https://example.com/article`
    - **特点**：保留网页原始样式，适合排版复杂的页面 (如 Wikipedia)。
    - **优化**：自动移除原网页的 JS 防止冲突，并强制展开被折叠的内容 (如知乎回答)。

- **Telegra.ph 专线**: `http://localhost:4000/p/<Slug>`
    - **特点**：针对 Telegra.ph 的深度优化。

---

## 🔌 模式二：ParaNote 插件 (嵌入式使用)

如果您是站长，想让您的博客或小说站拥有段落评论功能，只需两步。

### 1. 标记正文

找到包裹文章内容的 HTML 容器，添加 `data-na-root` 以及唯一标识 ID：

```html
<div class="article-content"
  data-na-root
  data-work-id="novel_001"
  data-chapter-id="chapter_001"
>
  <p>正文第一段...</p>
  <p>正文第二段...</p>
</div>
```

### 2. 引入脚本

在页面底部引入 ParaNote 脚本：

```html
<script
  async
  src="https://your-paranote-domain.com/public/embed.js"
  data-site-id="my-site"
  data-api-base="https://your-paranote-domain.com"
></script>
```

### 👤 匿名用户追踪
当未接入用户系统时，ParaNote 会自动根据用户 IP 生成唯一的**访客身份** (例如 `访客-a1b2c3`)。
- **稳定头像**：同一 IP 的用户将拥有固定的头像颜色。
- **点赞支持**：匿名用户现在可以点赞评论 (基于 IP 防止重复点赞)。

### 用户鉴权 (可选)
支持通过 JWT 对接您现有的用户系统。后端生成 JWT 并注入页面：

```html
<script>
  window.PARANOTE_TOKEN = "eyJhbGciOiJIUzI1Ni...";
</script>
```

ParaNote 会自动读取 Token 并识别用户身份 (User ID, Name, Avatar)。

### 📚 站长集成指南 (Advanced)

#### 1. 脚本配置参数

通过 `<script>` 标签的 `data-*` 属性进行配置：

| 属性名 | 必填 | 默认值 | 说明 |
| :--- | :---: | :--- | :--- |
| `src` | 是 | - | 必须指向 `embed.js` 的 URL |
| `data-site-id` | 是 | `default-site` | 站点唯一标识，用于隔离不同网站的数据 |
| `data-api-base` | 是 | 自动推导 | 后端 API 地址。如果脚本和 API 在同一域名下可省略 |

#### 2. JWT 生成示例

Token 是一个标准的 HS256 JWT，Payload 必须包含 `siteId` 和 `sub`。

**Node.js**
```js
const jwt = require('jsonwebtoken');
const token = jwt.sign({
  siteId: 'my-site',
  sub: user.id,
  name: user.username,
  avatar: user.avatarUrl
}, process.env.PARANOTE_SECRET);
```

**Python (Flask/Django)**
```python
import jwt
import time

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
$payload = [
    "siteId" => "my-site",
    "sub" => $user->id,
    "name" => $user->username
];
$token = JWT::encode($payload, $secret_key, 'HS256');
```

#### 3. 样式定制

ParaNote 使用 CSS 变量定义样式。您可以在自己的 CSS 中覆盖这些变量来适配网站主题：

```css
:root {
  /* 侧边栏颜色 */
  --na-bg: #f7f7f7;          /* 背景色 */
  --na-card-bg: #ffffff;     /* 卡片背景 */
  --na-primary: #bd1c2b;     /* 主题色 (按钮、高亮) */
  --na-text: #333333;        /* 文字颜色 */
  
  /* 侧边栏尺寸 */
  --na-sidebar-width: 380px;
}
```

---

## 🛠 技术细节

### 模糊定位 (Fuzzy Anchoring)
为了防止文章修改导致评论错位，ParaNote 在保存评论时会记录段落的“内容指纹” (Context Fingerprint)。加载评论时，如果段落索引不匹配，前端会自动全篇搜索指纹，将评论“纠正”到正确的位置。

### 存储
默认使用文件系统 (`/data` 目录) 存储 JSON 数据。
**支持 MongoDB**：设置 `STORAGE_TYPE=mongo` 和 `MONGO_URI` 环境变量，即可切换到 MongoDB 存储，适合部署在 Render/Zeabur 等平台。

### 性能优化 (低内存模式)
如果您的服务器内存不足 (<1GB)，可以设置 `ENABLE_PUPPETEER=false`。
这将禁用 Chrome 爬虫，仅使用轻量级 Fetch 抓取。
*   ✅ 内存占用低 (<100MB)
*   ❌ 无法抓取 Cloudflare 保护的网站


### API 概览

- `GET /api/v1/comments`: 获取评论
- `POST /api/v1/comments`: 发布评论
- `POST /api/v1/comments/like`: 点赞
- `DELETE /api/v1/comments`: 删除 (需管理员权限)

---

## 🧪 开发与测试

### 运行测试
项目包含完整的 API 单元测试 (基于 Vitest)。

```bash
npm test
```

### 目录结构
- `server.js`: 核心服务 (HTTP, Puppeteer, API)
- `public/embed.js`: 前端挂件源码
- `public/index.html`: 首页入口
- `storage.js`: 存储层抽象

## 📦 数据迁移 (Import / Export)

ParaNote 支持将所有评论数据导出为 JSON 文件，方便迁移或备份。此功能需要管理员权限。

### 1. 设置管理员密钥
在环境变量中添加 `ADMIN_SECRET`：
```bash
ADMIN_SECRET=your_strong_secret_key
```

### 2. 导出数据
```bash
curl -H "x-admin-secret: your_strong_secret_key" http://your-server/api/v1/export -o backup.json
```

### 3. 导入数据
```bash
curl -X POST -H "x-admin-secret: your_strong_secret_key" -H "Content-Type: application/json" -d @backup.json http://your-server/api/v1/import
```

## License
MIT
