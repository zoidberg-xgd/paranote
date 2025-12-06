/**
 * 用户拉黑功能测试
 * 包括：存储层测试、API 层测试、权限验证测试
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createFileStorage } from '../storage-file.js';

// 设置测试环境变量 (必须在 import server 之前)
process.env.SITE_SECRETS = JSON.stringify({
  "ban-test-site": "ban-test-secret-key"
});
process.env.ADMIN_SECRET = "test-admin-secret-12345";

// 动态导入 server
const { server } = await import('../server.js');
import { initStorage } from '../storage.js';

describe('Ban Feature', () => {
  const storage = createFileStorage();
  
  // 每个测试使用唯一的 siteId 避免并行干扰
  let testCounter = 0;
  const getTestSiteId = () => `ban-storage-${Date.now()}-${++testCounter}-${Math.random().toString(36).slice(2)}`;

  describe('banUser', () => {
    it('should ban a user successfully', async () => {
      const siteId = getTestSiteId();
      const result = await storage.banUser({
        siteId,
        targetUserId: 'ip_abc123',
        reason: '垃圾评论',
        bannedBy: 'admin'
      });
      
      expect(result.success).toBe(true);
    });

    it('should ban anonymous user (IP-based)', async () => {
      const siteId = getTestSiteId();
      const result = await storage.banUser({
        siteId,
        targetUserId: 'ip_a1b2c3d4e5f6',
        reason: '恶意刷屏',
        bannedBy: 'admin'
      });
      
      expect(result.success).toBe(true);
      
      // 验证已被拉黑
      const isBanned = await storage.isUserBanned({ siteId, userId: 'ip_a1b2c3d4e5f6' });
      expect(isBanned).toBe(true);
    });

    it('should ban registered user', async () => {
      const siteId = getTestSiteId();
      const result = await storage.banUser({
        siteId,
        targetUserId: 'user-123',
        reason: '违规内容',
        bannedBy: 'moderator'
      });
      
      expect(result.success).toBe(true);
      
      const isBanned = await storage.isUserBanned({ siteId, userId: 'user-123' });
      expect(isBanned).toBe(true);
    });

    it('should allow banning without reason', async () => {
      const siteId = getTestSiteId();
      const result = await storage.banUser({
        siteId,
        targetUserId: 'ip_noreason',
        bannedBy: 'admin'
      });
      
      expect(result.success).toBe(true);
    });

    it('should update existing ban (re-ban)', async () => {
      const siteId = getTestSiteId();
      
      // 第一次拉黑
      await storage.banUser({
        siteId,
        targetUserId: 'ip_reban',
        reason: '原因1',
        bannedBy: 'admin1'
      });
      
      // 第二次拉黑（更新）
      const result = await storage.banUser({
        siteId,
        targetUserId: 'ip_reban',
        reason: '原因2',
        bannedBy: 'admin2'
      });
      
      expect(result.success).toBe(true);
      
      // 验证只有一条记录
      const list = await storage.listBannedUsers({ siteId });
      const bans = list.filter(b => b.userId === 'ip_reban');
      expect(bans.length).toBe(1);
      expect(bans[0].reason).toBe('原因2');
    });
  });

  describe('unbanUser', () => {
    it('should unban a user successfully', async () => {
      const siteId = getTestSiteId();
      
      // 先拉黑
      await storage.banUser({
        siteId,
        targetUserId: 'ip_tounban',
        reason: 'test',
        bannedBy: 'admin'
      });
      
      // 解除拉黑
      const result = await storage.unbanUser({ siteId, targetUserId: 'ip_tounban' });
      expect(result.success).toBe(true);
      
      // 验证已解除
      const isBanned = await storage.isUserBanned({ siteId, userId: 'ip_tounban' });
      expect(isBanned).toBe(false);
    });

    it('should return error for non-existent ban', async () => {
      const siteId = getTestSiteId();
      const result = await storage.unbanUser({ siteId, targetUserId: 'non-existent-user' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_found');
    });
  });

  describe('isUserBanned', () => {
    it('should return false for non-banned user', async () => {
      const siteId = getTestSiteId();
      const isBanned = await storage.isUserBanned({ siteId, userId: 'innocent-user' });
      expect(isBanned).toBe(false);
    });

    it('should return true for banned user', async () => {
      const siteId = getTestSiteId();
      
      await storage.banUser({
        siteId,
        targetUserId: 'bad-user',
        reason: 'spam',
        bannedBy: 'admin'
      });
      
      const isBanned = await storage.isUserBanned({ siteId, userId: 'bad-user' });
      expect(isBanned).toBe(true);
    });

    it('should isolate bans by siteId', async () => {
      const siteId1 = getTestSiteId();
      const siteId2 = getTestSiteId();
      
      // 在 site1 拉黑
      await storage.banUser({
        siteId: siteId1,
        targetUserId: 'cross-site-user',
        reason: 'test',
        bannedBy: 'admin'
      });
      
      // site1 应该被拉黑
      const isBannedSite1 = await storage.isUserBanned({ siteId: siteId1, userId: 'cross-site-user' });
      expect(isBannedSite1).toBe(true);
      
      // site2 不应该被拉黑
      const isBannedSite2 = await storage.isUserBanned({ siteId: siteId2, userId: 'cross-site-user' });
      expect(isBannedSite2).toBe(false);
    });
  });

  describe('listBannedUsers', () => {
    it('should return empty array for site with no bans', async () => {
      const siteId = getTestSiteId();
      const list = await storage.listBannedUsers({ siteId });
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(0);
    });

    it('should list all banned users for a site', async () => {
      const siteId = getTestSiteId();
      
      // 串行执行避免文件写入竞争条件
      await storage.banUser({ siteId, targetUserId: 'list-user1', reason: 'r1', bannedBy: 'admin' });
      await storage.banUser({ siteId, targetUserId: 'list-user2', reason: 'r2', bannedBy: 'admin' });
      await storage.banUser({ siteId, targetUserId: 'list-user3', reason: 'r3', bannedBy: 'admin' });
      
      const list = await storage.listBannedUsers({ siteId });
      expect(list.length).toBe(3);
      
      const userIds = list.map(b => b.userId);
      expect(userIds).toContain('list-user1');
      expect(userIds).toContain('list-user2');
      expect(userIds).toContain('list-user3');
    });

    it('should include ban metadata', async () => {
      const siteId = getTestSiteId();
      
      await storage.banUser({
        siteId,
        targetUserId: 'meta-user',
        reason: '测试原因',
        bannedBy: 'test-admin'
      });
      
      const list = await storage.listBannedUsers({ siteId });
      const ban = list.find(b => b.userId === 'meta-user');
      
      expect(ban).toBeDefined();
      expect(ban.reason).toBe('测试原因');
      expect(ban.bannedBy).toBe('test-admin');
      expect(ban.bannedAt).toBeDefined();
    });
  });
});

/**
 * API 层拉黑功能测试
 */
