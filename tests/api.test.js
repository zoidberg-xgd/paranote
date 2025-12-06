import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// 设置测试环境变量 (必须在 import server 之前)
process.env.SITE_SECRETS = JSON.stringify({
  "test-site": "my-secret-key"
});

// 动态导入 server (确保 env 已生效)
const { server } = await import('../server.js');

describe('ParaNote API Tests', () => {
  const SITE_ID = 'test-site';
  const SECRET = 'my-secret-key';
  const WORK_ID = 'test-work';
  const CHAPTER_ID = 'ch-1';

  it('should allow anonymous comments', async () => {
    const res = await request(server)
      .post('/api/v1/comments')
      .send({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 0,
        content: 'Hello World',
        userName: 'Guest' // 用户自己填写的名字
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      siteId: SITE_ID,
      content: 'Hello World',
      userName: 'Guest'
    });
    // 现在匿名用户也会根据 IP 生成 userId
    expect(res.body.userId).toMatch(/^ip_/);
  });

  it('should verify JWT and identify user', async () => {
    // 生成 JWT
    const payload = {
      siteId: SITE_ID,
      sub: 'user-123', // userId
      name: 'Verified User',
      avatar: 'http://example.com/avatar.png'
    };
    const token = jwt.sign(payload, SECRET, { algorithm: 'HS256' });

    const res = await request(server)
      .post('/api/v1/comments')
      .set('X-Paranote-Token', token)
      .send({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 1,
        content: 'I am verified'
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userName: 'Verified User',
      userId: 'user-123',
      userAvatar: 'http://example.com/avatar.png'
    });
  });

  it('should reject invalid JWT signature but still allow comment as anonymous (fallback)', async () => {
    // 使用错误的密钥签名
    const token = jwt.sign({ siteId: SITE_ID, name: 'Hacker' }, 'wrong-key', { algorithm: 'HS256' });

    const res = await request(server)
      .post('/api/v1/comments')
      .set('X-Paranote-Token', token)
      .send({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 2,
        content: 'Trying to hack'
      });

    // verifyJwt 失败返回 null，代码会回退到 IP 生成的访客身份
    expect(res.status).toBe(201);
    expect(res.body.userName).toMatch(/^访客-/); // 自动生成访客名称
    expect(res.body.userId).toMatch(/^ip_/);
  });

  it('should enforce one like per user', async () => {
    // 1. 先发一条评论
    const commentRes = await request(server)
      .post('/api/v1/comments')
      .send({
        siteId: SITE_ID,
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        paraIndex: 3,
        content: 'Like me'
      });
    const commentId = commentRes.body.id;

    // 2. 生成用户 Token
    const token = jwt.sign({ siteId: SITE_ID, sub: 'user-like-test' }, SECRET, { algorithm: 'HS256' });

    // 3. 第一次点赞
    const likeRes1 = await request(server)
      .post('/api/v1/comments/like')
      .set('X-Paranote-Token', token)
      .send({ siteId: SITE_ID, workId: WORK_ID, chapterId: CHAPTER_ID, commentId });
    
    expect(likeRes1.status).toBe(200);
    expect(likeRes1.body.likes).toBe(1);

    // 4. 第二次点赞 (应失败或不增加)
    const likeRes2 = await request(server)
      .post('/api/v1/comments/like')
      .set('X-Paranote-Token', token)
      .send({ siteId: SITE_ID, workId: WORK_ID, chapterId: CHAPTER_ID, commentId });
    
    expect(likeRes2.status).toBe(400); // already_liked
  });
  
  it('should allow like without login (IP based)', async () => {
      const commentRes = await request(server)
        .post('/api/v1/comments')
        .send({ siteId: SITE_ID, workId: WORK_ID, chapterId: CHAPTER_ID, paraIndex: 4, content: 'Anon Like' });
      
      const likeRes = await request(server)
        .post('/api/v1/comments/like')
        .send({ siteId: SITE_ID, workId: WORK_ID, chapterId: CHAPTER_ID, commentId: commentRes.body.id });
        
      expect(likeRes.status).toBe(200);
      expect(likeRes.body.likes).toBe(1);
  });
});
