/**
 * ParaNote API 路由
 * /api/v1/* 核心评论 API
 */

import crypto from "node:crypto";
import { config } from "../config.js";
import {
  sendJson,
  parseBody,
  getClientIp,
  verifyJwt,
  validateCommentInput,
  checkRateLimit,
  isValidUrl,
} from "../utils.js";
import {
  listComments,
  createComment,
  likeComment,
  deleteComment,
  exportAll,
  importAll,
} from "../storage.js";
import { fetchContent } from "../fetcher.js";

/**
 * 处理 API 路由
 * @returns {boolean} 是否已处理请求
 */
export async function handleApiRoutes(req, res, url) {
  const path = url.pathname;
  const method = req.method;

  // 速率限制检查
  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp)) {
    sendJson(res, 429, { error: "rate_limit_exceeded" });
    return true;
  }

  // GET /api/v1/comments - 获取评论
  if (path === "/api/v1/comments" && method === "GET") {
    const siteId = url.searchParams.get("siteId");
    const workId = url.searchParams.get("workId");
    const chapterId = url.searchParams.get("chapterId");

    if (!siteId || !workId || !chapterId) {
      sendJson(res, 400, { error: "missing_params", message: "siteId, workId, chapterId required" });
      return true;
    }

    try {
      const data = await listComments({ siteId, workId, chapterId });
      sendJson(res, 200, { commentsByPara: data });
    } catch (e) {
      console.error("listComments error:", e);
      sendJson(res, 500, { error: "internal_error" });
    }
    return true;
  }

  // POST /api/v1/comments - 创建评论
  if (path === "/api/v1/comments" && method === "POST") {
    let body;
    try {
      body = await parseBody(req);
    } catch (e) {
      sendJson(res, 400, { error: e.message });
      return true;
    }

    const validation = validateCommentInput(body);
    if (!validation.valid) {
      sendJson(res, 400, { error: "validation_failed", details: validation.errors });
      return true;
    }

    try {
      const { siteId, workId, chapterId, paraIndex, content, userName, contextText, parentId } = body;

      // JWT 验证
      const tokenHeader = req.headers["x-paranote-token"];
      const jwtPayload = verifyJwt(
        Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
        siteId
      );

      let finalUserName = jwtPayload?.name || jwtPayload?.username || userName;
      let userId = jwtPayload?.sub || jwtPayload?.userId;
      const userAvatar = jwtPayload?.avatar;

      // 匿名用户 IP 标识
      if (!userId) {
        const ip = getClientIp(req);
        const ipHash = crypto.createHash("md5").update(ip + siteId).digest("hex");
        userId = `ip_${ipHash}`;
        // 如果没有用户名或者是默认的"匿名"，生成访客身份
        if (!finalUserName || finalUserName === "匿名") {
          finalUserName = `访客-${ipHash.substring(0, 6)}`;
        }
      }

      if (!finalUserName) finalUserName = `访客-${userId.substring(3, 9)}`;

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
        parentId: parentId || null,  // 支持回复
      });

      sendJson(res, 201, comment);
    } catch (e) {
      console.error("createComment error:", e);
      sendJson(res, 500, { error: "internal_error" });
    }
    return true;
  }

  // DELETE /api/v1/comments - 删除评论
  if (path === "/api/v1/comments" && method === "DELETE") {
    let body;
    try {
      body = await parseBody(req);
    } catch (e) {
      sendJson(res, 400, { error: e.message });
      return true;
    }

    if (!body) {
      sendJson(res, 400, { error: "empty_body" });
      return true;
    }

    const { siteId, workId, chapterId, commentId, editToken } = body;
    if (!siteId || !workId || !chapterId || !commentId) {
      sendJson(res, 400, { error: "missing_fields" });
      return true;
    }

    const tokenHeader = req.headers["x-paranote-token"];
    const jwtPayload = verifyJwt(
      Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
      siteId
    );

    const isAdmin = jwtPayload?.role === "admin" || jwtPayload?.isAdmin === true;
    const isAuthor = !!editToken;

    if (!isAdmin && !isAuthor) {
      sendJson(res, 403, { error: "permission_denied" });
      return true;
    }

    try {
      const success = await deleteComment({ siteId, workId, chapterId, commentId });
      if (success) {
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 404, { error: "not_found" });
      }
    } catch (e) {
      console.error("deleteComment error:", e);
      sendJson(res, 500, { error: "internal_error" });
    }
    return true;
  }

  // POST /api/v1/comments/like - 点赞
  if (path === "/api/v1/comments/like" && method === "POST") {
    let body;
    try {
      body = await parseBody(req);
    } catch (e) {
      sendJson(res, 400, { error: e.message });
      return true;
    }

    if (!body) {
      sendJson(res, 400, { error: "empty_body" });
      return true;
    }

    const { siteId, workId, chapterId, commentId } = body;
    if (!siteId || !workId || !chapterId || !commentId) {
      sendJson(res, 400, { error: "missing_fields" });
      return true;
    }

    try {
      const tokenHeader = req.headers["x-paranote-token"];
      const jwtPayload = verifyJwt(
        Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader,
        siteId
      );

      let userId = jwtPayload?.sub || jwtPayload?.userId;

      if (!userId) {
        const ip = getClientIp(req);
        const ipHash = crypto.createHash("md5").update(ip + siteId).digest("hex");
        userId = `ip_${ipHash}`;
      }

      const updated = await likeComment({ siteId, workId, chapterId, commentId, userId });
      if (updated) {
        sendJson(res, 200, { likes: updated.likes });
      } else {
        sendJson(res, 400, { error: "already_liked_or_not_found" });
      }
    } catch (e) {
      console.error("likeComment error:", e);
      sendJson(res, 500, { error: "internal_error" });
    }
    return true;
  }

  // GET /api/v1/fetch - 抓取网页 (仅 full/reader 模式)
  if (path === "/api/v1/fetch" && method === "GET") {
    if (config.deployMode === "api") {
      sendJson(res, 404, {
        error: "fetch_api_disabled",
        message: "Set DEPLOY_MODE=full or reader to enable",
      });
      return true;
    }

    const targetUrl = url.searchParams.get("url");
    const mode = url.searchParams.get("mode") || "reader";

    if (!targetUrl) {
      sendJson(res, 400, { error: "missing_url" });
      return true;
    }

    if (!isValidUrl(targetUrl)) {
      sendJson(res, 400, { error: "invalid_url" });
      return true;
    }

    try {
      const result = await fetchContent(targetUrl, mode);
      sendJson(res, 200, result);
    } catch (e) {
      console.error("fetchContent error:", e);
      sendJson(res, 500, { error: "fetch_failed", message: e.message });
    }
    return true;
  }

  // GET /api/v1/export - 导出数据
  if (path === "/api/v1/export" && method === "GET") {
    const secret = req.headers["x-admin-secret"];
    if (!config.adminSecret || secret !== config.adminSecret) {
      sendJson(res, 403, { error: "forbidden" });
      return true;
    }

    try {
      const data = await exportAll();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="paranote-export-${Date.now()}.json"`,
      });
      res.end(JSON.stringify(data));
    } catch (e) {
      console.error("exportAll error:", e);
      sendJson(res, 500, { error: "internal_error" });
    }
    return true;
  }

  // POST /api/v1/import - 导入数据
  if (path === "/api/v1/import" && method === "POST") {
    const secret = req.headers["x-admin-secret"];
    if (!config.adminSecret || secret !== config.adminSecret) {
      sendJson(res, 403, { error: "forbidden" });
      return true;
    }

    let body;
    try {
      body = await parseBody(req, config.maxImportSize);
    } catch (e) {
      sendJson(res, 400, { error: e.message });
      return true;
    }

    if (!Array.isArray(body)) {
      sendJson(res, 400, { error: "invalid_data_format" });
      return true;
    }

    try {
      const result = await importAll(body);
      sendJson(res, 200, result);
    } catch (e) {
      console.error("importAll error:", e);
      sendJson(res, 500, { error: "internal_error" });
    }
    return true;
  }

  return false;
}
