/**
 * 路由集成测试
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// 设置测试环境变量
process.env.SITE_SECRETS = JSON.stringify({
  'test-site': 'test-secret-key',
});
process.env.ADMIN_SECRET = 'admin-secret';
process.env.DEPLOY_MODE = 'full';
process.env.RATE_LIMIT = 'false'; // Disable rate limit for tests

// 动态导入 server
const { server } = await import('../server.js');

describe('API Routes', () => {
  const SITE_ID = 'test-site';
  const SECRET = 'test-secret-key';
  const WORK_ID = `test-work-${Date.now()}`;
  const CHAPTER_ID = 'test-chapter';

  describe('GET /api/v1/comments', () => {
    it('should return 400 for missing params', async () => {
      const res = await request(server).get('/api/v1/comments');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('missing_params');
    });

    it('should return empty comments for new chapter', async () => {
      const res = await request(server)
        .get('/api/v1/comments')
        .query({
          siteId: SITE_ID,
          workId: `new-work-${Date.now()}`,
          chapterId: CHAPTER_ID,
        });

      expect(res.status).toBe(200);
      expect(res.body.commentsByPara).toEqual({});
    });
  });

  describe('POST /api/v1/comments', () => {
    it('should create anonymous comment', async () => {
      const res = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 0,
          content: 'Anonymous comment',
        });

      expect(res.status).toBe(201);
      expect(res.body.userName).toMatch(/^访客-[a-f0-9]{6}$/);  // 现在生成访客身份
      expect(res.body.userId).toMatch(/^ip_/);
    });

    it('should create authenticated comment', async () => {
      const token = jwt.sign(
        { siteId: SITE_ID, sub: 'user-123', name: 'Test User' },
        SECRET,
        { algorithm: 'HS256' }
      );

      const res = await request(server)
        .post('/api/v1/comments')
        .set('X-Paranote-Token', token)
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 1,
          content: 'Authenticated comment',
        });

      expect(res.status).toBe(201);
      expect(res.body.userName).toBe('Test User');
      expect(res.body.userId).toBe('user-123');
    });

    it('should reject invalid input', async () => {
      const res = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: SITE_ID,
          // Missing required fields
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_failed');
    });

    it('should reject empty content', async () => {
      const res = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 0,
          content: '   ',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/comments/like', () => {
    it('should like a comment', async () => {
      // Create comment first
      const createRes = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 10,
          content: 'Like this',
        });

      const commentId = createRes.body.id;

      // Like it
      const likeRes = await request(server)
        .post('/api/v1/comments/like')
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          commentId,
        });

      expect(likeRes.status).toBe(200);
      expect(likeRes.body.likes).toBe(1);
    });

    it('should prevent duplicate likes', async () => {
      const token = jwt.sign(
        { siteId: SITE_ID, sub: 'like-user' },
        SECRET,
        { algorithm: 'HS256' }
      );

      // Create comment
      const createRes = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 11,
          content: 'Like once only',
        });

      const commentId = createRes.body.id;

      // First like
      await request(server)
        .post('/api/v1/comments/like')
        .set('X-Paranote-Token', token)
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          commentId,
        });

      // Second like should fail
      const res = await request(server)
        .post('/api/v1/comments/like')
        .set('X-Paranote-Token', token)
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          commentId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('already_liked_or_not_found');
    });
  });

  describe('DELETE /api/v1/comments', () => {
    it('should require permission', async () => {
      const res = await request(server)
        .delete('/api/v1/comments')
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          commentId: 'some-id',
        });

      expect(res.status).toBe(403);
    });

    it('should allow admin to delete', async () => {
      // Create comment
      const createRes = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 20,
          content: 'Delete me',
        });

      const commentId = createRes.body.id;

      // Admin token
      const token = jwt.sign(
        { siteId: SITE_ID, sub: 'admin', role: 'admin' },
        SECRET,
        { algorithm: 'HS256' }
      );

      const res = await request(server)
        .delete('/api/v1/comments')
        .set('X-Paranote-Token', token)
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          commentId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/export', () => {
    it('should require admin secret', async () => {
      const res = await request(server).get('/api/v1/export');
      expect(res.status).toBe(403);
    });

    it('should export with valid secret', async () => {
      const res = await request(server)
        .get('/api/v1/export')
        .set('X-Admin-Secret', 'admin-secret');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/v1/import', () => {
    it('should require admin secret', async () => {
      const res = await request(server)
        .post('/api/v1/import')
        .send([]);

      expect(res.status).toBe(403);
    });

    it('should import with valid secret', async () => {
      const res = await request(server)
        .post('/api/v1/import')
        .set('X-Admin-Secret', 'admin-secret')
        .send([
          {
            id: 'imported-1',
            siteId: SITE_ID,
            workId: 'imported-work',
            chapterId: CHAPTER_ID,
            paraIndex: 0,
            content: 'Imported',
            userName: 'Importer',
            likes: 0,
            createdAt: new Date().toISOString(),
          },
        ]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

describe('Static Routes', () => {
  describe('GET /health', () => {
    it('should return ok', async () => {
      const res = await request(server).get('/health');
      expect(res.status).toBe(200);
      expect(res.text).toBe('ok');
    });
  });

  describe('GET /', () => {
    it('should return index.html in full mode', async () => {
      const res = await request(server).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('GET /embed.js', () => {
    it('should return embed script', async () => {
      const res = await request(server).get('/embed.js');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('javascript');
    });
  });

  describe('GET /public/reader.html', () => {
    it('should return reader page', async () => {
      const res = await request(server).get('/public/reader.html');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('Legacy Routes', () => {
    it('should redirect /read to reader.html', async () => {
      const res = await request(server)
        .get('/read')
        .query({ url: 'https://example.com' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/public/reader.html');
      expect(res.headers.location).toContain('mode=reader');
    });

    it('should redirect /import to reader.html with raw mode', async () => {
      const res = await request(server)
        .get('/import')
        .query({ url: 'https://example.com' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/public/reader.html');
      expect(res.headers.location).toContain('mode=raw');
    });
  });
});

describe('CORS', () => {
  it('should handle OPTIONS preflight', async () => {
    const res = await request(server).options('/api/v1/comments');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('should include CORS headers in responses', async () => {
    const res = await request(server)
      .get('/api/v1/comments')
      .query({
        siteId: 'test',
        workId: 'test',
        chapterId: 'test',
      });

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
