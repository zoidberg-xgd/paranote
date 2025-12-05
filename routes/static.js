/**
 * ParaNote 静态文件路由
 */

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { sendJson, sendFile, sendText, redirect } from "../utils.js";

/**
 * 处理静态文件路由
 * @returns {boolean} 是否已处理请求
 */
export async function handleStaticRoutes(req, res, url) {
  const pathname = url.pathname;

  if (req.method !== "GET") {
    return false;
  }

  // 健康检查 (所有模式)
  if (pathname === "/health") {
    sendText(res, 200, "ok");
    return true;
  }

  // embed.js (所有模式)
  if (pathname === "/public/embed.js" || pathname === "/embed.js") {
    try {
      const content = await fs.readFile(path.join(config.publicDir, "embed.js"), "utf8");
      sendFile(res, content, "application/javascript; charset=utf-8", "no-cache");
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return true;
  }

  // loader.js - 自动加载器 (所有模式)
  if (pathname === "/public/loader.js" || pathname === "/loader.js") {
    try {
      const content = await fs.readFile(path.join(config.publicDir, "loader.js"), "utf8");
      sendFile(res, content, "application/javascript; charset=utf-8", "public, max-age=3600");
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return true;
  }

  // 油猴脚本 (所有模式)
  if (pathname === "/paranote.user.js" || pathname === "/public/paranote.user.js") {
    try {
      let content = await fs.readFile(path.join(config.publicDir, "paranote.user.js"), "utf8");
      // 动态替换默认服务器地址
      const serverUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      content = content.replace("const DEFAULT_API_BASE = 'http://localhost:4000'", `const DEFAULT_API_BASE = '${serverUrl}'`);
      sendFile(res, content, "application/javascript; charset=utf-8", "no-cache");
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return true;
  }

  // paranote.min.js (所有模式)
  if (pathname === "/dist/paranote.min.js") {
    try {
      const content = await fs.readFile(path.join(config.distDir, "paranote.min.js"), "utf8");
      sendFile(res, content, "application/javascript; charset=utf-8", "public, max-age=3600");
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return true;
  }

  // 首页 (仅 full 模式)
  if (pathname === "/" && config.deployMode === "full") {
    try {
      const content = await fs.readFile(path.join(config.publicDir, "index.html"), "utf8");
      sendFile(res, content, "text/html; charset=utf-8");
    } catch {
      sendJson(res, 404, { error: "index_not_found" });
    }
    return true;
  }

  // API 模式根路径 - 返回 API 信息
  if (pathname === "/" && config.deployMode === "api") {
    sendJson(res, 200, {
      service: "ParaNote API",
      version: "0.1.0",
      mode: "api",
      endpoints: [
        "GET  /api/v1/comments",
        "POST /api/v1/comments",
        "POST /api/v1/comments/like",
        "DELETE /api/v1/comments",
        "GET  /api/v1/export",
        "POST /api/v1/import",
        "GET  /health",
      ],
    });
    return true;
  }

  // reader 模式根路径 - 重定向到阅读器
  if (pathname === "/" && config.deployMode === "reader") {
    redirect(res, "/public/reader.html");
    return true;
  }

  // 集成文档页面 (所有模式)
  if (pathname === "/docs" || pathname === "/public/docs.html") {
    try {
      const content = await fs.readFile(path.join(config.publicDir, "docs.html"), "utf8");
      sendFile(res, content, "text/html; charset=utf-8");
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return true;
  }

  // 阅读器页面 (仅 full/reader 模式)
  if (pathname === "/public/reader.html" && config.deployMode !== "api") {
    try {
      const content = await fs.readFile(path.join(config.publicDir, "reader.html"), "utf8");
      sendFile(res, content, "text/html; charset=utf-8");
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return true;
  }

  // 兼容旧路由 /read (仅 full/reader 模式)
  if (pathname === "/read" && config.deployMode !== "api") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      redirect(res, "/");
    } else {
      redirect(res, `/public/reader.html?url=${encodeURIComponent(targetUrl)}&mode=reader`);
    }
    return true;
  }

  // 兼容旧路由 /import (仅 full/reader 模式)
  if (pathname === "/import" && config.deployMode !== "api") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      redirect(res, "/");
    } else {
      redirect(res, `/public/reader.html?url=${encodeURIComponent(targetUrl)}&mode=raw`);
    }
    return true;
  }

  // example 页面 (仅 full 模式)
  if (pathname === "/example" && config.deployMode === "full") {
    try {
      const content = await fs.readFile(path.join(config.rootDir, "example", "index.html"), "utf8");
      sendFile(res, content, "text/html; charset=utf-8");
    } catch {
      sendJson(res, 404, { error: "example_not_found" });
    }
    return true;
  }

  return false;
}
