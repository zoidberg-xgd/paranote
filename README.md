# ParaNote

Lightweight **paragraph comments** service and embed widget for novel and article sites.

任何小说 / 长文站点，只需要插一段 `<script>`，就可以在每一段文字旁边显示评论按钮，并在右侧弹出评论面板。

---

## 特性

- **段落级评论**：按 `siteId + workId + chapterId + paraIndex` 精确定位到具体段落
- **热度排序**：评论自动按点赞数排序，支持点赞功能
- **权限管理**：支持 JWT 鉴权，管理员可删除评论，点赞需登录且防止刷赞
- **前后端解耦**：后端提供简单 HTTP API，前端通过 `embed.js` 以挂件形式接入
- **可替换存储**：通过 `Storage` 接口抽象，默认文件存储，可扩展到 Postgres / KV / 边缘函数
- **对接简单**：对接站点只需两步：标记正文容器 + 引入脚本

---

## 目录结构

- `server.js` - 极简 Node.js HTTP 服务，提供 `/comments` API
- `storage.js` - Storage 统一出口，提供 `getStorage()/setStorage()`
- `storage-file.js` - 默认的文件存储实现
- `public/embed.js` - 浏览器端嵌入脚本源码（ParaNote 挂件）
- `dist/paranote.min.js` - 由 esbuild 打包压缩后的单文件版本
- `example/index.html` - 示例小说页面
- `data/` - 运行时生成的评论数据（JSON 文件）

---

## 本地运行

```bash
npm install

# 启动后端 API（默认 http://localhost:4000）
npm start

# 构建压缩版前端挂件（生成 dist/paranote.min.js）
npm run build:embed
```

健康检查（后端）：

```bash
curl http://localhost:4000/health
# -> ok
```

### 体验示例页面

1. 在项目根目录运行 `npm start`
2. 用浏览器打开 `example/index.html`
3. 页面中间是模拟小说正文，段尾有一个 💬 图标
4. 点击某段的 💬：
   - 右侧会弹出「段落评论」面板
   - 可以查看该段已有评论，输入新评论并提交

所有评论会被保存到 `data/` 目录下的 JSON 文件中。

---

## 接入任意小说 / 文章站

### 方式一：站长集成（推荐）

如果您是网站运营者，只需两步即可让您的站点拥有段落评论功能：

1. **标记正文区域**
   找到包裹文章内容的 HTML 容器（例如 `<div class="content">`），添加以下属性：
   - `data-na-root`: 标记这是评论根容器
   - `data-work-id`: 作品唯一 ID (如 `novel_123`)
   - `data-chapter-id`: 章节唯一 ID (如 `ch_456`)

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

2. **引入脚本**
   在页面底部（`</body>` 前）引入 ParaNote 脚本：

   ```html
   <script
     async
     src="https://api.paranote.example/public/embed.js"
     data-site-id="my-novel-site"
     data-api-base="https://api.paranote.example"
   ></script>
   ```
   *(请将 `https://api.paranote.example` 替换为您的 ParaNote 部署地址)*

### 方式二：网页导入器（预览工具）

如果您想在不修改代码的情况下预览 ParaNote 在您网站上的效果，或者想为任意网页添加私人评论：

1. 访问部署好的 ParaNote 首页（例如 `http://localhost:4000/`）。
2. 输入目标网页 URL。
3. 点击导入，ParaNote 将作为代理加载页面并自动注入评论系统。

---

## HTTP API 概览

### 获取评论

`GET /comments?siteId=...&workId=...&chapterId=...`

返回：

```json
{
  "commentsByPara": {
    "0": [
      {
        "id": "c1",
        "siteId": "site_abc123",
        "workId": "novel_001",
        "chapterId": "ch_005",
        "paraIndex": 0,
        "userName": "匿名",
        "content": "这一段好戳我……",
        "createdAt": "2025-01-01T12:00:00.000Z"
      }
    ]
  }
}
```

### 新增评论

`POST /comments`

请求体（无用户系统时）：

```json
{
  "siteId": "site_abc123",
  "workId": "novel_001",
  "chapterId": "ch_005",
  "paraIndex": 0,
  "content": "这一段好有画面感",
  "userName": "小明"
}
```

如果对接了站点用户系统，则推荐使用 JWT：

```http
POST /comments
Content-Type: application/json
X-Paranote-Token: <你的站点生成的 JWT>
```

