/**
 * ParaNote 工具函数
 */

import crypto from "node:crypto";
import { config } from "./config.js";

// ==================== HTTP 响应 ====================

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Paranote-Token,X-Admin-Secret",
  });
  res.end(body);
}

export function sendHtml(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

export function sendFile(res, content, contentType, cacheControl = "no-cache") {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
  });
  res.end(content);
}

export function redirect(res, location, status = 302) {
  res.writeHead(status, { "Location": location });
  res.end();
}

// ==================== 请求解析 ====================

export function parseBody(req, maxSize = config.maxBodySize) {
  // Support environments where body is already parsed (e.g. Vercel, Express)
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxSize) {
        req.destroy();
        reject(new Error("payload_too_large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "127.0.0.1";
}

// ==================== JWT 验证 ====================

function base64UrlDecode(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(base64 + padding, "base64").toString("utf8");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function verifyJwt(token, expectedSiteId = null) {
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

  const secret = config.siteSecrets[siteIdFromPayload];
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

// ==================== 输入验证 ====================

export function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function sanitizeString(str, maxLength = 10000) {
  if (typeof str !== "string") return "";
  return str.slice(0, maxLength).trim();
}

// ID 格式验证：只允许安全字符，防止路径遍历
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_\-\.]+$/;
const MAX_ID_LENGTH = 200;
const MAX_CONTENT_LENGTH = 10000;
const MAX_PARA_INDEX = 100000;

export function isValidId(id) {
  if (typeof id !== "string") return false;
  if (id.length === 0 || id.length > MAX_ID_LENGTH) return false;
  if (!SAFE_ID_PATTERN.test(id)) return false;
  // 防止路径遍历
  if (id.includes("..") || id.includes("/") || id.includes("\\")) return false;
  return true;
}

export function validateCommentInput(body) {
  const errors = [];
  
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["empty_body"] };
  }
  
  // 验证 ID 格式（防止路径遍历和注入）
  if (!isValidId(body.siteId)) {
    errors.push("invalid_siteId");
  }
  if (!isValidId(body.workId)) {
    errors.push("invalid_workId");
  }
  if (!isValidId(body.chapterId)) {
    errors.push("invalid_chapterId");
  }
  
  // 验证 paraIndex 范围
  if (typeof body.paraIndex !== "number" || 
      !Number.isInteger(body.paraIndex) ||
      body.paraIndex < 0 || 
      body.paraIndex > MAX_PARA_INDEX) {
    errors.push("invalid_paraIndex");
  }
  
  // 验证内容长度
  if (!body.content || typeof body.content !== "string") {
    errors.push("invalid_content");
  } else {
    const trimmed = body.content.trim();
    if (trimmed.length === 0) {
      errors.push("empty_content");
    } else if (trimmed.length > MAX_CONTENT_LENGTH) {
      errors.push("content_too_long");
    }
  }
  
  // 验证可选字段
  if (body.parentId !== undefined && body.parentId !== null) {
    if (typeof body.parentId !== "string" || body.parentId.length > 100) {
      errors.push("invalid_parentId");
    }
  }
  
  if (body.userName !== undefined && body.userName !== null) {
    if (typeof body.userName !== "string" || body.userName.length > 100) {
      errors.push("invalid_userName");
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== 速率限制 ====================

const rateLimitStore = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10000; // 防止内存泄漏

export function checkRateLimit(ip) {
  if (!config.rateLimit.enabled) return true;
  
  // 防止 IP 欺骗攻击导致内存泄漏
  if (rateLimitStore.size > MAX_RATE_LIMIT_ENTRIES) {
    // 清理最旧的一半记录
    const entries = Array.from(rateLimitStore.entries());
    entries.sort((a, b) => {
      const lastA = a[1].requests[a[1].requests.length - 1] || 0;
      const lastB = b[1].requests[b[1].requests.length - 1] || 0;
      return lastA - lastB;
    });
    const toDelete = entries.slice(0, Math.floor(entries.length / 2));
    for (const [key] of toDelete) {
      rateLimitStore.delete(key);
    }
  }
  
  const now = Date.now();
  const windowStart = now - config.rateLimit.windowMs;
  
  // 清理过期记录
  const record = rateLimitStore.get(ip) || { requests: [], blocked: false };
  record.requests = record.requests.filter(t => t > windowStart);
  
  if (record.requests.length >= config.rateLimit.maxRequests) {
    record.blocked = true;
    rateLimitStore.set(ip, record);
    return false;
  }
  
  record.requests.push(now);
  record.blocked = false;
  rateLimitStore.set(ip, record);
  return true;
}

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  const windowStart = now - config.rateLimit.windowMs * 2;
  for (const [ip, record] of rateLimitStore.entries()) {
    record.requests = record.requests.filter(t => t > windowStart);
    if (record.requests.length === 0) {
      rateLimitStore.delete(ip);
    }
  }
}, 60000).unref(); // unref 防止阻止进程退出

// ==================== 哈希工具 ====================

export function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

export function generateWorkId(url) {
  return "r_" + md5(url);
}
