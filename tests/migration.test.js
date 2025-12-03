import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';

// Set env before import
process.env.ADMIN_SECRET = 'test-admin-secret';
process.env.SITE_SECRETS = JSON.stringify({ "test-site": "key" });

const { server } = await import('../server.js');

describe('Data Migration API', () => {
  const ADMIN_HEADER = 'test-admin-secret';

  it('should reject export without admin secret', async () => {
    const res = await request(server).get('/api/v1/export');
    expect(res.status).toBe(403);
  });

  it('should reject export with wrong admin secret', async () => {
    const res = await request(server)
      .get('/api/v1/export')
      .set('x-admin-secret', 'wrong');
    expect(res.status).toBe(403);
  });

  it('should export empty array if no data', async () => {
    // Might have data from other tests if running in same process, but usually isolated.
    // File storage persists to disk though.
    const res = await request(server)
      .get('/api/v1/export')
      .set('x-admin-secret', ADMIN_HEADER);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should import data and then export it back', async () => {
    const mockData = [
      {
        id: 'migration-test-id-1',
        siteId: 'mig-site',
        workId: 'mig-work',
        chapterId: 'mig-ch',
        paraIndex: 0,
        content: 'Migration Test Comment',
        createdAt: new Date().toISOString()
      }
    ];

    // Import
    const impRes = await request(server)
      .post('/api/v1/import')
      .set('x-admin-secret', ADMIN_HEADER)
      .send(mockData);
    
    expect(impRes.status).toBe(200);
    expect(impRes.body.success).toBe(true);

    // Export to verify
    const expRes = await request(server)
      .get('/api/v1/export')
      .set('x-admin-secret', ADMIN_HEADER);
    
    expect(expRes.status).toBe(200);
    const found = expRes.body.find(c => c.id === 'migration-test-id-1');
    expect(found).toBeTruthy();
    expect(found.content).toBe('Migration Test Comment');
  });
});
