/**
 * fetcher.js 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../config.js', () => ({
  config: {
    puppeteer: {
      enabled: false,
      headless: true,
      timeout: 30000,
      userDataDir: '/tmp/puppeteer',
    },
    fetch: {
      timeout: 10000,
      maxRetries: 2,
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Fetcher Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchTelegraph', () => {
    it('should fetch and parse telegraph page', async () => {
      const { fetchTelegraph } = await import('../fetcher.js');
      
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          result: {
            title: 'Test Article',
            author_name: 'Author',
            description: 'Description',
            content: [
              { tag: 'p', children: ['Hello World'] },
              { tag: 'img', attrs: { src: '/file/image.jpg' } },
            ],
          },
        }),
      });

      const result = await fetchTelegraph('test-slug');

      expect(result).toMatchObject({
        title: 'Test Article',
        byline: 'Author',
        siteName: 'Telegra.ph',
        workId: 'test-slug',
        siteId: 'telegraph-proxy',
        chapterId: 'index',
        mode: 'telegraph',
      });
      expect(result.content).toContain('Hello World');
      expect(result.content).toContain('https://telegra.ph/file/image.jpg');
    });

    it('should return null for non-existent page', async () => {
      const { fetchTelegraph } = await import('../fetcher.js');
      
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false }),
      });

      const result = await fetchTelegraph('non-existent');
      expect(result).toBeNull();
    });

    it('should handle empty content with description fallback', async () => {
      const { fetchTelegraph } = await import('../fetcher.js');
      
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          result: {
            title: 'Empty Article',
            description: 'This is the description',
            content: [],
          },
        }),
      });

      const result = await fetchTelegraph('empty-content');
      expect(result.content).toContain('This is the description');
    });
  });

  describe('Telegraph Node Rendering', () => {
    it('should render nested nodes correctly', async () => {
      const { fetchTelegraph } = await import('../fetcher.js');
      
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          result: {
            title: 'Nested',
            content: [
              {
                tag: 'blockquote',
                children: [
                  { tag: 'p', children: ['Quote text'] },
                ],
              },
            ],
          },
        }),
      });

      const result = await fetchTelegraph('nested');
      expect(result.content).toContain('<blockquote');
      expect(result.content).toContain('Quote text');
    });

    it('should handle self-closing tags', async () => {
      const { fetchTelegraph } = await import('../fetcher.js');
      
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          result: {
            title: 'Self Closing',
            content: [
              { tag: 'br' },
              { tag: 'hr' },
            ],
          },
        }),
      });

      const result = await fetchTelegraph('self-closing');
      expect(result.content).toContain('<br');
      expect(result.content).toContain('<hr');
    });
  });
});

describe('URL Processing', () => {
  it('should generate correct work IDs', async () => {
    const { md5, generateWorkId } = await import('../utils.js');
    
    const url1 = 'https://example.com/article1';
    const url2 = 'https://example.com/article2';
    
    const workId1 = generateWorkId(url1);
    const workId2 = generateWorkId(url2);
    
    expect(workId1).not.toBe(workId2);
    expect(workId1).toMatch(/^r_/);
    expect(generateWorkId(url1)).toBe(workId1); // Consistent
  });
});