describe('Ban API', () => {
  const SITE_ID = 'ban-test-site';
  const SECRET = 'ban-test-secret-key';
  const ADMIN_SECRET = 'test-admin-secret-12345';
  const WORK_ID = 'ban-test-work';
  const CHAPTER_ID = 'ban-ch-1';

  beforeAll(async () => {
    await initStorage();
  });

  // 生成唯一用户 ID 避免测试干扰
  const getUniqueUserId = () => `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  describe('POST /api/v1/ban - 拉黑用户', () => {
    describe('权限验证', () => {
      it('应拒绝无权限的拉黑请求', async () => {
        const res = await request(server)
          .post('/api/v1/ban')
          .send({
            siteId: SITE_ID,
            targetUserId: 'some-user',
          });
        
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('permission_denied');
      });

      it('应拒绝错误的管理员密钥', async () => {
        const res = await request(server)
          .post('/api/v1/ban')
          .set('x-admin-secret', 'wrong-secret')
          .send({
            siteId: SITE_ID,
            targetUserId: 'some-user',
          });
        
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('permission_denied');
      });

      it('应接受正确的管理员密钥', async () => {
        const targetUserId = getUniqueUserId();
        const res = await request(server)
          .post('/api/v1/ban')
          .set('x-admin-secret', ADMIN_SECRET)
          .send({
            siteId: SITE_ID,
            targetUserId,
            reason: '测试拉黑',
          });
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('应接受 JWT admin 角色', async () => {
        const targetUserId = getUniqueUserId();
        const token = jwt.sign(
          { siteId: SITE_ID, sub: 'admin-user', role: 'admin' },
          SECRET,
          { algorithm: 'HS256' }
        );
        
        const res = await request(server)
          .post('/api/v1/ban')
          .set('X-Paranote-Token', token)
          .send({
            siteId: SITE_ID,
            targetUserId,
            reason: 'JWT admin 拉黑',
          });
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('应接受 JWT isAdmin=true', async () => {
        const targetUserId = getUniqueUserId();
        const token = jwt.sign(
          { siteId: SITE_ID, sub: 'admin-user-2', isAdmin: true },
          SECRET,
          { algorithm: 'HS256' }
        );
        
        const res = await request(server)
          .post('/api/v1/ban')
          .set('X-Paranote-Token', token)
          .send({
            siteId: SITE_ID,
            targetUserId,
          });
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('应接受 JWT isAuthor=true (作者权限)', async () => {
        const targetUserId = getUniqueUserId();
        const token = jwt.sign(
          { siteId: SITE_ID, sub: 'author-user', isAuthor: true },
          SECRET,
          { algorithm: 'HS256' }
        );
        
        const res = await request(server)
          .post('/api/v1/ban')
          .set('X-Paranote-Token', token)
          .send({
            siteId: SITE_ID,
            targetUserId,
            reason: '作者拉黑',
          });
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('应拒绝普通用户的拉黑请求', async () => {
        const token = jwt.sign(
          { siteId: SITE_ID, sub: 'normal-user', name: 'Normal' },
          SECRET,
          { algorithm: 'HS256' }
        );
        
        const res = await request(server)
          .post('/api/v1/ban')
          .set('X-Paranote-Token', token)
          .send({
            siteId: SITE_ID,
            targetUserId: 'target-user',
          });
        
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('permission_denied');
      });
    });

    describe('参数验证', () => {
      it('应拒绝缺少 siteId', async () => {
        const res = await request(server)
          .post('/api/v1/ban')
          .set('x-admin-secret', ADMIN_SECRET)
          .send({
            targetUserId: 'some-user',
          });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('missing_fields');
      });

      it('应拒绝缺少 targetUserId', async () => {
        const res = await request(server)
          .post('/api/v1/ban')
          .set('x-admin-secret', ADMIN_SECRET)
          .send({
            siteId: SITE_ID,
          });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('missing_fields');
      });

      it('应接受不带 reason 的请求', async () => {
        const targetUserId = getUniqueUserId();
        const res = await request(server)
          .post('/api/v1/ban')
          .set('x-admin-secret', ADMIN_SECRET)
          .send({
            siteId: SITE_ID,
            targetUserId,
          });
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    });
  });

  describe('DELETE /api/v1/ban - 解除拉黑', () => {
    it('应成功解除拉黑', async () => {
      const targetUserId = getUniqueUserId();
      
      // 先拉黑
      const banRes = await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId });
      
      expect(banRes.status).toBe(200);
      expect(banRes.body.success).toBe(true);
      
      // 解除拉黑
      const res = await request(server)
        .delete('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('应返回 404 对于不存在的拉黑记录', async () => {
      const res = await request(server)
        .delete('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId: 'non-existent-user-xyz' });
      
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('应拒绝无权限的解除请求', async () => {
      const res = await request(server)
        .delete('/api/v1/ban')
        .send({ siteId: SITE_ID, targetUserId: 'some-user' });
      
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('permission_denied');
    });

    it('作者应能解除拉黑', async () => {
      const targetUserId = getUniqueUserId();
      
      // 先拉黑
      await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId });
      
      // 作者解除
      const token = jwt.sign(
        { siteId: SITE_ID, sub: 'author-unban', isAuthor: true },
        SECRET,
        { algorithm: 'HS256' }
      );
      
      const res = await request(server)
        .delete('/api/v1/ban')
        .set('X-Paranote-Token', token)
        .send({ siteId: SITE_ID, targetUserId });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/ban - 获取黑名单', () => {
    it('应返回黑名单列表', async () => {
      const res = await request(server)
        .get('/api/v1/ban')
        .query({ siteId: SITE_ID })
        .set('x-admin-secret', ADMIN_SECRET);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.bannedUsers)).toBe(true);
    });

    it('应拒绝无权限的请求', async () => {
      const res = await request(server)
        .get('/api/v1/ban')
        .query({ siteId: SITE_ID });
      
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('permission_denied');
    });

    it('应拒绝缺少 siteId', async () => {
      const res = await request(server)
        .get('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET);
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('missing_params');
    });

    it('管理员应能查看黑名单', async () => {
      const token = jwt.sign(
        { siteId: SITE_ID, sub: 'admin-viewer', role: 'admin' },
        SECRET,
        { algorithm: 'HS256' }
      );
      
      const res = await request(server)
        .get('/api/v1/ban')
        .query({ siteId: SITE_ID })
        .set('X-Paranote-Token', token);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.bannedUsers)).toBe(true);
    });
  });

  describe('被拉黑用户评论限制', () => {
    it('被拉黑用户应无法发表评论', async () => {
      const targetUserId = getUniqueUserId();
      
      // 先拉黑该用户
      await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId, reason: '测试限制' });
      
      // 使用该用户身份尝试评论
      const token = jwt.sign(
        { siteId: SITE_ID, sub: targetUserId, name: 'Banned User' },
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
          paraIndex: 0,
          content: '我被拉黑了还能评论吗？',
        });
      
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('user_banned');
      expect(res.body.message).toBe('您已被禁止评论');
    });

    it('解除拉黑后用户应能评论', async () => {
      const targetUserId = getUniqueUserId();
      
      // 拉黑
      await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId });
      
      // 解除拉黑
      await request(server)
        .delete('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId });
      
      // 尝试评论
      const token = jwt.sign(
        { siteId: SITE_ID, sub: targetUserId, name: 'Unbanned User' },
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
          content: '解除拉黑后的评论',
        });
      
      expect(res.status).toBe(201);
      expect(res.body.content).toBe('解除拉黑后的评论');
    });

    it('拉黑应按站点隔离', async () => {
      const targetUserId = getUniqueUserId();
      const otherSiteId = 'other-site-' + Date.now();
      
      // 在 ban-test-site 拉黑
      await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId });
      
      // 在 ban-test-site 应该被拒绝
      const token = jwt.sign(
        { siteId: SITE_ID, sub: targetUserId, name: 'Cross Site User' },
        SECRET,
        { algorithm: 'HS256' }
      );
      
      const res1 = await request(server)
        .post('/api/v1/comments')
        .set('X-Paranote-Token', token)
        .send({
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 2,
          content: '测试',
        });
      
      expect(res1.status).toBe(403);
      expect(res1.body.error).toBe('user_banned');
      
      // 在其他站点应该可以评论（匿名方式，因为没有配置 secret）
      const res2 = await request(server)
        .post('/api/v1/comments')
        .send({
          siteId: otherSiteId,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 3,
          content: '其他站点评论',
        });
      
      // 其他站点没有配置 secret，所以 JWT 验证会失败，回退到匿名
      // 但匿名用户的 userId 是基于 IP 的，不是 targetUserId
      // 所以应该能成功
      expect(res2.status).toBe(201);
    });
  });

  describe('匿名用户拉黑 (IP-based)', () => {
    it('应能拉黑匿名用户 (ip_ 前缀)', async () => {
      const ipUserId = `ip_${Date.now()}abc123`;
      
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({
          siteId: SITE_ID,
          targetUserId: ipUserId,
          reason: '匿名垃圾评论',
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // 验证在黑名单中
      const listRes = await request(server)
        .get('/api/v1/ban')
        .query({ siteId: SITE_ID })
        .set('x-admin-secret', ADMIN_SECRET);
      
      const banned = listRes.body.bannedUsers.find(b => b.userId === ipUserId);
      expect(banned).toBeDefined();
      expect(banned.reason).toBe('匿名垃圾评论');
    });
  });

  describe('边界情况', () => {
    it('重复拉黑同一用户应更新记录', async () => {
      const targetUserId = getUniqueUserId();
      
      // 第一次拉黑
      await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId, reason: '原因1' });
      
      // 第二次拉黑（更新原因）
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ siteId: SITE_ID, targetUserId, reason: '原因2' });
      
      expect(res.status).toBe(200);
      
      // 验证只有一条记录且原因已更新
      const listRes = await request(server)
        .get('/api/v1/ban')
        .query({ siteId: SITE_ID })
        .set('x-admin-secret', ADMIN_SECRET);
      
      const bans = listRes.body.bannedUsers.filter(b => b.userId === targetUserId);
      expect(bans.length).toBe(1);
      expect(bans[0].reason).toBe('原因2');
    });

    it('空请求体应返回错误', async () => {
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('missing_fields');
    });

    it('无效 JSON 应返回错误', async () => {
      const res = await request(server)
        .post('/api/v1/ban')
        .set('x-admin-secret', ADMIN_SECRET)
        .set('Content-Type', 'application/json')
        .send('not valid json');
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_json');
    });
  });
});
