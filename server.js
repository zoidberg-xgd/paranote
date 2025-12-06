/**
 * ParaNote Server - 重构版
 * 段落评论 API 服务
 */

import "dotenv/config";
import http from "node:http";
import { fileURLToPath } from "node:url";

import { config, printConfig } from "./config.js";
import { sendJson, sendText } from "./utils.js";
import { initStorage } from "./storage.js";
import { handleApiRoutes } from "./routes/api.js";
import { handleStaticRoutes } from "./routes/static.js";

// ==================== 请求处理 ====================

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS 预检
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Paranote-Token,X-Admin-Secret",
    });
    res.end();
    return;
  }

  try {
    // API 路由
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApiRoutes(req, res, url);
      if (handled) return;
    }

    // 静态文件路由
    const handled = await handleStaticRoutes(req, res, url);
    if (handled) return;

    // 404
    sendText(res, 404, "Not found");
  } catch (e) {
    console.error("Request error:", e);
    sendJson(res, 500, { error: "internal_error", message: e.message });
  }
}

// ==================== 服务器创建 ====================

const server = http.createServer(handleRequest);

// 优雅关闭
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT received, shutting down...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// ==================== 启动 ====================

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initStorage()
    .then(() => {
      server.listen(config.port, config.host, () => {
        console.log(`\nParaNote listening on http://${config.host}:${config.port}`);
        printConfig();
        console.log("");
      });
    })
    .catch((err) => {
      console.error("Failed to initialize storage:", err);
      process.exit(1);
    });
}

export { server };
