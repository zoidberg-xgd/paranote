/**
 * 拉黑 API 端点测试
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// 设置测试环境变量
process.env.ADMIN_SECRET = 'test-admin-secret';
process.env.SITE_SECRETS = JSON.stringify({
  "ban-api-test": "ban-secret-key"
});

const { server } = await import('../server.js');

describe('Ban API', () => {
  const SITE_ID = 'ban-api-test';
  const SECRET = 'ban-secret-key';
  const ADMIN_SECRET = 'test-admin-secret';
  
  // 生成唯一 ID 避免测试干扰
  const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  describe('POST /api/v1/ban - Ban User', () => {
    it('should ban user with admin secret', async () => {
      const targetUserId = `ip_${uniqueId()}`;
      
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({
          siteId: SITE_ID,
          targetUserId,
          reason: '测试拉黑'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should ban user with admin JWT', async () => {
      const targetUserId = `ip_${uniqueId()}`;
      const token = jwt.sign({
        siteId: SITE_ID,
        sub: 'admin-user',
        role: 'admin'
      }, SECRET);
      
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-paranote-token', token)
        .send({
          siteId: SITE_ID,
          targetUserId,
          reason: 'JWT admin ban'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should ban user with author JWT', async () => {
      const targetUserId = `ip_${uniqueId()}`;
      const token = jwt.sign({
        siteId: SITE_ID,
        sub: 'author-user',
        isAuthor: true
      }, SECRET);
      
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-paranote-token', token)
        .send({
          siteId: SITE_ID,
          targetUserId,
          reason: 'Author ban'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject ban without permission', async () => {
      const res = await request(server)
        .post('/api/v1/ban')
        .send({
          siteId: SITE_ID,
          targetUserId: 'some-user',
          reason: 'Unauthorized'
        });
      
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('permission_denied');
    });

    it('should reject ban with regular user JWT', async () => {
      const token = jwt.sign({
        siteId: SITE_ID,
        sub: 'regular-user',
        name: 'Regular User'
      }, SECRET);
      
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-paranote-token', token)
        .send({
          siteId: SITE_ID,
          targetUserId: 'some-user'
        });
      
      expect(res.status).toBe(403);
    });

    it('should require siteId and targetUserId', async () => {
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({
          siteId: SITE_ID
          // missing targetUserId
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('missing_fields');
    });
  });

  describe('DELETE /api/v1/ban - Unban User', () => {
    it('should unban user with admin secret', async () => {
      const targetUserId = `ip_${uniqueId()}`;
      
      // 先拉黑
      await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId });
      
      // 解除拉黑
      const res = await request(server)
        .delete('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent ban', async () => {
      const res = await request(server)
        .delete('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({
          siteId: SITE_ID,
          targetUserId: 'never-banned-user'
        });
      
      expect(res.status).toBe(404);
    });

    it('should reject unban without permission', async () => {
      const res = await request(server)
        .delete('/api/v1/ban')
        .send({
          siteId: SITE_ID,
          targetUserId: 'some-user'
        });
      
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/ban - List Banned Users', () => {
    it('should list banned users with admin secret', async () => {
      const res = await request(server)
        .get('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .query({ siteId: SITE_ID });
      
      expect(res.status).toBe(200);
      expect(res.body.bannedUsers).toBeDefined();
      expect(Array.isArray(res.body.bannedUsers)).toBe(true);
    });

    it('should require siteId', async () => {
      const res = await request(server)
        .get('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET);
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('missing_params');
    });

    it('should reject list without permission', async () => {
      const res = await request(server)
        .get('/api/v1/ban')
        .query({ siteId: SITE_ID });
      
      expect(res.status).toBe(403);
    });
  });

  describe('Banned User Cannot Comment', () => {
    it('should block banned user from commenting', async () => {
      const bannedSiteId = `banned-comment-test-${uniqueId()}`;
      
      // 创建一条评论获取 IP-based userId
      const commentRes = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: bannedSiteId,
          workId: 'test-work',
          chapterId: 'test-ch',
          paraIndex: 0,
          content: 'First comment'
        });
      
      expect(commentRes.status).toBe(201);
      const userId = commentRes.body.userId;
      expect(userId).toMatch(/^ip_/);
      
      // 拉黑该用户
      const banRes = await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({
          siteId: bannedSiteId,
          targetUserId: userId,
          reason: 'Test ban'
        });
      
      expect(banRes.status).toBe(200);
      
      // 尝试再次评论（同一 IP，应该被阻止）
      const blockedRes = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: bannedSiteId,
          workId: 'test-work',
          chapterId: 'test-ch',
          paraIndex: 1,
          content: 'Should be blocked'
        });
      
      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.error).toBe('user_banned');
    });

    it('should allow commenting after unban', async () => {
      const unbanSiteId = `unban-comment-test-${uniqueId()}`;
      
      // 创建评论获取 userId
      const commentRes = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: unbanSiteId,
          workId: 'test-work',
          chapterId: 'test-ch',
          paraIndex: 0,
          content: 'First'
        });
      
      const userId = commentRes.body.userId;
      
      // 拉黑
      await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: unbanSiteId, targetUserId: userId });
      
      // 解除拉黑
      await request(server)
        .delete('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: unbanSiteId, targetUserId: userId });
      
      // 应该可以再次评论
      const allowedRes = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: unbanSiteId,
          workId: 'test-work',
          chapterId: 'test-ch',
          paraIndex: 1,
          content: 'After unban'
        });
      
      expect(allowedRes.status).toBe(201);
    });
  });

  describe('Delete Comment with Admin Secret', () => {
    it('should delete comment with admin secret', async () => {
      const deleteSiteId = `delete-test-${uniqueId()}`;
      
      // 创建评论
      const commentRes = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: deleteSiteId,
          workId: 'test-work',
          chapterId: 'test-ch',
          paraIndex: 0,
          content: 'To be deleted'
        });
      
      const commentId = commentRes.body.id;
      
      // 使用 admin secret 删除
      const deleteRes = await request(server)
        .delete('/api/v1/comments')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({
          siteId: deleteSiteId,
          workId: 'test-work',
          chapterId: 'test-ch',
          commentId
        });
      
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
    });
  });
});