ParaNote 会从 `X-Paranote-Token` 里解析出 `sub/name/avatar/siteId` 等信息，填充到评论记录里的 `userId/userName/userAvatar` 字段。

---

### 点赞评论

`POST /comments/like`

请求体：

```json
{
  "siteId": "site_abc123",
  "workId": "novel_001",
  "chapterId": "ch_005",
  "commentId": "c_xyz"
}
```

需携带 Token (X-Paranote-Token)。

### 删除评论（管理员）

`DELETE /comments`

请求体：

```json
{
  "siteId": "site_abc123",
  "workId": "novel_001",
  "chapterId": "ch_005",
  "commentId": "c_xyz"
}
```

需携带管理员 Token (role: 'admin')。

## Storage 接口与扩展

Storage 接口约定（伪 TypeScript）：

```ts
type Comment = {
  id: string;
  siteId: string;
  workId: string;
  chapterId: string;
  paraIndex: number;
  userName?: string;
   userId?: string;
   userAvatar?: string;
  content: string;
  createdAt: string;
};

interface Storage {
  listComments(params: {
    siteId: string;
    workId: string;
    chapterId: string;
  }): Promise<Record<string, Comment[]>>;

  createComment(input: {
    siteId: string;
    workId: string;
    chapterId: string;
    paraIndex: number;
    content: string;
    userName?: string;
    userId?: string;
    userAvatar?: string;
    ip?: string;
  }): Promise<Comment>;
}
```

使用方式：

```js
import { getStorage, setStorage } from "./storage.js";

const storage = getStorage();
await storage.listComments({ siteId, workId, chapterId });
await storage.createComment({ siteId, workId, chapterId, paraIndex, content });
```

如果要换成数据库 / KV / 边缘存储：

1. 新建一个 `storage-xxx.js`，导出 `createXxxStorage()`，实现上述两个方法；
2. 在 `storage.js` 中把默认实现换成：

```js
import { createXxxStorage } from "./storage-xxx.js";
let storage = createXxxStorage();
```

---

## 与站点用户系统集成（WordPress / Flarum 等）

推荐做法：由站点后端生成一个 **JWT** 注入到页面，ParaNote 从 `X-Paranote-Token` 头里解析用户信息。

### 1. 宿主站点需要做的事

1. 为站点分配一个 `siteId`，并在 ParaNote 这边配置对应的 `siteSecret`（HS256 密钥）。
2. 用户登录后，站点后端生成 JWT（payload 示例）：

```json
{
  "sub": "user_123",
  "name": "小明",
  "avatar": "https://example.com/avatar/user_123.png",
  "siteId": "site_abc123",
  "exp": 1735689600
}
```

3. 在页面上把 token 注入到全局：

```html
<script>
  window.PARANOTE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
</script>

<script
  async
  src="https://api.paranote.example/dist/paranote.min.js"
  data-site-id="site_abc123"
  data-api-base="https://api.paranote.example"
></script>
```

ParaNote 的 `embed.js` 会自动把 `window.PARANOTE_TOKEN` 作为 `X-Paranote-Token` 发送给后端。

### 2. WordPress 接入示例（伪代码）

在你的主题或插件中（省略命名空间和错误处理）：

```php
use Firebase\JWT\JWT;

function paranote_enqueue_scripts() {
    $site_id = 'site_abc123';
    $site_secret = '你的-site-secret';

    $token = null;
    if (is_user_logged_in()) {
        $user = wp_get_current_user();
        $payload = [
            'sub'    => 'wp_' . $user->ID,
            'name'   => $user->display_name,
            'avatar' => get_avatar_url($user->ID),
            'siteId' => $site_id,
            'exp'    => time() + 3600,
        ];
        $token = JWT::encode($payload, $site_secret, 'HS256');
    }

    wp_enqueue_script('paranote-embed', 'https://api.paranote.example/dist/paranote.min.js', [], null, true);
    wp_add_inline_script('paranote-embed', 'window.PARANOTE_TOKEN = ' . json_encode($token) . ';', 'before');
}
add_action('wp_enqueue_scripts', 'paranote_enqueue_scripts');
```

Flarum / 其他 PHP 或 Node 框架，只要能生成同样格式的 JWT 并注入 `window.PARANOTE_TOKEN`，即可复用同样的机制。

## License

MIT


