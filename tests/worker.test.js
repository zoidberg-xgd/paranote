import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../worker/index.js';
import { MongoAtlas } from '../worker/mongo.js';
import * as utils from '../worker/utils.js';

// Mock MongoAtlas
vi.mock('../worker/mongo.js', () => {
  const MongoAtlasMock = vi.fn();
  MongoAtlasMock.prototype.find = vi.fn();
  MongoAtlasMock.prototype.insertOne = vi.fn();
  MongoAtlasMock.prototype.updateOne = vi.fn();
  MongoAtlasMock.prototype.deleteOne = vi.fn();
  return { MongoAtlas: MongoAtlasMock };
});

// Mock environment
const env = {
  ATLAS_API_URL: 'https://mock-atlas.com',
  ATLAS_API_KEY: 'mock-key',
  ATLAS_DATA_SOURCE: 'Cluster0',
  ATLAS_DATABASE: 'paranote',
  SITE_SECRETS: JSON.stringify({ "test-site": "test-secret" }),
  ADMIN_SECRET: "admin-secret"
};

const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
};

describe('Cloudflare Worker API', () => {
  let dbMock;
  let banDbMock;

  beforeEach(() => {
    vi.clearAllMocks();
    // Access the mock instances
    // Since worker creates new instances, we need to capture them or rely on the mock returning the same spy?
    // The worker does `new MongoAtlas(...)`.
    // We can spy on the prototype methods which are shared.
    
    // Reset implementations
    MongoAtlas.prototype.find.mockResolvedValue([]);
    MongoAtlas.prototype.insertOne.mockResolvedValue({ insertedId: 'new-id' });
    MongoAtlas.prototype.updateOne.mockResolvedValue({ modifiedCount: 1 });
    MongoAtlas.prototype.deleteOne.mockResolvedValue({ deletedCount: 1 });
  });

  // Helper to create request
  const createReq = (method, path, body = null, headers = {}) => {
    return {
      method,
      url: `https://worker.dev${path}`,
      headers: {
        get: (key) => headers[key.toLowerCase()] || headers[key] || null
      },
      json: async () => body
    };
  };

  describe('GET /api/v1/comments', () => {
    it('should return comments grouped by paragraph', async () => {
      const mockDocs = [
        { id: '1', paraIndex: 0, content: 'c1' },
        { id: '2', paraIndex: 0, content: 'c2' },
        { id: '3', paraIndex: 1, content: 'c3' }
      ];
      MongoAtlas.prototype.find.mockResolvedValue(mockDocs);

      const req = createReq('GET', '/api/v1/comments?siteId=s1&workId=w1&chapterId=c1');
      const res = await worker.fetch(req, env, ctx);
      const json = JSON.parse(await res.text());

      expect(res.status).toBe(200);
      expect(json.commentsByPara['0']).toHaveLength(2);
      expect(json.commentsByPara['1']).toHaveLength(1);
    });

    it('should return 400 if params missing', async () => {
      const req = createReq('GET', '/api/v1/comments?siteId=s1');
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/comments', () => {
    it('should create a comment successfully', async () => {
      const body = {
        siteId: 'test-site',
        workId: 'w1',
        chapterId: 'c1',
        paraIndex: 0,
        content: 'hello'
      };
      
      const req = createReq('POST', '/api/v1/comments', body);
      const res = await worker.fetch(req, env, ctx);
      
      expect(res.status).toBe(201);
      const json = JSON.parse(await res.text());
      expect(json.content).toBe('hello');
      // Should generate anonymous user
      expect(json.userId).toMatch(/^ip_/);
      expect(MongoAtlas.prototype.insertOne).toHaveBeenCalled();
    });

    it('should verify JWT and use identity', async () => {
      // Mock verifyJwt to return a user
      const verifySpy = vi.spyOn(utils, 'verifyJwt').mockResolvedValue({
        sub: 'user-123',
        name: 'Test User'
      });

      const body = {
        siteId: 'test-site',
        workId: 'w1',
        chapterId: 'c1',
        paraIndex: 0,
        content: 'hello authenticated'
      };
      
      const req = createReq('POST', '/api/v1/comments', body, {
        'x-paranote-token': 'valid.token.here'
      });
      
      const res = await worker.fetch(req, env, ctx);
      const json = JSON.parse(await res.text());
      
      expect(json.userId).toBe('user-123');
      expect(json.userName).toBe('Test User');
    });

    it('should reject banned user', async () => {
      // Mock banDb find to return a ban
      // worker/index.js instantiates MongoAtlas twice: one for db, one for banDb.
      // We can check the collection arg in constructor if we want to distinguish, 
      // but simpler is to mock `find` to check arguments or just return global behavior.
      // Since `banDb.find` is called with { userId, siteId }, we can use `mockImplementation`.
      
      MongoAtlas.prototype.find.mockImplementation(async (query) => {
        if (query && query.userId === 'ip_banned') {
          return [{ userId: 'ip_banned' }];
        }
        return [];
      });

      // Mock generateId to return specific hash for IP to match 'ip_banned'?
      // Harder. Let's assume we pass a user token that resolves to 'ip_banned' OR mock generateId.
      vi.spyOn(utils, 'generateId').mockResolvedValue('banned');
      // logic: userId = `ip_${hash}` -> ip_banned

      const body = {
        siteId: 'test-site',
        workId: 'w1',
        chapterId: 'c1',
        paraIndex: 0,
        content: 'spam'
      };
      
      const req = createReq('POST', '/api/v1/comments', body); // Anonymous
      const res = await worker.fetch(req, env, ctx);
      
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/comments/like', () => {
    it('should like a comment', async () => {
      const body = {
        siteId: 'test-site',
        commentId: 'c1'
      };
      
      const req = createReq('POST', '/api/v1/comments/like', body);
      const res = await worker.fetch(req, env, ctx);
      
      expect(res.status).toBe(200);
      expect(MongoAtlas.prototype.updateOne).toHaveBeenCalledWith(
        { id: 'c1', likedBy: { $ne: expect.stringMatching(/^ip_/) } },
        expect.objectContaining({ $inc: { likes: 1 } })
      );
    });

    it('should fail if already liked (mocking db failure)', async () => {
      MongoAtlas.prototype.updateOne.mockResolvedValue({ modifiedCount: 0 });

      const body = {
        siteId: 'test-site',
        commentId: 'c1'
      };
      
      const req = createReq('POST', '/api/v1/comments/like', body);
      const res = await worker.fetch(req, env, ctx);
      
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/comments', () => {
    it('should allow admin to delete', async () => {
      const body = {
        siteId: 'test-site',
        workId: 'w1',
        chapterId: 'c1',
        commentId: 'cmt-1'
      };
      
      const req = createReq('DELETE', '/api/v1/comments', body, {
        'x-admin-secret': 'admin-secret'
      });
      
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(200);
      expect(MongoAtlas.prototype.deleteOne).toHaveBeenCalledWith({ id: 'cmt-1', siteId: 'test-site' });
    });

    it('should deny without permission', async () => {
      const body = {
        siteId: 'test-site',
        workId: 'w1',
        chapterId: 'c1',
        commentId: 'cmt-1'
      };
      
      const req = createReq('DELETE', '/api/v1/comments', body);
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(403);
    });
  });

  describe('Ban API', () => {
    it('should list bans for admin', async () => {
      MongoAtlas.prototype.find.mockResolvedValue([
        { userId: 'u1', reason: 'r1' }
      ]);

      const req = createReq('GET', '/api/v1/ban?siteId=test-site', null, {
        'x-admin-secret': 'admin-secret'
      });
      
      const res = await worker.fetch(req, env, ctx);
      const json = JSON.parse(await res.text());
      
      expect(res.status).toBe(200);
      expect(json.bannedUsers).toHaveLength(1);
    });

    it('should ban user', async () => {
      const body = {
        siteId: 'test-site',
        targetUserId: 'bad-user',
        reason: 'spam'
      };
      
      const req = createReq('POST', '/api/v1/ban', body, {
        'x-admin-secret': 'admin-secret'
      });
      
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(200);
      expect(MongoAtlas.prototype.updateOne).toHaveBeenCalled();
    });
  });
});
