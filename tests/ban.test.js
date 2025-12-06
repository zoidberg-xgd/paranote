/**
 * 用户拉黑功能测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createFileStorage } from '../storage-file.js';

describe('Ban Feature', () => {
  const storage = createFileStorage();
  
  // 每个测试使用唯一的 siteId 避免并行干扰
  const getTestSiteId = () => `ban-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
      
      await storage.banUser({ siteId, targetUserId: 'user1', reason: 'r1', bannedBy: 'admin' });
      await storage.banUser({ siteId, targetUserId: 'user2', reason: 'r2', bannedBy: 'admin' });
      await storage.banUser({ siteId, targetUserId: 'user3', reason: 'r3', bannedBy: 'admin' });
      
      const list = await storage.listBannedUsers({ siteId });
      expect(list.length).toBe(3);
      
      const userIds = list.map(b => b.userId);
      expect(userIds).toContain('user1');
      expect(userIds).toContain('user2');
      expect(userIds).toContain('user3');
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
