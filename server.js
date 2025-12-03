// 极简 Node.js HTTP 服务，提供段落评论 API：
// GET  /comments?siteId=&workId=&chapterId=
// POST /comments { siteId, workId, chapterId, paraIndex, content, userName? }

import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
// storage 现在是一个代理，需要初始化
import { listComments, createComment, likeComment, deleteComment, initStorage, exportAll, importAll } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 4000;
let SITE_SECRETS = {};
try {
  SITE_SECRETS = JSON.parse(process.env.SITE_SECRETS || '{}');
} catch (e) {
  console.error("Failed to parse SITE_SECRETS from env", e);
}

// 检查 Puppeteer 是否启用 (默认开启)
const ENABLE_PUPPETEER = process.env.ENABLE_PUPPETEER !== 'false';

// 延迟加载 Puppeteer 实例
let puppeteerInstance = null;

async function getPuppeteer() {
  if (!ENABLE_PUPPETEER) return null;
  if (puppeteerInstance) return puppeteerInstance;
  
  try {
    console.log("Initializing Puppeteer...");
    // 动态导入 puppeteer-extra
    const puppeteer = (await import("puppeteer-extra")).default;
    const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
    puppeteer.use(StealthPlugin());
    puppeteerInstance = puppeteer;
    return puppeteer;
  } catch (e) {
    console.error("Failed to load puppeteer:", e.message);
    return null;
  }
}

