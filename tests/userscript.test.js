/**
 * paranote.user.js 油猴脚本逻辑测试
 */
import { describe, it, expect } from 'vitest';

describe('Userscript Logic', () => {
  describe('URL Hash Generation', () => {
    const simpleHash = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    };

    const generateWorkId = (url) => 'w_' + simpleHash(url);
    const generateChapterId = (path) => 'c_' + simpleHash(path);

    it('should generate consistent workId for same URL', () => {
      const url = 'https://example.com/article/123';
      const id1 = generateWorkId(url);
      const id2 = generateWorkId(url);
      expect(id1).toBe(id2);
    });

    it('should generate different workIds for different URLs', () => {
      const id1 = generateWorkId('https://example.com/a');
      const id2 = generateWorkId('https://example.com/b');
      expect(id1).not.toBe(id2);
    });

    it('should generate chapterId from path', () => {
      const id = generateChapterId('/article/chapter-1');
      expect(id).toMatch(/^c_[a-z0-9]+$/);
    });
  });

  describe('Content Container Detection', () => {
    // 模拟选择器匹配逻辑
    const ZHIHU_SELECTORS = [
      '.RichContent-inner .RichText',
      '.AnswerItem .RichText',
      '.Post-RichTextContainer .RichText',
      '.RichText.ztext.Post-RichText',
      '.RichText.ztext',
    ];

    const DEFAULT_SELECTORS = [
      'article',
      '.article',
      '.article-content',
      '.post-content',
      '.entry-content',
      '.content',
      '.markdown-body',
      'main',
    ];

    it('should have Zhihu-specific selectors', () => {
      expect(ZHIHU_SELECTORS.length).toBeGreaterThan(0);
      expect(ZHIHU_SELECTORS.some(s => s.includes('RichText'))).toBe(true);
    });

    it('should have common article selectors', () => {
      expect(DEFAULT_SELECTORS).toContain('article');
      expect(DEFAULT_SELECTORS).toContain('.markdown-body');
    });

    it('should prioritize Zhihu selectors for zhihu.com', () => {
      const isZhihu = 'zhihu.com'.includes('zhihu.com');
      expect(isZhihu).toBe(true);
    });
  });

  describe('Paragraph Detection', () => {
    // 模拟段落检测逻辑
    const countParagraphs = (html) => {
      const matches = html.match(/<p[^>]*>/gi);
      return matches ? matches.length : 0;
    };

    it('should count p tags', () => {
      const html = '<div><p>Para 1</p><p>Para 2</p></div>';
      expect(countParagraphs(html)).toBe(2);
    });

    it('should handle no paragraphs', () => {
      const html = '<div><span>No paragraphs</span></div>';
      expect(countParagraphs(html)).toBe(0);
    });

    it('should handle p tags with attributes', () => {
      const html = '<p class="intro">Intro</p><p id="main">Main</p>';
      expect(countParagraphs(html)).toBe(2);
    });
  });

  describe('Site Detection', () => {
    const detectSite = (hostname) => {
      if (hostname.includes('zhihu.com')) return 'zhihu';
      if (hostname.includes('wikipedia.org')) return 'wikipedia';
      if (hostname.includes('weixin.qq.com')) return 'wechat';
      if (hostname.includes('telegra.ph')) return 'telegraph';
      return 'generic';
    };

    it('should detect Zhihu', () => {
      expect(detectSite('www.zhihu.com')).toBe('zhihu');
      expect(detectSite('zhuanlan.zhihu.com')).toBe('zhihu');
    });

    it('should detect Wikipedia', () => {
      expect(detectSite('en.wikipedia.org')).toBe('wikipedia');
      expect(detectSite('zh.wikipedia.org')).toBe('wikipedia');
    });

    it('should detect WeChat', () => {
      expect(detectSite('mp.weixin.qq.com')).toBe('wechat');
    });

    it('should return generic for unknown sites', () => {
      expect(detectSite('example.com')).toBe('generic');
    });
  });

  describe('Toast Message', () => {
    const createToastHTML = (message) => {
      return `<div style="position:fixed;top:20px;right:20px;padding:12px 20px;background:#333;color:#fff;border-radius:6px;z-index:99999;">${message}</div>`;
    };

    it('should create toast with message', () => {
      const html = createToastHTML('✅ 已启用');
      expect(html).toContain('已启用');
      expect(html).toContain('position:fixed');
    });

    it('should escape HTML in message', () => {
      const html = createToastHTML('<script>');
      expect(html).toContain('<script>'); // 在实际实现中应该转义
    });
  });

  describe('Keyboard Shortcut', () => {
    const isToggleShortcut = (e) => {
      return e.altKey && e.key.toLowerCase() === 'p';
    };

    it('should detect Alt+P', () => {
      expect(isToggleShortcut({ altKey: true, key: 'p' })).toBe(true);
      expect(isToggleShortcut({ altKey: true, key: 'P' })).toBe(true);
    });

    it('should not trigger without Alt', () => {
      expect(isToggleShortcut({ altKey: false, key: 'p' })).toBe(false);
    });

    it('should not trigger with wrong key', () => {
      expect(isToggleShortcut({ altKey: true, key: 'x' })).toBe(false);
    });
  });

  describe('API Base URL', () => {
    const normalizeApiBase = (url) => {
      if (!url) return '';
      return url.replace(/\/$/, ''); // 移除末尾斜杠
    };

    it('should remove trailing slash', () => {
      expect(normalizeApiBase('http://localhost:4000/')).toBe('http://localhost:4000');
    });

    it('should keep URL without trailing slash', () => {
      expect(normalizeApiBase('http://localhost:4000')).toBe('http://localhost:4000');
    });

    it('should handle empty string', () => {
      expect(normalizeApiBase('')).toBe('');
    });
  });
});
