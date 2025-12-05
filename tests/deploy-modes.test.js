/**
 * 部署模式测试
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import http from 'node:http';

describe('Deploy Mode: API', () => {
  let server;

  beforeAll(async () => {
    // Reset modules and set API mode
    vi.resetModules();
    process.env.DEPLOY_MODE = 'api';
    process.env.RATE_LIMIT = 'false';
    
    const module = await import('../server-new.js');
    server = module.server;
  });

  it('should return API info at root', async () => {
    const res = await request(server).get('/');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('ParaNote API');
    expect(res.body.mode).toBe('api');
    expect(res.body.endpoints).toBeDefined();
  });

  it('should disable /api/v1/fetch', async () => {
    const res = await request(server)
      .get('/api/v1/fetch')
      .query({ url: 'https://example.com' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('fetch_api_disabled');
  });

  it('should disable reader.html', async () => {
    const res = await request(server).get('/public/reader.html');
    expect(res.status).toBe(404);
  });

  it('should still serve embed.js', async () => {
    const res = await request(server).get('/embed.js');
    expect(res.status).toBe(200);
  });

  it('should still serve /health', async () => {
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
  });

  it('should still handle comments API', async () => {
    const res = await request(server)
      .get('/api/v1/comments')
      .query({
        siteId: 'test',
        workId: 'test',
        chapterId: 'test',
      });

    expect(res.status).toBe(200);
  });
});

describe('Deploy Mode: Reader', () => {
  let server;

  beforeAll(async () => {
    vi.resetModules();
    process.env.DEPLOY_MODE = 'reader';
    process.env.RATE_LIMIT = 'false';
    
    const module = await import('../server-new.js');
    server = module.server;
  });

  it('should redirect root to reader.html', async () => {
    const res = await request(server).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/public/reader.html');
  });

  it('should serve reader.html', async () => {
    const res = await request(server).get('/public/reader.html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('should enable /api/v1/fetch', async () => {
    // Note: This will fail if the URL is invalid, but should not return 404
    const res = await request(server)
      .get('/api/v1/fetch')
      .query({ url: 'https://example.com' });

    expect(res.status).not.toBe(404);
  });
});

describe('Deploy Mode: Full', () => {
  let server;

  beforeAll(async () => {
    vi.resetModules();
    process.env.DEPLOY_MODE = 'full';
    process.env.RATE_LIMIT = 'false';
    
    const module = await import('../server-new.js');
    server = module.server;
  });

  it('should serve index.html at root', async () => {
    const res = await request(server).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('ParaNote');
  });

  it('should serve reader.html', async () => {
    const res = await request(server).get('/public/reader.html');
    expect(res.status).toBe(200);
  });

  it('should enable /api/v1/fetch', async () => {
    const res = await request(server)
      .get('/api/v1/fetch')
      .query({ url: 'https://example.com' });

    expect(res.status).not.toBe(404);
  });

  it('should handle /read redirect', async () => {
    const res = await request(server)
      .get('/read')
      .query({ url: 'https://example.com' });

    expect(res.status).toBe(302);
  });

  it('should handle /import redirect', async () => {
    const res = await request(server)
      .get('/import')
      .query({ url: 'https://example.com' });

    expect(res.status).toBe(302);
  });
});