// 智能抓取函数：优先 fetch，失败降级为 Puppeteer
async function fetchPageContent(targetUrl) {
  // 1. 尝试普通 fetch
  try {
    const resp = await fetch(targetUrl, {
      headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
      }
    });

    if (resp.status === 403 || resp.status === 401 || resp.status === 503) {
       throw new Error(`Status ${resp.status}`);
    }
    
    if (!resp.ok) throw new Error(`Status ${resp.status}`);
    
    return await resp.text();
  } catch (e) {
    console.log(`Fetch failed (${e.message})`);
    
    if (!ENABLE_PUPPETEER) {
      throw new Error(`Puppeteer disabled, cannot bypass protection (${e.message})`);
    }

    console.log('Fallback to Puppeteer...');
    
    const puppeteer = await getPuppeteer();
    if (!puppeteer) {
       throw new Error("Puppeteer module not available");
    }

    // 2. 降级使用 Puppeteer
    const isHeadless = process.env.PUPPETEER_HEADLESS !== 'false';
    
    const browser = await puppeteer.launch({
      headless: isHeadless ? "new" : false,
      userDataDir: path.join(__dirname, 'puppeteer_data'),
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // 减少内存使用 (Shared Memory)
        '--disable-accelerated-2d-canvas', // 禁用 Canvas 加速
        '--disable-gpu', // 禁用 GPU
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800'
      ]
    });
    
    try {
      const page = await browser.newPage();
      
      // 注入脚本以进一步隐藏 webdriver 特征
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });
      
      // 访问页面
      await page.goto(targetUrl, { 
        waitUntil: 'domcontentloaded', // 放宽加载条件
        timeout: 60000 
      });

      // 智能等待循环
      const startTime = Date.now();
      let finalContent = "";
      
      // 如果是 headless 模式，等待时间短一点；如果是 headful，给用户时间操作
      const maxWaitTime = isHeadless ? 30000 : 120000;
      
      while (Date.now() - startTime < maxWaitTime) {
          const content = await page.content();
          
          try {
             const dom = new JSDOM(content, { url: targetUrl });
             const reader = new Readability(dom.window.document);
             const article = reader.parse();
             
             if (article && article.title && article.textContent && article.textContent.length > 100) {
                 if (!content.includes("Verify you are human") && !content.includes("Just a moment")) {
                     finalContent = content;
                     break; 
                 }
             }
          } catch(err) { /* ignore */ }

          await new Promise(r => setTimeout(r, 1000));
      }
      
      if (!finalContent) {
          finalContent = await page.content();
      }
      
      return finalContent;
    } finally {
      await browser.close();
    }
  }
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

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
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

    const { siteId, workId, chapterId, paraIndex, content, userName, contextText } = body;

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
      const tokenHeader = req.headers["x-paranote-token"] || req.headers["x-Paranote-Token"];
      const jwtPayload = verifyJwt(
        Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
        siteId,
      );

      let finalUserName = (jwtPayload && (jwtPayload.name || jwtPayload.username)) || userName;
      let userId = jwtPayload && (jwtPayload.sub || jwtPayload.userId);
      const userAvatar = jwtPayload && jwtPayload.avatar;

      // 匿名用户逻辑: 如果没有登录，使用 IP 生成稳定身份
      let ip = null;
      if (!userId) {
         ip = getClientIp(req);
         if (ip) {
             const ipHash = crypto.createHash('md5').update(ip + siteId).digest('hex');
             userId = `ip_${ipHash}`;
             // 如果用户明确提供了"匿名"作为userName，则分配一个访客名
             // 如果JWT无效且没有提供userName，则使用"匿名"（不分配访客名）
             if (finalUserName === "匿名") {
                 finalUserName = `访客-${ipHash.substring(0, 6)}`;
             }
         }
      }
      
      if (!finalUserName) finalUserName = "匿名";

      const comment = await createComment({
        siteId,
        workId,
        chapterId,
        paraIndex,
        content: String(content).trim(),
        userName: finalUserName,
        userId,
        userAvatar,
        contextText, 
        ip // 传递 IP 给存储层 (主要用于 MongoDB)
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
      const tokenHeader = req.headers["x-paranote-token"] || req.headers["x-Paranote-Token"];
      const jwtPayload = verifyJwt(
        Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
        siteId,
      );
      
      let userId = jwtPayload && (jwtPayload.sub || jwtPayload.userId);
      
      // 如果未登录，尝试使用 IP 标识
      if (!userId) {
          const ip = getClientIp(req);
          if (ip) {
              // 使用 siteId + ip 生成唯一 hash，避免跨站点追踪
              const ipHash = crypto.createHash('md5').update(ip + siteId).digest('hex');
              userId = `ip_${ipHash}`;
          }
      }

      if (!userId) {
         return sendJson(res, 401, { error: "login_required_to_like" });
      }

      const updated = await likeComment({ siteId, workId, chapterId, commentId, userId });
      if (updated) {
        return sendJson(res, 200, { likes: updated.likes });
      } else {
        return sendJson(res, 400, { error: "already_liked_or_not_found" });
      }
    } catch (e) {
      console.error(e);
      return sendJson(res, 500, { error: "internal_error" });
    }
  }

  if (url.pathname === "/api/v1/export" && req.method === "GET") {
      const secret = req.headers["x-admin-secret"];
      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
          return sendJson(res, 403, { error: "forbidden" });
      }
      try {
          const data = await exportAll();
          res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="paranote-export-${Date.now()}.json"`
          });
          return res.end(JSON.stringify(data));
      } catch (e) {
          console.error(e);
          return sendJson(res, 500, { error: "internal_error" });
      }
  }

  if (url.pathname === "/api/v1/import" && req.method === "POST") {
      const secret = req.headers["x-admin-secret"];
      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
          return sendJson(res, 403, { error: "forbidden" });
      }
      
      let body;
      try {
          // Custom body parsing for larger limit (50MB)
          body = await new Promise((resolve, reject) => {
            let data = "";
            req.on("data", (chunk) => {
              data += chunk;
              if (data.length > 50 * 1024 * 1024) {
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
      } catch (e) {
          return sendJson(res, 400, { error: "invalid_json_or_too_large" });
      }

      if (!Array.isArray(body)) {
          return sendJson(res, 400, { error: "invalid_data_format" });
      }

      try {
          const result = await importAll(body);
          return sendJson(res, 200, result);
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
    
    const tokenHeader = req.headers["x-paranote-token"] || req.headers["x-Paranote-Token"];
    const jwtPayload = verifyJwt(
      Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
      siteId,
    );
    
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

  const pMatch = url.pathname.match(/^\/p\/(.+)$/);
  if (pMatch && req.method === "GET") {
    const slug = pMatch[1];
    
    try {
      const apiUrl = `https://api.telegra.ph/getPage/${slug}?return_content=true`;
      const apiResp = await fetch(apiUrl);
      const apiJson = await apiResp.json();

      if (!apiJson.ok) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Telegra.ph 文章未找到或 API 错误");
      }

      const page = apiJson.result;
      
      function renderNode(node) {
        if (typeof node === 'string') return node;
        if (!node.tag) return '';
        
        const children = (node.children || []).map(renderNode).join('');
        const attrs = Object.entries(node.attrs || {})
          .map(([k, v]) => {
             if (k === 'src' && v.startsWith('/')) {
               return `${k}="https://telegra.ph${v}"`;
             }
             return `${k}="${v}"`;
          })
          .join(' ');
        
        if (['img', 'br', 'hr'].includes(node.tag)) {
          return `<${node.tag} ${attrs} />`;
        }
        
        return `<${node.tag} ${attrs}>${children}</${node.tag}>`;
      }

      const contentHtml = page.content.map(renderNode).join('');
      
      const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title} - ParaNote Reader</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.8;
      color: #333;
      max-width: 700px;
      margin: 0 auto;
      padding: 20px;
      background: #f9f9f9;
    }
    article {
      background: #fff;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    h1 { margin-top: 0; font-size: 2em; }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 0;
      padding-left: 1em;
      color: #666;
    }
    .na-comment-btn { opacity: 0.3; transition: opacity 0.2s; }
    .na-comment-btn:hover { opacity: 1; }
    .share-btn {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 8px 16px;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        color: #555;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transition: all 0.2s;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .share-btn:hover {
        background: #f5f5f5;
        color: #333;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
  </style>
</head>
<body data-na-root data-site-id="telegraph-proxy" data-work-id="${slug}" data-chapter-id="index">

  <button class="share-btn" onclick="copyLink()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
    分享
  </button>

  <article>
    <h1>${page.title}</h1>
    <div style="color: #888; margin-bottom: 20px;">
      ${page.author_name ? `By ${page.author_name}` : ''}
    </div>
    <div class="content">
      ${contentHtml}
    </div>
  </article>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = document.querySelector('.share-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ 已复制';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
      }).catch(err => {
        alert('复制失败，请手动复制浏览器地址栏链接');
      });
    }
  </script>

  <script 
    async
    src="/public/embed.js" 
    data-site-id="telegraph-proxy" 
    data-api-base="${url.origin}"
  ></script>
