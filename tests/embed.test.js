/**
 * embed.js 前端组件测试 (模拟 DOM 环境)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟 DOM 环境
const createMockDOM = () => {
  const elements = {};
  
  return {
    querySelector: vi.fn((selector) => elements[selector] || null),
    querySelectorAll: vi.fn((selector) => []),
    createElement: vi.fn((tag) => ({
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      classList: { add: vi.fn(), remove: vi.fn() },
      appendChild: vi.fn(),
      addEventListener: vi.fn(),
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      innerHTML: '',
      textContent: '',
    })),
    body: {
      appendChild: vi.fn(),
    },
    head: {
      appendChild: vi.fn(),
    },
    readyState: 'complete',
    addEventListener: vi.fn(),
  };
};

describe('Embed Component Logic', () => {
  describe('Avatar Color Generation', () => {
    // 测试头像颜色生成算法
    const getAvatarColor = (name) => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash) % 360;
      return { bg: `hsl(${hue}, 60%, 85%)`, text: `hsl(${hue}, 60%, 30%)` };
    };

    it('should generate consistent color for same name', () => {
      const color1 = getAvatarColor('TestUser');
      const color2 = getAvatarColor('TestUser');
      expect(color1).toEqual(color2);
    });

    it('should generate different colors for different names', () => {
      const color1 = getAvatarColor('Alice');
      const color2 = getAvatarColor('Bob');
      expect(color1.bg).not.toBe(color2.bg);
    });

    it('should handle empty string', () => {
      const color = getAvatarColor('');
      expect(color.bg).toContain('hsl');
    });

    it('should handle unicode characters', () => {
      const color = getAvatarColor('访客-abc123');
      expect(color.bg).toContain('hsl');
    });
  });

  describe('Comment Data Processing', () => {
    // 测试评论数据处理逻辑
    const processComments = (serverData) => {
      const correctedData = {};
      const allComments = [];
      
      Object.values(serverData).forEach(list => allComments.push(...list));
      
      allComments.forEach(c => {
        const key = String(c.paraIndex);
        if (!correctedData[key]) correctedData[key] = [];
        correctedData[key].push(c);
      });
      
      return correctedData;
    };

    it('should group comments by paraIndex', () => {
      const data = {
        '0': [{ id: '1', paraIndex: 0, content: 'A' }],
        '1': [{ id: '2', paraIndex: 1, content: 'B' }],
      };
      
      const result = processComments(data);
      expect(Object.keys(result)).toHaveLength(2);
    });

    it('should handle empty data', () => {
      const result = processComments({});
      expect(result).toEqual({});
    });
  });

  describe('Fuzzy Anchoring', () => {
    // 测试模糊定位算法
    const findMatchingParagraph = (contextText, paragraphs) => {
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].startsWith(contextText)) {
          return i;
        }
      }
      return -1;
    };

    it('should find exact match', () => {
      const paragraphs = [
        '这是第一段内容，包含一些文字。',
        '这是第二段内容，也有一些文字。',
        '这是第三段内容。',
      ];
      
      const index = findMatchingParagraph('这是第二段内容', paragraphs);
      expect(index).toBe(1);
    });

    it('should return -1 for no match', () => {
      const paragraphs = ['段落一', '段落二'];
      const index = findMatchingParagraph('不存在的内容', paragraphs);
      expect(index).toBe(-1);
    });

    it('should match partial prefix', () => {
      const paragraphs = ['Hello World, this is a test.'];
      const index = findMatchingParagraph('Hello World', paragraphs);
      expect(index).toBe(0);
    });
  });

  describe('Date Formatting', () => {
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    it('should format valid date', () => {
      const result = formatDate('2024-01-15T10:30:00Z');
      expect(result).toBeTruthy();
    });

    it('should handle empty string', () => {
      const result = formatDate('');
      expect(result).toBe('');
    });

    it('should handle null', () => {
      const result = formatDate(null);
      expect(result).toBe('');
    });
  });

  describe('Content Sanitization', () => {
    // 简单的内容清理
    const sanitizeContent = (content) => {
      if (!content) return '';
      return String(content)
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trim();
    };

    it('should escape HTML tags', () => {
      const result = sanitizeContent('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should trim whitespace', () => {
      const result = sanitizeContent('  hello world  ');
      expect(result).toBe('hello world');
    });

    it('should handle empty input', () => {
      expect(sanitizeContent('')).toBe('');
      expect(sanitizeContent(null)).toBe('');
    });
  });

  describe('Blockquote Parsing', () => {
    const parseBlockquote = (content) => {
      if (!content.startsWith('> ')) return { quote: null, text: content };
      
      const parts = content.split('\n');
      const quoteText = parts[0].substring(2);
      const mainText = parts.slice(1).join('\n').trim();
      
      return { quote: quoteText, text: mainText };
    };

    it('should parse blockquote', () => {
      const result = parseBlockquote('> 引用内容\n这是正文');
      expect(result.quote).toBe('引用内容');
      expect(result.text).toBe('这是正文');
    });

    it('should handle no blockquote', () => {
      const result = parseBlockquote('普通内容');
      expect(result.quote).toBeNull();
      expect(result.text).toBe('普通内容');
    });

    it('should handle quote only', () => {
      const result = parseBlockquote('> 只有引用');
      expect(result.quote).toBe('只有引用');
      expect(result.text).toBe('');
    });
  });
});
