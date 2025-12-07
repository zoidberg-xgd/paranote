/**
 * ParaNote Cloudflare Worker Entry
 * 
 * 部署指南:
 * 1. 创建 Cloudflare Worker
 * 2. 绑定环境变量 (Settings -> Variables):
 *    - ATLAS_API_URL: MongoDB Atlas Data API Endpoint
 *    - ATLAS_API_KEY: Data API Key
 *    - ATLAS_DATA_SOURCE: Cluster Name (e.g. "Cluster0")
 *    - ATLAS_DATABASE: "paranote"
 *    - SITE_SECRETS: JSON String {"my-site":"secret"}
 *    - ADMIN_SECRET: String
 */

import { MongoAtlas } from "./mongo.js";
import { verifyJwt, generateId, sendJson, sendError, sendOptions } from "./utils.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return sendOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;
    
    // 初始化 DB
    const db = new MongoAtlas({
      url: env.ATLAS_API_URL,
      apiKey: env.ATLAS_API_KEY,
      dataSource: env.ATLAS_DATA_SOURCE,
      database: env.ATLAS_DATABASE,
      collection: "comments", // 默认集合
    });
    // Ban 集合
    const banDb = new MongoAtlas({
      ...db,
      collection: "bans"
    });

    try {
      // ==================== GET Comments ====================
      if (path === "/api/v1/comments" && request.method === "GET") {
        const siteId = url.searchParams.get("siteId");
        const workId = url.searchParams.get("workId");
        const chapterId = url.searchParams.get("chapterId");

        if (!siteId || !workId || !chapterId) {
          return sendError("missing_params");
        }

        const docs = await db.find(
          { siteId, workId, chapterId },
          { createdAt: 1 },
          500
        );

        // 格式化为按段落索引
        const commentsByPara = {};
        for (const doc of docs) {
          if (!commentsByPara[doc.paraIndex]) {
            commentsByPara[doc.paraIndex] = [];
          }
          // 移除 _id 等内部字段
          const { _id, ...rest } = doc;
          commentsByPara[doc.paraIndex].push(rest);
        }

        return sendJson({ commentsByPara });
      }

      // ==================== POST Comment ====================
      if (path === "/api/v1/comments" && request.method === "POST") {
        const body = await request.json();
        const { siteId, workId, chapterId, paraIndex, content, userName, parentId } = body;

        if (!siteId || !workId || !chapterId || content === undefined) {
          return sendError("missing_fields");
        }

        // 鉴权
        const token = request.headers.get("x-paranote-token");
        let secrets = {};
        try { secrets = JSON.parse(env.SITE_SECRETS || "{}"); } catch {}
        const secret = secrets[siteId];
        
        // 验证 JWT
        let finalUserName = userName;
        let userId = null;
        let userAvatar = null;

        if (token && secret) {
          const payload = await verifyJwt(token, secret, siteId);
          if (payload) {
            userId = payload.sub || payload.userId;
            finalUserName = payload.name || payload.username || userName;
            userAvatar = payload.avatar;
          }
        }

        // 匿名处理
        if (!userId) {
          const ip = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
          const ipHash = await generateId(ip + siteId);
          userId = `ip_${ipHash}`;
          if (!finalUserName) finalUserName = `访客-${ipHash.substring(0, 6)}`;
        }

        // 检查封禁
        const bans = await banDb.find({ siteId, userId }, {}, 1);
        if (bans.length > 0) {
          return sendError("user_banned", 403);
        }

        const commentId = await generateId(Math.random().toString() + Date.now());
        
        const newComment = {
          id: commentId,
          siteId, workId, chapterId, paraIndex,
          content,
          userId,
          userName: finalUserName,
          userAvatar,
          parentId,
          likes: 0,
          likedBy: [],
          createdAt: new Date().toISOString()
        };

        await db.insertOne(newComment);
        return sendJson(newComment, 201);
      }

      // ==================== LIKE Comment ====================
      if (path === "/api/v1/comments/like" && request.method === "POST") {
        const body = await request.json();
        const { siteId, commentId } = body;
        
        if (!siteId || !commentId) return sendError("missing_fields");

        // 简化鉴权：只用 IP 或 JWT sub
        const token = request.headers.get("x-paranote-token");
        let secrets = {};
        try { secrets = JSON.parse(env.SITE_SECRETS || "{}"); } catch {}
        const secret = secrets[siteId];

        let userId = null;
        if (token && secret) {
          const payload = await verifyJwt(token, secret, siteId);
          if (payload) userId = payload.sub;
        }
        if (!userId) {
          const ip = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
          userId = `ip_${await generateId(ip + siteId)}`;
        }

        // 原子更新 (Atlas Data API 支持)
        // 注意：Data API 的 $addToSet 和 $inc 组合需要特定权限
        // 这里做一个简单实现
        const result = await db.updateOne(
          { id: commentId, likedBy: { $ne: userId } },
          { 
            $inc: { likes: 1 },
            $push: { likedBy: userId }
          }
        );

        if (result.modifiedCount > 0) {
          return sendJson({ success: true });
        } else {
          return sendJson({ error: "already_liked_or_not_found" }, 400);
        }
      }

      // ==================== DELETE Comment ====================
      if (path === "/api/v1/comments" && request.method === "DELETE") {
        const body = await request.json();
        const { siteId, workId, chapterId, commentId } = body;

        if (!siteId || !workId || !chapterId || !commentId) {
          return sendError("missing_fields");
        }

        // 鉴权 (Admin Secret 或 JWT Admin)
        const adminSecretHeader = request.headers.get("x-admin-secret");
        const isAdminBySecret = env.ADMIN_SECRET && adminSecretHeader === env.ADMIN_SECRET;

        const token = request.headers.get("x-paranote-token");
        let secrets = {};
        try { secrets = JSON.parse(env.SITE_SECRETS || "{}"); } catch {}
        const secret = secrets[siteId];

        let isAdminByJwt = false;
        if (token && secret) {
          const payload = await verifyJwt(token, secret, siteId);
          if (payload && (payload.role === "admin" || payload.isAdmin === true)) {
            isAdminByJwt = true;
          }
        }

        if (!isAdminBySecret && !isAdminByJwt) {
          return sendError("permission_denied", 403);
        }

        const result = await db.deleteOne({ id: commentId, siteId });
        if (result.deletedCount > 0) {
          return sendJson({ success: true });
        } else {
          return sendError("not_found", 404);
        }
      }

      // ==================== BAN User ====================
      if (path === "/api/v1/ban") {
        const adminSecretHeader = request.headers.get("x-admin-secret");
        const isAdminBySecret = env.ADMIN_SECRET && adminSecretHeader === env.ADMIN_SECRET;
        
        // 验证 JWT
        const siteIdParam = url.searchParams.get("siteId"); // GET
        let body = {};
        if (request.method !== "GET") {
          try { body = await request.json(); } catch {}
        }
        const siteId = siteIdParam || body.siteId;

        if (!siteId) return sendError("missing_params");

        const token = request.headers.get("x-paranote-token");
        let secrets = {};
        try { secrets = JSON.parse(env.SITE_SECRETS || "{}"); } catch {}
        const secret = secrets[siteId];

        let isAdminByJwt = false;
        let isAuthor = false;
        let bannedBy = "admin";

        if (token && secret) {
          const payload = await verifyJwt(token, secret, siteId);
          if (payload) {
            if (payload.role === "admin" || payload.isAdmin === true) isAdminByJwt = true;
            if (payload.isAuthor === true) isAuthor = true;
            bannedBy = payload.sub || payload.userId || "admin";
          }
        }

        if (!isAdminBySecret && !isAdminByJwt && !isAuthor) {
          return sendError("permission_denied", 403);
        }

        // GET /api/v1/ban - List
        if (request.method === "GET") {
          const bans = await banDb.find({ siteId }, { bannedAt: -1 });
          return sendJson({
            bannedUsers: bans.map(b => ({
              userId: b.userId,
              reason: b.reason,
              bannedBy: b.bannedBy,
              bannedAt: b.bannedAt
            }))
          });
        }

        // POST /api/v1/ban - Add
        if (request.method === "POST") {
          const { targetUserId, reason } = body;
          if (!targetUserId) return sendError("missing_fields");

          await banDb.updateOne(
            { siteId, userId: targetUserId },
            { 
              $set: { 
                siteId, 
                userId: targetUserId, 
                reason: reason || '', 
                bannedBy, 
                bannedAt: new Date().toISOString() 
              } 
            },
            true // upsert
          );
          return sendJson({ success: true });
        }

        // DELETE /api/v1/ban - Remove
        if (request.method === "DELETE") {
          const { targetUserId } = body;
          if (!targetUserId) return sendError("missing_fields");

          const result = await banDb.deleteOne({ siteId, userId: targetUserId });
          if (result.deletedCount > 0) {
            return sendJson({ success: true });
          } else {
            return sendError("not_found", 404);
          }
        }
      }

      // 默认响应
      return sendError("not_found", 404);

    } catch (e) {
      return sendError("internal_error", 500, e.message);
    }
  }
};
