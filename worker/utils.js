/**
 * ParaNote Worker Utils
 * 基于 Web Standards (Web Crypto API) 重写的工具函数
 */

// ==================== JWT 验证 (Web Crypto) ====================

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binString = atob(str);
  const bytes = new Uint8Array(binString.length);
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(bytes) {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function importKey(secret) {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

export async function verifyJwt(token, secret, expectedSiteId) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;

  try {
    // 验证签名
    const key = await importKey(secret);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(sigB64);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      data
    );

    if (!isValid) return null;

    // 解析 Payload
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson);

    // 验证过期
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    // 验证 SiteID
    if (expectedSiteId && payload.siteId !== expectedSiteId) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

// ==================== MD5 (Web Crypto 不支持 MD5，使用简单实现或 SHA-256 替代) ====================
// Cloudflare Workers 环境通常也提供 crypto.subtle.digest('MD5', ...) 但不标准。
// 为兼容性，这里建议使用 SHA-256 生成 ID，或者引入轻量级 MD5 库。
// 为了演示方便，我们这里使用 SHA-256 截取前 32 位 hex 作为指纹。

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateId(str) {
  const hash = await sha256(str);
  return hash.substring(0, 32); // 模拟 MD5 长度
}

// ==================== 响应辅助 ====================

export function sendJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Paranote-Token,X-Admin-Secret",
    },
  });
}

export function sendOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Paranote-Token,X-Admin-Secret",
    },
  });
}

export function sendError(error, status = 400, details = null) {
  return sendJson({ error, details }, status);
}
