/**
 * ParaNote 自动加载器
 * 
 * 一行代码集成评论系统：
 * <script src="https://your-paranote-server.com/loader.js" data-site-id="your-site"></script>
 * 
 * 可选配置：
 * - data-site-id: 站点 ID (必填)
 * - data-work-id: 作品 ID (默认: 从 URL 路径生成)
 * - data-chapter-id: 章节 ID (默认: 从 URL 路径生成)
 * - data-selector: 内容容器选择器 (默认: article, .content, .post, main, body)
 * - data-theme: 主题 (默认: light, 可选: dark)
 * - data-lang: 语言 (默认: zh, 可选: en)
 * - data-auto-init: 是否自动初始化 (默认: true)
 */

(function() {
  'use strict';

  const script = document.currentScript;
  if (!script) {
    console.error('ParaNote: Cannot find current script');
    return;
  }

  // 配置
  const config = {
    siteId: script.dataset.siteId || 'default',
    workId: script.dataset.workId || null,
    chapterId: script.dataset.chapterId || null,
    selector: script.dataset.selector || null,
    theme: script.dataset.theme || 'light',
    lang: script.dataset.lang || 'zh',
    autoInit: script.dataset.autoInit !== 'false',
    apiBase: script.src ? new URL(script.src).origin : '',
  };

  // 默认选择器列表
  const DEFAULT_SELECTORS = [
    'article',
    '.article',
    '.content',
    '.post-content',
    '.entry-content',
    '.post',
    '.markdown-body',
    'main',
    '[role="main"]',
    '.main-content',
  ];

  /**
   * 从 URL 生成唯一 ID
   */
  function generateIdFromUrl(url) {
    const path = new URL(url).pathname;
    // 移除开头和结尾的斜杠，替换特殊字符
    return path.replace(/^\/|\/$/g, '').replace(/[\/\?#&=]/g, '_') || 'index';
  }

  /**
   * 简单的 MD5 哈希（用于生成短 ID）
   */
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 查找内容容器
   */
  function findContentContainer() {
    // 如果用户指定了选择器
    if (config.selector) {
      const el = document.querySelector(config.selector);
      if (el) return el;
      console.warn(`ParaNote: Selector "${config.selector}" not found, trying defaults`);
    }

    // 尝试默认选择器
    for (const selector of DEFAULT_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && el.querySelectorAll('p').length > 0) {
        return el;
      }
    }

    // 最后回退到 body
    return document.body;
  }

  /**
   * 初始化 ParaNote
   */
  function init() {
    // 查找内容容器
    const container = findContentContainer();
    if (!container) {
      console.error('ParaNote: No content container found');
      return;
    }

    // 检查是否有段落
    const paragraphs = container.querySelectorAll('p');
    if (paragraphs.length === 0) {
      console.warn('ParaNote: No paragraphs found in container');
      return;
    }

    console.log(`ParaNote: Found ${paragraphs.length} paragraphs in`, container);

    // 生成 workId 和 chapterId
    const workId = config.workId || generateIdFromUrl(window.location.href);
    const chapterId = config.chapterId || simpleHash(window.location.pathname);

    // 设置 data 属性
    container.setAttribute('data-na-root', '');
    container.setAttribute('data-site-id', config.siteId);
    container.setAttribute('data-work-id', workId);
    container.setAttribute('data-chapter-id', chapterId);

    // 加载 embed.js
    const embedScript = document.createElement('script');
    embedScript.src = config.apiBase + '/embed.js';
    embedScript.setAttribute('data-site-id', config.siteId);
    embedScript.setAttribute('data-api-base', config.apiBase);
    embedScript.async = true;

    embedScript.onload = function() {
      console.log('ParaNote: Embed script loaded');
    };

    embedScript.onerror = function() {
      console.error('ParaNote: Failed to load embed script');
    };

    document.body.appendChild(embedScript);
  }

  /**
   * 等待 DOM 加载完成后初始化
   */
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // 自动初始化
  if (config.autoInit) {
    ready(init);
  }

  // 暴露全局 API
  window.ParaNote = {
    init: init,
    config: config,
    version: '1.0.0',
  };

})();
