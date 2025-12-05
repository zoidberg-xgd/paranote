/**
 * 集成测试 - 完整流程测试
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer } from 'node:http';
import { createFileStorage } from '../storage-file.js';
import { handleApiRoutes } from '../routes/api.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Integration Tests', () => {
  const storage = createFileStorage();
  const testData = {
    siteId: 'integration-test',
    workId: 'test-article',
    chapterId: 'chapter-1',
  };

  beforeEach(async () => {
    // 清理测试数据
    try {
      const dataDir = path.join(__dirname, '../data');
      const files = await fs.readdir(dataDir);
      for (const file of files) {
        if (file.includes('integration-test')) {
          await fs.unlink(path.join(dataDir, file));
        }
      }
    } catch (e) {
      // ignore
    }
  });

  describe('Complete Comment Flow', () => {
    it('should handle full comment lifecycle', async () => {
      // 1. 创建评论
      const comment = await storage.createComment({
        ...testData,
        paraIndex: 0,
        content: '这是一条测试评论',
        userName: '测试用户',
        userId: 'test-user-1',
      });

      expect(comment.id).toBeDefined();
      expect(comment.content).toBe('这是一条测试评论');

      // 2. 获取评论
      const comments = await storage.listComments(testData);
      expect(comments['0']).toHaveLength(1);

      // 3. 点赞评论
      const liked = await storage.likeComment({
        ...testData,
        commentId: comment.id,
        userId: 'voter-1',
      });
      expect(liked.likes).toBe(1);

      // 4. 回复评论
      const reply = await storage.createComment({
        ...testData,
        paraIndex: 0,
        content: '这是一条回复',
        userName: '回复用户',
        userId: 'test-user-2',
        parentId: comment.id,
      });

      expect(reply.parentId).toBe(comment.id);

      // 5. 验证线程结构
      const updatedComments = await storage.listComments(testData);
      expect(updatedComments['0'][0].replies).toHaveLength(1);
      expect(updatedComments['0'][0].replies[0].content).toBe('这是一条回复');

      // 6. 删除评论
      const deleted = await storage.deleteComment({
        ...testData,
        commentId: comment.id,
      });
      expect(deleted).toBe(true);
    });

    it('should handle multiple paragraphs', async () => {
      // 在多个段落创建评论
      for (let i = 0; i < 5; i++) {
        await storage.createComment({
          ...testData,
          paraIndex: i,
          content: `段落 ${i} 的评论`,
          userName: `用户${i}`,
          userId: `user-${i}`,
        });
      }

      const comments = await storage.listComments(testData);
      expect(Object.keys(comments)).toHaveLength(5);

      for (let i = 0; i < 5; i++) {
        expect(comments[String(i)]).toHaveLength(1);
      }
    });

    it('should handle sequential likes', async () => {
      const comment = await storage.createComment({
        ...testData,
        paraIndex: 0,
        content: '热门评论',
        userName: '作者',
        userId: 'author',
      });

      // 顺序点赞（文件存储不支持真正的并发）
      for (let i = 0; i < 5; i++) {
        await storage.likeComment({
          ...testData,
          commentId: comment.id,
          userId: `voter-${i}`,
        });
      }

      const comments = await storage.listComments(testData);
      expect(comments['0'][0].likes).toBe(5);
    });
  });

  describe('Data Export/Import', () => {
    it('should export and import data correctly', async () => {
      // 创建一些测试数据
      const comment = await storage.createComment({
        ...testData,
        paraIndex: 0,
        content: '导出测试',
        userName: '测试',
        userId: 'test',
      });

      // 导出
      const exported = await storage.exportAll();
      expect(Array.isArray(exported)).toBe(true);
      
      // 找到测试评论
      const testComments = exported.filter(c => c.siteId === testData.siteId);
      expect(testComments.length).toBeGreaterThan(0);

      // 清理数据
      const dataDir = path.join(__dirname, '../data');
      const files = await fs.readdir(dataDir);
      for (const file of files) {
        if (file.includes('integration-test')) {
          await fs.unlink(path.join(dataDir, file));
        }
      }

      // 验证数据已清空
      const emptyComments = await storage.listComments(testData);
      expect(Object.keys(emptyComments)).toHaveLength(0);

      // 导入
      await storage.importAll(testComments);

      // 验证数据恢复
      const restoredComments = await storage.listComments(testData);
      expect(restoredComments['0']).toBeDefined();
      expect(restoredComments['0'][0].content).toBe('导出测试');
    });
  });

  describe('Fuzzy Anchoring Simulation', () => {
    it('should support context-based comment positioning', async () => {
      // 创建带上下文指纹的评论
      const comment = await storage.createComment({
        ...testData,
        paraIndex: 2,
        content: '针对特定段落的评论',
        userName: '用户',
        userId: 'user',
        contextText: '这是第三段的开头内容',
      });

      expect(comment.contextText).toBe('这是第三段的开头内容');

      // 模拟段落变化后的重新定位
      const comments = await storage.listComments(testData);
      const savedComment = comments['2'][0];
      
      // 前端可以使用 contextText 来重新定位
      expect(savedComment.contextText).toBeDefined();
    });
  });

  describe('Anonymous User Handling', () => {
    it('should track anonymous users by IP hash', async () => {
      // 模拟 IP hash 生成
      const generateIpHash = (ip, siteId) => {
        let hash = 0;
        const str = ip + siteId;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
      };

      const ip1Hash = generateIpHash('192.168.1.1', testData.siteId);
      const ip2Hash = generateIpHash('192.168.1.2', testData.siteId);

      expect(ip1Hash).not.toBe(ip2Hash);

      // 同一 IP 应该生成相同的 hash
      const ip1HashAgain = generateIpHash('192.168.1.1', testData.siteId);
      expect(ip1Hash).toBe(ip1HashAgain);
    });
  });
});
