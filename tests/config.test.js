/**
 * config.js 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars not set', async () => {
    delete process.env.PORT;
    delete process.env.DEPLOY_MODE;
    delete process.env.STORAGE_TYPE;
    
    const { config } = await import('../config.js');
    
    expect(config.port).toBe(4000);
    expect(config.deployMode).toBe('full');
    expect(config.storageType).toBe('file');
  });

  it('should parse PORT as integer', async () => {
    process.env.PORT = '8080';
    
    vi.resetModules();
    const { config } = await import('../config.js');
    
    expect(config.port).toBe(8080);
  });

  it('should validate DEPLOY_MODE', async () => {
    process.env.DEPLOY_MODE = 'invalid';
    
    vi.resetModules();
    const { config } = await import('../config.js');
    
    // Should fallback to 'full'
    expect(config.deployMode).toBe('full');
  });

  it('should accept valid DEPLOY_MODE values', async () => {
    for (const mode of ['full', 'api', 'reader', 'FULL', 'API', 'Reader']) {
      process.env.DEPLOY_MODE = mode;
      vi.resetModules();
      const { config } = await import('../config.js');
      expect(['full', 'api', 'reader']).toContain(config.deployMode);
    }
  });

  it('should parse SITE_SECRETS as JSON', async () => {
    process.env.SITE_SECRETS = JSON.stringify({ 'site-1': 'secret-1' });
    
    vi.resetModules();
    const { config } = await import('../config.js');
    
    expect(config.siteSecrets).toEqual({ 'site-1': 'secret-1' });
  });

  it('should handle invalid SITE_SECRETS JSON', async () => {
    process.env.SITE_SECRETS = 'not-valid-json';
    
    vi.resetModules();
    const { config } = await import('../config.js');
    
    // Should fallback to empty object
    expect(config.siteSecrets).toEqual({});
  });

  it('should configure puppeteer settings', async () => {
    process.env.ENABLE_PUPPETEER = 'false';
    process.env.PUPPETEER_HEADLESS = 'false';
    process.env.PUPPETEER_TIMEOUT = '30000';
    
    vi.resetModules();
    const { config } = await import('../config.js');
    
    expect(config.puppeteer.enabled).toBe(false);
    expect(config.puppeteer.headless).toBe(false);
    expect(config.puppeteer.timeout).toBe(30000);
  });

  it('should configure rate limit settings', async () => {
    process.env.RATE_LIMIT = 'false';
    process.env.RATE_LIMIT_MAX = '200';
    
    vi.resetModules();
    const { config } = await import('../config.js');
    
    expect(config.rateLimit.enabled).toBe(false);
    expect(config.rateLimit.maxRequests).toBe(200);
  });
});

describe('Deploy Mode Descriptions', () => {
  it('should have descriptions for all modes', async () => {
    const { deployModeDesc } = await import('../config.js');
    
    expect(deployModeDesc.full).toBeDefined();
    expect(deployModeDesc.api).toBeDefined();
    expect(deployModeDesc.reader).toBeDefined();
  });
});
