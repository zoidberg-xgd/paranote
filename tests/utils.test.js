/**
 * utils.js 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock config before importing utils
vi.mock('../config.js', () => ({
  config: {
    maxBodySize: 1024 * 1024,
    siteSecrets: { 'test-site': 'test-secret' },
    rateLimit: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 5,
    },
  },
}));

const {
  isValidUrl,
  sanitizeString,
  validateCommentInput,
  checkRateLimit,
  md5,
  generateWorkId,
  verifyJwt,
} = await import('../utils.js');

describe('URL Validation', () => {
  it('should accept valid HTTP URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
  });

  it('should reject invalid URLs', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(isValidUrl(null)).toBe(false);
    expect(isValidUrl(undefined)).toBe(false);
  });
});

describe('String Sanitization', () => {
  it('should trim strings', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('should truncate long strings', () => {
    const longStr = 'a'.repeat(20000);
    expect(sanitizeString(longStr, 100).length).toBe(100);
  });

  it('should handle non-strings', () => {
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
    expect(sanitizeString(123)).toBe('');
    expect(sanitizeString({})).toBe('');
  });
});

describe('Comment Input Validation', () => {
  it('should accept valid input', () => {
    const result = validateCommentInput({
      siteId: 'test-site',
      workId: 'work-1',
      chapterId: 'ch-1',
      paraIndex: 0,
      content: 'Hello World',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject empty body', () => {
    const result = validateCommentInput(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('empty_body');
  });

  it('should reject missing siteId', () => {
    const result = validateCommentInput({
      workId: 'work-1',
      chapterId: 'ch-1',
      paraIndex: 0,
      content: 'Hello',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid_siteId');
  });

  it('should reject invalid paraIndex', () => {
    const result = validateCommentInput({
      siteId: 'test-site',
      workId: 'work-1',
      chapterId: 'ch-1',
      paraIndex: -1,
      content: 'Hello',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid_paraIndex');
  });

  it('should reject empty content', () => {
    const result = validateCommentInput({
      siteId: 'test-site',
      workId: 'work-1',
      chapterId: 'ch-1',
      paraIndex: 0,
      content: '   ',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('empty_content');
  });

  it('should collect multiple errors', () => {
    const result = validateCommentInput({
      siteId: '',
      workId: '',
      chapterId: '',
      paraIndex: 'not-a-number',
      content: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Reset rate limit store by making requests from a new IP
  });

  it('should allow requests under limit', () => {
    const ip = `test-ip-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(ip)).toBe(true);
    }
  });

  it('should block requests over limit', () => {
    const ip = `test-ip-block-${Date.now()}`;
    // Make 5 requests (limit)
    for (let i = 0; i < 5; i++) {
      checkRateLimit(ip);
    }
    // 6th request should be blocked
    expect(checkRateLimit(ip)).toBe(false);
  });

  it('should track different IPs separately', () => {
    const ip1 = `ip1-${Date.now()}`;
    const ip2 = `ip2-${Date.now()}`;
    
    // Exhaust ip1's limit
    for (let i = 0; i < 5; i++) {
      checkRateLimit(ip1);
    }
    
    // ip2 should still be allowed
    expect(checkRateLimit(ip2)).toBe(true);
  });
});

describe('Hash Functions', () => {
  it('should generate consistent MD5 hashes', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(md5('hello')).toBe(md5('hello'));
  });

  it('should generate work IDs with prefix', () => {
    const workId = generateWorkId('https://example.com/article');
    expect(workId).toMatch(/^r_[a-f0-9]{32}$/);
  });
});

describe('JWT Verification', () => {
  it('should return null for empty token', () => {
    expect(verifyJwt('')).toBeNull();
    expect(verifyJwt(null)).toBeNull();
    expect(verifyJwt(undefined)).toBeNull();
  });

  it('should return null for malformed token', () => {
    expect(verifyJwt('not.a.jwt')).toBeNull();
    expect(verifyJwt('only-one-part')).toBeNull();
  });

  it('should return null for unknown siteId', () => {
    // Create a token with unknown siteId
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ siteId: 'unknown-site' })).toString('base64url');
    const token = `${header}.${payload}.fake-sig`;
    
    expect(verifyJwt(token)).toBeNull();
  });
});
