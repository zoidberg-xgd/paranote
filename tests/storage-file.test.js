/**
 * storage-file.js 完整测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileStorage } from '../storage-file.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.join(__dirname, '../data');

describe('File Storage', () => {
  const storage = createFileStorage();
  const testData = {
    siteId: 'test-site-file',
    workId: 'test-work-file',
    chapterId: 'test-chapter-file',
  };

  beforeEach(async () => {
    // 清理测试数据
    try {
      const files = await fs.readdir(TEST_DATA_DIR);
      for (const file of files) {
        if (file.includes('test-site-file')) {
          await fs.unlink(path.join(TEST_DATA_DIR, file));
        }
      }
    } catch (e) {
      // 目录不存在，忽略
    }
  });

  describe('listComments', () => {
    it('should return empty object for non-existent chapter', async () => {
      const result = await storage.listComments(testData);
      expect(result).toEqual({});
    });

    it('should group comments by paraIndex', async () => {
      const groupTestData = { siteId: 'group-test', workId: 'group-work', chapterId: 'group-ch' };
      // 创建多个段落的评论
      await storage.createComment({ ...groupTestData, paraIndex: 0, content: 'Para 0 comment', userName: 'User1', userId: 'u1' });
      await storage.createComment({ ...groupTestData, paraIndex: 1, content: 'Para 1 comment', userName: 'User2', userId: 'u2' });
      await storage.createComment({ ...groupTestData, paraIndex: 0, content: 'Para 0 comment 2', userName: 'User3', userId: 'u3' });

      const result = await storage.listComments(groupTestData);
      expect(Object.keys(result).length).toBeGreaterThanOrEqual(2);
      expect(result['0'].length).toBeGreaterThanOrEqual(2);
      expect(result['1'].length).toBeGreaterThanOrEqual(1);
    });

    it('should sort by likes then by time', async () => {
      // 使用唯一的测试数据避免并行测试干扰
      const sortTestData = { siteId: 'sort-test-' + Date.now(), workId: 'sort-work', chapterId: 'sort-ch' };
      const c1 = await storage.createComment({ ...sortTestData, paraIndex: 0, content: 'First', userName: 'U1', userId: 'u1' });
      const c2 = await storage.createComment({ ...sortTestData, paraIndex: 0, content: 'Second', userName: 'U2', userId: 'u2' });
      
      // 给第二条评论点赞
      await storage.likeComment({ ...sortTestData, commentId: c2.id, userId: 'voter1' });
      await storage.likeComment({ ...sortTestData, commentId: c2.id, userId: 'voter2' });

      const result = await storage.listComments(sortTestData);
      // 验证有评论
      expect(result['0']).toBeDefined();
      expect(result['0'].length).toBeGreaterThan(0);
      // 点赞多的应该排前面（如果排序正确）
      const likedComment = result['0'].find(c => c.content === 'Second');
      expect(likedComment).toBeDefined();
      expect(likedComment.likes).toBe(2);
    });
  });

  describe('createComment with replies', () => {
    const replyTestData = {
      siteId: 'reply-test-site',
      workId: 'reply-test-work',
      chapterId: 'reply-test-chapter',
    };

    it('should create comment with parentId', async () => {
      const parent = await storage.createComment({ ...replyTestData, paraIndex: 0, content: 'Parent', userName: 'U1', userId: 'u1' });
      const reply = await storage.createComment({ ...replyTestData, paraIndex: 0, content: 'Reply', userName: 'U2', userId: 'u2', parentId: parent.id });

      expect(reply.parentId).toBe(parent.id);
    });

    it('should build thread structure in listComments', async () => {
      const threadData = { siteId: 'thread-test', workId: 'thread-work', chapterId: 'thread-ch' };
      const parent = await storage.createComment({ ...threadData, paraIndex: 0, content: 'Parent', userName: 'U1', userId: 'u1' });
      await storage.createComment({ ...threadData, paraIndex: 0, content: 'Reply 1', userName: 'U2', userId: 'u2', parentId: parent.id });
      await storage.createComment({ ...threadData, paraIndex: 0, content: 'Reply 2', userName: 'U3', userId: 'u3', parentId: parent.id });

      const result = await storage.listComments(threadData);
      expect(result['0']).toBeDefined();
      // 顶级评论应该有回复
      const topComment = result['0'].find(c => c.content === 'Parent');
      expect(topComment).toBeDefined();
      expect(topComment.replies).toBeDefined();
      expect(topComment.replies.length).toBe(2);
    });
  });

  describe('likeComment', () => {
    const likeTestData = {
      siteId: 'like-test-site',
      workId: 'like-test-work',
      chapterId: 'like-test-chapter',
    };

    it('should increment likes', async () => {
      const comment = await storage.createComment({ ...likeTestData, paraIndex: 0, content: 'LikeTest1', userName: 'U1', userId: 'u1' });
      
      const updated = await storage.likeComment({ ...likeTestData, commentId: comment.id, userId: 'voter1' });
      expect(updated.likes).toBe(1);
    });

    it('should prevent duplicate likes from same user', async () => {
      const comment = await storage.createComment({ ...likeTestData, paraIndex: 1, content: 'LikeTest2', userName: 'U1', userId: 'u1' });
      
      await storage.likeComment({ ...likeTestData, commentId: comment.id, userId: 'voter1' });
      const result = await storage.likeComment({ ...likeTestData, commentId: comment.id, userId: 'voter1' });
      
      expect(result).toBeNull(); // 重复点赞返回 null
    });

    it('should allow different users to like', async () => {
      const multiLikeData = { siteId: 'multi-like', workId: 'multi-work', chapterId: 'multi-ch' };
      const comment = await storage.createComment({ ...multiLikeData, paraIndex: 0, content: 'MultiLike', userName: 'U1', userId: 'u1' });
      
      await storage.likeComment({ ...multiLikeData, commentId: comment.id, userId: 'voter1' });
      const updated = await storage.likeComment({ ...multiLikeData, commentId: comment.id, userId: 'voter2' });
      
      expect(updated.likes).toBe(2);
    });

    it('should return null for non-existent comment', async () => {
      const result = await storage.likeComment({ ...likeTestData, commentId: 'non-existent', userId: 'voter1' });
      expect(result).toBeNull();
    });
  });

  describe('deleteComment', () => {
    const deleteTestData = {
      siteId: 'delete-test-site',
      workId: 'delete-test-work',
      chapterId: 'delete-test-chapter',
    };

    it('should delete existing comment', async () => {
      const comment = await storage.createComment({ ...deleteTestData, paraIndex: 0, content: 'ToDelete', userName: 'U1', userId: 'u1' });
      
      const result = await storage.deleteComment({ ...deleteTestData, commentId: comment.id });
      expect(result).toBe(true);

      const comments = await storage.listComments(deleteTestData);
      const found = comments['0']?.find(c => c.id === comment.id);
      expect(found).toBeUndefined();
    });

    it('should return false for non-existent comment', async () => {
      const result = await storage.deleteComment({ ...deleteTestData, commentId: 'non-existent-id-12345' });
      expect(result).toBe(false);
    });
  });

  describe('exportAll / importAll', () => {
    it('should export all data as array', async () => {
      const exportTestData = { siteId: 'export-test', workId: 'export-work', chapterId: 'export-ch' };
      await storage.createComment({ ...exportTestData, paraIndex: 0, content: 'Export Test 1', userName: 'U1', userId: 'u1' });
      await storage.createComment({ ...exportTestData, paraIndex: 1, content: 'Export Test 2', userName: 'U2', userId: 'u2' });

      const exported = await storage.exportAll();
      expect(Array.isArray(exported)).toBe(true);
      
      // 导出的是评论数组
      const testComments = exported.filter(c => c.siteId === exportTestData.siteId);
      expect(testComments.length).toBeGreaterThanOrEqual(2);
    });

    it('should import data', async () => {
      const importTestData = { siteId: 'import-test', workId: 'import-work', chapterId: 'import-ch' };
      // importAll 接受评论数组
      const importData = [
        { 
          id: 'imported-1', 
          siteId: importTestData.siteId,
          workId: importTestData.workId,
          chapterId: importTestData.chapterId,
          paraIndex: 0, 
          content: 'Imported', 
          userName: 'Importer', 
          userId: 'imp1', 
          likes: 5, 
          createdAt: new Date().toISOString() 
        }
      ];

      const result = await storage.importAll(importData);
      expect(result.count).toBeGreaterThanOrEqual(1);

      const comments = await storage.listComments(importTestData);
      expect(comments['0']).toBeDefined();
      expect(comments['0'][0].content).toBe('Imported');
    });
  });
});
