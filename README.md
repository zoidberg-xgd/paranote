# ParaNote

Lightweight **paragraph comments** service and embed widget for novel and article sites.

任何小说 / 长文站点，只需要插一段 `<script>`，就可以在每一段文字旁边显示评论按钮，并在右侧弹出评论面板。

---

## 特性

- **段落级评论**：按 `siteId + workId + chapterId + paraIndex` 精确定位到具体段落
- **前后端解耦**：后端提供简单 HTTP API，前端通过 `embed.js` 以挂件形式接入
- **可替换存储**：通过 `Storage` 接口抽象，默认文件存储，可扩展到 Postgres / KV / 边缘函数
- **对接简单**：对接站点只需两步：标记正文容器 + 引入脚本

---

## 目录结构

- `server.js` - 极简 Node.js HTTP 服务，提供 `/comments` API
- `storage.js` - Storage 统一出口，提供 `getStorage()/setStorage()`
- `storage-file.js` - 默认的文件存储实现
- `public/embed.js` - 浏览器端嵌入脚本（ParaNote 挂件）
- `example/index.html` - 示例小说页面
- `data/` - 运行时生成的评论数据（JSON 文件）

---

## 本地运行

```bash
npm install
npm start   # 默认 http://localhost:4000
```

健康检查：

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

假设你把 ParaNote 后端部署在 `https://api.paranote.example`：

1. **给正文容器打标记**

```html
<div
  data-na-root
  data-work-id="novel_001"
  data-chapter-id="ch_005"
>
  <p>第一段……</p>
  <p>第二段……</p>
  ...
</div>
```

2. **在页面尾部引入 ParaNote**

```html
<script
  async
  src="https://api.paranote.example/public/embed.js"
  data-site-id="site_abc123"
  data-api-base="https://api.paranote.example"
></script>
```

完成以上两步，这个章节就拥有段落评论能力。

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

请求体：

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

返回：

```json
{
  "id": "c2",
  "siteId": "site_abc123",
  "workId": "novel_001",
  "chapterId": "ch_005",
  "paraIndex": 0,
  "userName": "小明",
  "content": "这一段好有画面感",
  "createdAt": "2025-01-01T12:01:00.000Z"
}
```

---

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

## License

MIT


