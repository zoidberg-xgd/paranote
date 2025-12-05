/**
 * storage-file.js 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import storage
import { createFileStorage } from '../storage-file.js';

describe('File Storage', () => {
  let storage;
  // 使用唯一的 ID 避免测试之间冲突
  const SITE_ID = `test-site-${Date.now()}`;
  const WORK_ID = `test-work-${Date.now()}`;
  const CHAPTER_ID = `test-chapter-${Date.now()}`;

  beforeEach(async () => {
    storage = createFileStorage();
  });

  afterEach(async () => {
    // 清理测试数据
    const DATA_DIR = path.join(__dirname, '..', 'data');
    try {
      const files = await fs.readdir(DATA_DIR);
      for (const file of files) {
        if (file.includes('test-site-') || file.includes('test-work-')) {
          await fs.unlink(path.join(DATA_DIR, file));
        }
      }
    } catch {}
  });

  describe('createComment', () => {
    it('should create a comment with auto-generated fields', async () => {
      const comment = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Test comment',
        userName: 'Tester',
      });

      expect(comment).toMatchObject({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Test comment',
        userName: 'Tester',
        likes: 0,
      });
      expect(comment.id).toBeDefined();
      expect(comment.createdAt).toBeDefined();
    });

    it('should generate unique IDs', async () => {
      const comment1 = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Comment 1',
        userName: 'User',
      });

      const comment2 = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Comment 2',
        userName: 'User',
      });

      expect(comment1.id).not.toBe(comment2.id);
    });
  });

  describe('listComments', () => {
    it('should return empty object for no comments', async () => {
      const result = await storage.listComments({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
      });

      expect(result).toEqual({});
    });

    it('should group comments by paraIndex', async () => {
      await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Para 0 comment',
        userName: 'User',
      });

      await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 1,
        content: 'Para 1 comment',
        userName: 'User',
      });

      await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Another para 0 comment',
        userName: 'User',
      });

      const result = await storage.listComments({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
      });

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['0']).toHaveLength(2);
      expect(result['1']).toHaveLength(1);
    });

    it('should sort by likes descending', async () => {
      const c1 = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Low likes',
        userName: 'User',
      });

      const c2 = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'High likes',
        userName: 'User',
      });

      // Like c2 multiple times
      await storage.likeComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        commentId: c2.id,
        userId: 'user-1',
      });
      await storage.likeComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        commentId: c2.id,
        userId: 'user-2',
      });

      const result = await storage.listComments({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
      });

      // High likes should come first
      expect(result['0'][0].content).toBe('High likes');
    });
  });

  describe('likeComment', () => {
    it('should increment likes', async () => {
      const comment = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Like me',
        userName: 'User',
      });

      const updated = await storage.likeComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        commentId: comment.id,
        userId: 'user-1',
      });

      expect(updated.likes).toBe(1);
    });

    it('should prevent duplicate likes from same user', async () => {
      const comment = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Like me',
        userName: 'User',
      });

      await storage.likeComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        commentId: comment.id,
        userId: 'user-1',
      });

      const secondLike = await storage.likeComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        commentId: comment.id,
        userId: 'user-1',
      });

      expect(secondLike).toBeNull();
    });

    it('should return null for non-existent comment', async () => {
      const result = await storage.likeComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        commentId: 'non-existent',
        userId: 'user-1',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteComment', () => {
    it('should delete existing comment', async () => {
      const comment = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Delete me',
        userName: 'User',
      });

      const success = await storage.deleteComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        commentId: comment.id,
      });

      expect(success).toBe(true);

      const result = await storage.listComments({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
      });

      expect(result).toEqual({});
    });

    it('should return false for non-existent comment', async () => {
      const success = await storage.deleteComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        commentId: 'non-existent',
      });

      expect(success).toBe(false);
    });
  });

  describe('exportAll / importAll', () => {
    it('should export all comments', async () => {
      // 创建两条评论
      const c1 = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Export Comment 1',
        userName: 'User',
      });

      const c2 = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID + '-2',
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Export Comment 2',
        userName: 'User',
      });

      const exported = await storage.exportAll();

      // 验证我们创建的评论在导出结果中
      const ourComments = exported.filter(c => 
        c.id === c1.id || c.id === c2.id
      );
      expect(ourComments).toHaveLength(2);
    });

    it('should import comments', async () => {
      const comments = [
        {
          id: 'import-1',
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 0,
          content: 'Imported 1',
          userName: 'User',
          likes: 5,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'import-2',
          siteId: SITE_ID,
          workId: WORK_ID,
          chapterId: CHAPTER_ID,
          paraIndex: 1,
          content: 'Imported 2',
          userName: 'User',
          likes: 3,
          createdAt: new Date().toISOString(),
        },
      ];

      const result = await storage.importAll(comments);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      const listed = await storage.listComments({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
      });

      expect(listed['0']).toHaveLength(1);
      expect(listed['1']).toHaveLength(1);
    });

    it('should update existing comments on import', async () => {
      const original = await storage.createComment({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Original',
        userName: 'User',
      });

      await storage.importAll([
        {
          ...original,
          content: 'Updated',
        },
      ]);

      const listed = await storage.listComments({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
      });

      expect(listed['0'][0].content).toBe('Updated');
    });
  });
});
