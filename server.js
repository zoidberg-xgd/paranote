// 极简 Node.js HTTP 服务，提供段落评论 API：
// GET  /comments?siteId=&workId=&chapterId=
// POST /comments { siteId, workId, chapterId, paraIndex, content, userName? }

import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listComments, createComment, likeComment, deleteComment } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 4000;
let SITE_SECRETS = {};
try {
  SITE_SECRETS = JSON.parse(process.env.SITE_SECRETS || '{}');
} catch (e) {
  console.error("Failed to parse SITE_SECRETS from env", e);
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}


function base64UrlDecode(str) {
  const pad = 4 - (str.length % 4 || 4);
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(s, "base64").toString("utf8");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyJwt(token, expectedSiteId) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  let payload;

  try {
    const headerJson = base64UrlDecode(headerB64);
    const header = JSON.parse(headerJson);
    if (header.alg !== "HS256") return null;

    const payloadJson = base64UrlDecode(payloadB64);
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  const siteIdFromPayload = payload.siteId;
  if (!siteIdFromPayload || (expectedSiteId && siteIdFromPayload !== expectedSiteId)) {
    return null;
  }

  const secret = SITE_SECRETS[siteIdFromPayload];
  if (!secret) return null;

  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (!safeEqual(expectedSig, sigB64)) return null;

  if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp) {
    return null;
  }

  return payload;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      // 粗略限制，防止恶意大包
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error("payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    // CORS 预检
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  if (url.pathname === "/api/v1/comments" && req.method === "GET") {
    const siteId = url.searchParams.get("siteId");
    const workId = url.searchParams.get("workId");
    const chapterId = url.searchParams.get("chapterId");

    if (!siteId || !workId || !chapterId) {
      return sendJson(res, 400, { error: "missing siteId/workId/chapterId" });
    }

    try {
      const data = await listComments({ siteId, workId, chapterId });
      return sendJson(res, 200, { commentsByPara: data });
    } catch (e) {
      console.error(e);
      return sendJson(res, 500, { error: "internal_error" });
    }
  }

  if (url.pathname === "/api/v1/comments" && req.method === "POST") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    if (!body) {
      return sendJson(res, 400, { error: "empty_body" });
    }

    const { siteId, workId, chapterId, paraIndex, content, userName } = body;

    if (
      !siteId ||
      !workId ||
      !chapterId ||
      typeof paraIndex !== "number" ||
      !content ||
      !String(content).trim()
    ) {
      return sendJson(res, 400, { error: "missing_fields" });
    }

    try {
      // 从站点注入的 JWT 中提取用户信息（如果存在）
      const tokenHeader = req.headers["x-paranote-token"] || req.headers["x-Paranote-Token"];
      const jwtPayload = verifyJwt(
        Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
        siteId,
      );

      const finalUserName =
        (jwtPayload && (jwtPayload.name || jwtPayload.username)) || userName || "匿名";
      const userId = jwtPayload && (jwtPayload.sub || jwtPayload.userId);
      const userAvatar = jwtPayload && jwtPayload.avatar;

      const comment = await createComment({
        siteId,
        workId,
        chapterId,
        paraIndex,
        content: String(content).trim(),
        userName: finalUserName,
        userId,
        userAvatar,
      });
      return sendJson(res, 201, comment);
    } catch (e) {
      console.error(e);
      return sendJson(res, 500, { error: "internal_error" });
    }
  }

  if (url.pathname === "/api/v1/comments/like" && req.method === "POST") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }
    if (!body) return sendJson(res, 400, { error: "empty_body" });

    const { siteId, workId, chapterId, commentId } = body;
    if (!siteId || !workId || !chapterId || !commentId) {
      return sendJson(res, 400, { error: "missing_fields" });
    }

    try {
      // 获取当前用户 ID
      const tokenHeader = req.headers["x-paranote-token"] || req.headers["x-Paranote-Token"];
      const jwtPayload = verifyJwt(
        Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
        siteId,
      );
      const userId = jwtPayload && (jwtPayload.sub || jwtPayload.userId);
      
      // 如果要求“一个用户只能点赞一次”，则必须登录
      if (!userId) {
         // 这里可以选择是否允许匿名无限赞。根据需求“一个用户对一个评价只能点赞一次”，
         // 匿名用户无法区分，为了安全可以禁止匿名点赞，或者允许匿名点赞但不去重。
         // 这里我们选择：如果没有登录，就无法通过 ID 去重，因此暂时禁止匿名点赞，或者给一个 warning。
         // 为了体验，如果未登录，我们暂时允许（不传 userId），但无法去重。
         // 但用户明确说“这不对”，所以最好是限制。
         // 简单起见：未登录无法点赞。
         return sendJson(res, 401, { error: "login_required_to_like" });
      }

      const updated = await likeComment({ siteId, workId, chapterId, commentId, userId });
      if (updated) {
        return sendJson(res, 200, { likes: updated.likes });
      } else {
        // 如果 updated 为 null，可能是找不到评论，或者已经点过赞
        // 区分一下不太容易，这里简化处理
        return sendJson(res, 400, { error: "already_liked_or_not_found" });
      }
    } catch (e) {
      console.error(e);
      return sendJson(res, 500, { error: "internal_error" });
    }
  }

  if (url.pathname === "/api/v1/comments" && req.method === "DELETE") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }
    if (!body) return sendJson(res, 400, { error: "empty_body" });

    const { siteId, workId, chapterId, commentId } = body;
    if (!siteId || !workId || !chapterId || !commentId) {
      return sendJson(res, 400, { error: "missing_fields" });
    }
    
    // 验证管理员权限
    const tokenHeader = req.headers["x-paranote-token"] || req.headers["x-Paranote-Token"];
    const jwtPayload = verifyJwt(
      Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
      siteId,
    );
    
    // 检查是否为管理员 (role === 'admin' 或 isAdmin === true)
    const isAdmin = jwtPayload && (jwtPayload.role === 'admin' || jwtPayload.isAdmin === true);
    
    if (!isAdmin) {
        return sendJson(res, 403, { error: "permission_denied" });
    }

    try {
      const success = await deleteComment({ siteId, workId, chapterId, commentId });
      if (success) {
        return sendJson(res, 200, { success: true });
      } else {
        return sendJson(res, 404, { error: "not_found" });
      }
    } catch (e) {
      console.error(e);
      return sendJson(res, 500, { error: "internal_error" });
    }
  }

  // 网页导入功能
  if (url.pathname === "/import" && req.method === "GET") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("请输入 URL");
      }

      try {
          const resp = await fetch(targetUrl);
          if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
          
          let html = await resp.text();
          const origin = new URL(targetUrl).origin;
          
          // 1. 注入 Base Tag 解决相对路径资源问题
          if (!html.includes("<base")) {
              html = html.replace("<head>", `<head><base href="${targetUrl}">`);
          }

          // 2. 生成唯一的 ID
          const workId = crypto.createHash('md5').update(new URL(targetUrl).hostname).digest('hex');
          const chapterId = crypto.createHash('md5').update(targetUrl).digest('hex');

          // 3. 给 body 注入标记
          html = html.replace("<body", `<body data-na-root data-site-id="imported" data-work-id="${workId}" data-chapter-id="${chapterId}"`);

          // 4. 注入 embed.js
          const script = `
          <script>
             // 简单的防跨域资源报错抑制 (可选)
             window.addEventListener('error', function(e) {
                 if(e.target.tagName === 'IMG' || e.target.tagName === 'SCRIPT') {
                     // console.log('Resource load error suppressed');
                 }
             }, true);
          </script>
          <script 
            async
            src="${url.origin}/public/embed.js" 
            data-site-id="imported" 
            data-api-base="${url.origin}"
          ></script>
          <style>
            /* 强制侧边栏最高层级 */
            .na-sidebar, .na-overlay { z-index: 2147483647 !important; }
            /* 给所有段落增加显式间隔，方便点击 */
            p { margin-bottom: 1em; }
          </style>
          `;
          
          // 插入到 body 结束标签前，或者 html 结束标签前
          if (html.includes("</body>")) {
              html = html.replace("</body>", script + "</body>");
          } else {
              html += script;
          }

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
      } catch (e) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("导入失败: " + e.message);
      }
      return;
  }

  // 静态文件服务
  if (req.method === "GET") {
    // 根路径返回导入器页面
    if (url.pathname === "/") {
      const filePath = path.join(__dirname, "public", "index.html");
      try {
        const content = await fs.readFile(filePath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(content);
      } catch (e) {
        return sendJson(res, 404, { error: "index_not_found" });
      }
    }

    // 示例页面
    if (url.pathname === "/example") {
      const filePath = path.join(__dirname, "example", "index.html");
      try {
        const content = await fs.readFile(filePath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(content);
      } catch (e) {
        return sendJson(res, 404, { error: "example_not_found" });
      }
    }

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("ok");
    }

    // 提供 public/embed.js 或 dist/paranote.min.js
    if (url.pathname === "/public/embed.js" || url.pathname === "/embed.js") {
      const filePath = path.join(__dirname, "public", "embed.js");
      try {
        const content = await fs.readFile(filePath, "utf8");
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        return res.end(content);
      } catch (e) {
        res.writeHead(404);
        return res.end("Not found");
      }
    }

    if (url.pathname === "/dist/paranote.min.js") {
      const filePath = path.join(__dirname, "dist", "paranote.min.js");
      try {
        const content = await fs.readFile(filePath, "utf8");
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        });
        return res.end(content);
      } catch (e) {
        res.writeHead(404);
        return res.end("Not found");
      }
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Novel annotator demo listening on http://localhost:${PORT}`);
});