</body>
</html>
      `;

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);

    } catch (e) {
      console.error(e);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Internal Error: " + e.message);
    }
  }

  if (url.pathname === "/read" && req.method === "GET") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("请输入 URL，例如 /read?url=https://example.com");
    }

    try {
      const targetObj = new URL(targetUrl);
      
      if (targetObj.hostname.includes("telegra.ph") && targetObj.pathname !== "/") {
          const slug = targetObj.pathname.replace(/^\//, '');
          res.writeHead(302, { "Location": `/p/${slug}` });
          return res.end();
      }

      const htmlRaw = await fetchPageContent(targetUrl);
      
      const dom = new JSDOM(htmlRaw, { url: targetUrl });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
         throw new Error("无法提取正文内容");
      }

      const hostname = new URL(targetUrl).hostname;
      const workId = "r_" + crypto.createHash('md5').update(targetUrl).digest('hex');

      const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${article.title || '无标题'} - ParaNote Reader</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.8;
      color: #333;
      max-width: 700px;
      margin: 0 auto;
      padding: 20px;
      background: #f9f9f9;
    }
    article {
      background: #fff;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    h1 { margin-top: 0; font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
    img { max-width: 100%; height: auto; display: block; margin: 20px auto; border-radius: 4px; }
    a { color: #f56c6c; text-decoration: none; }
    a:hover { text-decoration: underline; }
    blockquote {
      border-left: 4px solid #f56c6c;
      margin: 20px 0;
      padding-left: 16px;
      color: #666;
      background: #fff9f9;
      padding: 10px 16px;
    }
    pre { background: #f4f4f4; padding: 15px; overflow-x: auto; border-radius: 4px; }
    .na-comment-btn { opacity: 0.3; transition: opacity 0.2s; }
    .na-comment-btn:hover { opacity: 1; }
    .source-link {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #eee;
        font-size: 14px;
        color: #999;
    }
    .share-btn {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 8px 16px;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        color: #555;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transition: all 0.2s;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .share-btn:hover {
        background: #f5f5f5;
        color: #333;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
  </style>
</head>
<body data-na-root data-site-id="paranote-reader" data-work-id="${workId}" data-chapter-id="index">

  <button class="share-btn" onclick="copyLink()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
    分享
  </button>

  <article>
    <h1>${article.title || '无标题'}</h1>
    <div style="color: #888; margin-bottom: 30px; font-size: 0.9em;">
      ${article.byline ? `<span>${article.byline}</span> • ` : ''}
      <span>${hostname}</span>
    </div>
    
    <div class="content">
      ${article.content}
    </div>

    <div class="source-link">
        原文链接：<a href="${targetUrl}" target="_blank">${targetUrl}</a>
    </div>
  </article>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = document.querySelector('.share-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ 已复制';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
      }).catch(err => {
        alert('复制失败，请手动复制浏览器地址栏链接');
      });
    }
  </script>

  <!-- ParaNote Embed Script -->
  <script 
    async
    src="/public/embed.js" 
    data-site-id="paranote-reader" 
    data-api-base="${url.origin}"
  ></script>
</body>
</html>
      `;

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);

    } catch (e) {
       console.error("Reader Error:", e);
       res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
       return res.end("阅读模式转换失败: " + e.message);
    }
  }

  if (url.pathname === "/import" && req.method === "GET") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("请输入 URL");
      }

      try {
          let html = await fetchPageContent(targetUrl);
          
          if (!html.includes("<base")) {
              html = html.replace("<head>", `<head><base href="${targetUrl}">`);
          }

          html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, "<!-- script removed by paranote -->");
          html = html.replace(/\sdata-(src|original)="([^"]*)"/gi, ' src="$2"');

          const workId = crypto.createHash('md5').update(new URL(targetUrl).hostname).digest('hex');
          const chapterId = crypto.createHash('md5').update(targetUrl).digest('hex');

          html = html.replace(/<body([^>]*)>/i, `<body$1 data-na-root data-site-id="imported" data-work-id="${workId}" data-chapter-id="${chapterId}">`);

          const script = `
          <button class="share-btn" onclick="copyLink()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
            分享
          </button>
          <script>
            function copyLink() {
              navigator.clipboard.writeText(window.location.href).then(() => {
                const btn = document.querySelector('.share-btn');
                const originalText = btn.innerHTML;
                btn.innerHTML = '✅ 已复制';
                setTimeout(() => { btn.innerHTML = originalText; }, 2000);
              }).catch(err => { alert('复制失败'); });
            }
             window.addEventListener('error', function(e) {
                 if(e.target.tagName === 'IMG' || e.target.tagName === 'SCRIPT') {}
             }, true);
          </script>
          <script 
            async
            src="${url.origin}/public/embed.js" 
            data-site-id="imported" 
            data-api-base="${url.origin}"
          ></script>
          <style>
            .na-sidebar, .na-overlay { z-index: 2147483647 !important; }
            .share-btn {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 8px 16px;
                background: #fff;
                border: 1px solid #ddd;
                border-radius: 20px;
                cursor: pointer;
                font-size: 14px;
                color: #555;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                transition: all 0.2s;
                z-index: 2147483648; 
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .share-btn:hover {
                background: #f5f5f5;
                color: #333;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .RichContent-inner, .RichContent-inner--collapsed, .RichContent { 
                max-height: none !important; 
                height: auto !important;
                overflow: visible !important; 
                -webkit-mask-image: none !important; 
                mask-image: none !important;
            }
            .RichContent-inner::after, .RichContent-inner--collapsed::after {
                display: none !important;
                content: none !important;
            }
            .QuestionAnswer-content {
                max-height: none !important;
                overflow: visible !important;
            }
            .ContentItem-expandButton, .ContentItem-actions, .ViewAll { display: none !important; }
            .SignFlowHomepage-footer, .Card.AppBanner { display: none !important; }
          </style>
          `;
          
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

  if (req.method === "GET") {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // 启动服务前先初始化存储
  initStorage().then(() => {
      server.listen(PORT, () => {
        console.log(`ParaNote listening on http://localhost:${PORT}`);
        console.log(`- Storage: ${process.env.STORAGE_TYPE || 'file'}`);
        console.log(`- Puppeteer: ${ENABLE_PUPPETEER ? 'Enabled' : 'Disabled'}`);
      });
  }).catch(err => {
      console.error("Failed to initialize storage:", err);
      process.exit(1);
  });
}

export { server };
