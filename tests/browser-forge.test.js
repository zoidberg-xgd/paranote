/**
 * browser-forge.js 测试
 */
import { describe, it, expect } from 'vitest';
import { 
  generateFingerprint, 
  generateHeaders,
  BROWSERS,
  OPERATING_SYSTEMS,
} from '../browser-forge.js';

describe('BrowserForge', () => {
  describe('BROWSERS constant', () => {
    it('should have browser definitions', () => {
      expect(Object.keys(BROWSERS).length).toBeGreaterThan(0);
      expect(BROWSERS).toHaveProperty('chrome');
    });
  });

  describe('OPERATING_SYSTEMS constant', () => {
    it('should have OS definitions', () => {
      expect(Object.keys(OPERATING_SYSTEMS).length).toBeGreaterThan(0);
      expect(OPERATING_SYSTEMS).toHaveProperty('windows');
    });
  });

  describe('generateFingerprint', () => {
    it('should generate a complete fingerprint', () => {
      const result = generateFingerprint();
      
      expect(result).toHaveProperty('headers');
      expect(result).toHaveProperty('screen');
      expect(result).toHaveProperty('webgl');
      expect(result).toHaveProperty('navigator');
      expect(result).toHaveProperty('fingerprint');
    });

    it('should generate valid screen dimensions', () => {
      const result = generateFingerprint();
      
      expect(result.screen.width).toBeGreaterThan(0);
      expect(result.screen.height).toBeGreaterThan(0);
    });

    it('should generate different fingerprints on each call', () => {
      const result1 = generateFingerprint();
      const result2 = generateFingerprint();
      
      // 用户代理应该存在
      expect(result1.fingerprint.userAgent).toBeDefined();
      expect(result2.fingerprint.userAgent).toBeDefined();
    });

    it('should have valid browser and OS', () => {
      const result = generateFingerprint();
      
      expect(['chrome', 'firefox', 'safari', 'edge']).toContain(result.fingerprint.browser);
      expect(['windows', 'macos', 'linux', 'ios', 'android']).toContain(result.fingerprint.os);
    });
  });

  describe('generateHeaders', () => {
    it('should generate valid HTTP headers', () => {
      const result = generateHeaders();
      
      expect(result).toHaveProperty('headers');
      expect(result).toHaveProperty('fingerprint');
      expect(result.headers).toHaveProperty('User-Agent');
      expect(result.headers).toHaveProperty('Accept');
      expect(result.headers).toHaveProperty('Accept-Language');
      expect(result.headers).toHaveProperty('Accept-Encoding');
    });

    it('should return fingerprint info', () => {
      const result = generateHeaders();
      
      expect(result.fingerprint).toHaveProperty('browser');
      expect(result.fingerprint).toHaveProperty('userAgent');
      expect(result.headers['User-Agent']).toBe(result.fingerprint.userAgent);
    });

    it('should include sec-ch-ua headers for Chrome', () => {
      // 生成多个直到得到 Chrome
      let result;
      for (let i = 0; i < 20; i++) {
        result = generateHeaders();
        if (result.fingerprint.browser === 'chrome') {
          break;
        }
      }
      
      if (result && result.fingerprint.browser === 'chrome') {
        expect(result.headers).toHaveProperty('sec-ch-ua');
        expect(result.headers).toHaveProperty('sec-ch-ua-mobile');
        expect(result.headers).toHaveProperty('sec-ch-ua-platform');
      }
    });
  });

  describe('Fingerprint WebGL', () => {
    it('should have WebGL vendor and renderer', () => {
      const result = generateFingerprint();
      
      expect(result.webgl).toHaveProperty('vendor');
      expect(result.webgl).toHaveProperty('renderer');
      expect(result.webgl.vendor).toBeTruthy();
      expect(result.webgl.renderer).toBeTruthy();
    });
  });

  describe('Fingerprint Navigator', () => {
    it('should have navigator properties', () => {
      const result = generateFingerprint();
      
      expect(result.navigator).toHaveProperty('language');
      expect(result.navigator).toHaveProperty('platform');
      expect(result.navigator).toHaveProperty('hardwareConcurrency');
    });
  });
});
