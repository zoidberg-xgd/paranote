// 极简 Node.js HTTP 服务，提供段落评论 API：
// GET  /comments?siteId=&workId=&chapterId=
// POST /comments { siteId, workId, chapterId, paraIndex, content, userName? }

import http from "node:http";
import { listComments, createComment } from "./storage.js";

const PORT = process.env.PORT || 4000;

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

  if (url.pathname === "/comments" && req.method === "GET") {
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

  if (url.pathname === "/comments" && req.method === "POST") {
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
      const comment = await createComment({
        siteId,
        workId,
        chapterId,
        paraIndex,
        content: String(content).trim(),
        userName,
      });
      return sendJson(res, 201, comment);
    } catch (e) {
      console.error(e);
      return sendJson(res, 500, { error: "internal_error" });
    }
  }

  // 其他路径简单返回
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("ok");
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Novel annotator demo listening on http://localhost:${PORT}`);
});


