/**
 * ParaNote 网页抓取模块
 * 支持普通 fetch 和 Puppeteer 降级
 * 集成 BrowserForge 智能指纹生成
 */

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { config } from "./config.js";
import { md5, generateWorkId } from "./utils.js";
import {
  generateHeaders,
  generateFingerprint,
  generatePuppeteerArgs,
  generateInjectionScript,
} from "./browser-forge.js";

// ==================== Puppeteer 懒加载 ====================

let puppeteerInstance = null;

async function getPuppeteer() {
  if (!config.puppeteer.enabled) return null;
  if (puppeteerInstance) return puppeteerInstance;

  try {
    console.log("Initializing Puppeteer with Stealth...");
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

// ==================== BrowserForge 指纹缓存 ====================

let cachedFingerprint = null;
let fingerprintExpiry = 0;

function getFingerprint() {
  const now = Date.now();
  // 指纹每 5 分钟刷新一次
  if (!cachedFingerprint || now > fingerprintExpiry) {
    cachedFingerprint = generateFingerprint({ locale: 'zh-CN' });
    fingerprintExpiry = now + 5 * 60 * 1000;
    console.log(`[BrowserForge] Generated fingerprint: ${cachedFingerprint.fingerprint.browser} ${cachedFingerprint.fingerprint.browserVersion} on ${cachedFingerprint.fingerprint.os}`);
  }
  return cachedFingerprint;
}

function getHeaders() {
  const fp = getFingerprint();
  return fp.headers;
}

// ==================== 核心抓取函数 ====================

async function fetchWithHttp(targetUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.fetch.timeout);

  // 使用 BrowserForge 生成的动态头
  const headers = getHeaders();

  try {
    const resp = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
    });

    if (resp.status === 403 || resp.status === 401 || resp.status === 503) {
      throw new Error(`HTTP ${resp.status}`);
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithPuppeteer(targetUrl) {
  const puppeteer = await getPuppeteer();
  if (!puppeteer) {
    throw new Error("Puppeteer not available");
  }

  // 使用 BrowserForge 生成完整指纹
  const fingerprint = getFingerprint();
  const { screen, navigator: nav } = fingerprint;
  const puppeteerArgs = generatePuppeteerArgs(fingerprint);
  const injectionScript = generateInjectionScript(fingerprint);

  console.log(`[BrowserForge] Launching browser with fingerprint: ${fingerprint.fingerprint.userAgent.slice(0, 50)}...`);

  const browser = await puppeteer.launch({
    headless: config.puppeteer.headless ? "new" : false,
    userDataDir: config.puppeteer.userDataDir,
    ignoreDefaultArgs: ["--enable-automation"],
    args: puppeteerArgs,
  });

  try {
    const page = await browser.newPage();

    // 注入 BrowserForge 指纹
    await page.evaluateOnNewDocument(injectionScript);

    // 设置 User-Agent 和视口
    await page.setUserAgent(fingerprint.fingerprint.userAgent);
    await page.setViewport({ 
      width: screen.width, 
      height: screen.height,
      deviceScaleFactor: screen.devicePixelRatio,
      isMobile: fingerprint.fingerprint.device === 'mobile',
    });

    // 设置额外的 HTTP 头
    await page.setExtraHTTPHeaders(fingerprint.headers);

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.puppeteer.timeout,
    });

    // 智能等待
    const startTime = Date.now();
    const maxWaitTime = config.puppeteer.headless ? 30000 : 120000;
    let finalContent = "";

    while (Date.now() - startTime < maxWaitTime) {
      const content = await page.content();

      try {
        const dom = new JSDOM(content, { url: targetUrl });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (article?.title && article?.textContent?.length > 100) {
          if (!content.includes("Verify you are human") && !content.includes("Just a moment")) {
            finalContent = content;
            break;
          }
        }
      } catch {
        // ignore
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    return finalContent || (await page.content());
  } finally {
    await browser.close();
  }
}

/**
 * 智能抓取：优先 HTTP，失败降级 Puppeteer
 */
export async function fetchPageContent(targetUrl) {
  try {
    return await fetchWithHttp(targetUrl);
  } catch (e) {
    console.log(`HTTP fetch failed (${e.message}), trying Puppeteer...`);

    if (!config.puppeteer.enabled) {
      throw new Error(`Access denied. Puppeteer disabled. (${e.message})`);
    }

    return await fetchWithPuppeteer(targetUrl);
  }
}

// ==================== Telegra.ph 处理 ====================

function renderTelegraphNode(node) {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object" || !node.tag) return "";

  const tag = node.tag;
  const children = (node.children || []).map(renderTelegraphNode).join("");
  const attrs = node.attrs || {};

  // 修复相对路径图片
  if (attrs.src && attrs.src.startsWith("/")) {
    attrs.src = `https://telegra.ph${attrs.src}`;
  }

  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

  if (["img", "br", "hr"].includes(tag)) {
    return `<${tag} ${attrStr} />`;
  }

  return `<${tag} ${attrStr}>${children}</${tag}>`;
}

export async function fetchTelegraph(slug) {
  const apiUrl = `https://api.telegra.ph/getPage/${slug}?return_content=true`;

  const resp = await fetch(apiUrl, { timeout: 10000 });
  const data = await resp.json();

  if (!data.ok) {
    return null;
  }

  const page = data.result;
  const contentHtml = (page.content || []).map(renderTelegraphNode).join("") || 
                      `<p>${page.description || ""}</p>`;

  return {
    title: page.title || "",
    content: contentHtml,
    byline: page.author_name || "",
    siteName: "Telegra.ph",
    workId: slug,
    siteId: "telegraph-proxy",
    chapterId: "index",
    mode: "telegraph",
  };
}

// ==================== Reader 模式 ====================

export async function fetchReaderMode(targetUrl) {
  const html = await fetchPageContent(targetUrl);
  const dom = new JSDOM(html, { url: targetUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Failed to parse article content");
  }

  const urlObj = new URL(targetUrl);

  return {
    title: article.title || "",
    content: article.content || "",
    byline: article.byline || "",
    siteName: urlObj.hostname,
    sourceUrl: targetUrl,
    workId: generateWorkId(targetUrl),
    siteId: "paranote-reader",
    chapterId: "index",
    mode: "reader",
  };
}

// ==================== Raw 模式 ====================

export async function fetchRawMode(targetUrl) {
  let html = await fetchPageContent(targetUrl);
  const urlObj = new URL(targetUrl);

  // 添加 base 标签
  if (!html.toLowerCase().includes("<base")) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${targetUrl}">`);
  }

  // 移除脚本
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // 修复懒加载图片
  html = html.replace(/\sdata-(src|original)="([^"]*)"/gi, ' src="$2"');

  return {
    title: "",
    content: html,
    byline: "",
    siteName: urlObj.hostname,
    sourceUrl: targetUrl,
    workId: md5(urlObj.hostname),
    siteId: "imported",
    chapterId: md5(targetUrl),
    mode: "raw",
  };
}

// ==================== 统一入口 ====================

export async function fetchContent(targetUrl, mode = "reader") {
  const urlObj = new URL(targetUrl);

  // Telegra.ph 特殊处理
  if (urlObj.hostname.includes("telegra.ph") && urlObj.pathname !== "/") {
    const slug = urlObj.pathname.replace(/^\//, "");
    const result = await fetchTelegraph(slug);
    if (result) {
      result.sourceUrl = targetUrl;
      return result;
    }
    throw new Error("Telegraph page not found");
  }

  // 普通网页
  if (mode === "raw") {
    return await fetchRawMode(targetUrl);
  }

  return await fetchReaderMode(targetUrl);
}

// ==================== 导出 BrowserForge 功能 ====================

export { getFingerprint, getHeaders };
