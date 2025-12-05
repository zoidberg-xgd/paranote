/**
 * ParaNote 配置管理
 * 集中管理所有环境变量和配置项
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 解析 JSON 环境变量的辅助函数
function parseJsonEnv(envVar, defaultValue = {}) {
  try {
    return JSON.parse(process.env[envVar] || JSON.stringify(defaultValue));
  } catch (e) {
    console.error(`Failed to parse ${envVar}:`, e.message);
    return defaultValue;
  }
}

// 验证部署模式
function validateDeployMode(mode) {
  const validModes = ['full', 'api', 'reader'];
  const normalized = (mode || 'full').toLowerCase();
  if (!validModes.includes(normalized)) {
    console.warn(`Invalid DEPLOY_MODE "${mode}", falling back to "full"`);
    return 'full';
  }
  return normalized;
}

export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT, 10) || 4000,
  host: process.env.HOST || '0.0.0.0',
  
  // 部署模式: full | api | reader
  deployMode: validateDeployMode(process.env.DEPLOY_MODE),
  
  // 路径配置
  rootDir: __dirname,
  dataDir: path.join(__dirname, 'data'),
  publicDir: path.join(__dirname, 'public'),
  distDir: path.join(__dirname, 'dist'),
  
  // 存储配置
  storageType: process.env.STORAGE_TYPE || 'file',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/paranote',
  
  // 安全配置
  adminSecret: process.env.ADMIN_SECRET || '',
  siteSecrets: parseJsonEnv('SITE_SECRETS', {}),
  
  // Puppeteer 配置
  puppeteer: {
    enabled: process.env.ENABLE_PUPPETEER !== 'false',
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    timeout: parseInt(process.env.PUPPETEER_TIMEOUT, 10) || 60000,
    userDataDir: path.join(__dirname, 'puppeteer_data'),
  },
  
  // 速率限制 (每分钟请求数)
  rateLimit: {
    enabled: process.env.RATE_LIMIT !== 'false',
    windowMs: 60 * 1000, // 1 分钟
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },
  
  // 请求限制
  maxBodySize: parseInt(process.env.MAX_BODY_SIZE, 10) || 1024 * 1024, // 1MB
  maxImportSize: parseInt(process.env.MAX_IMPORT_SIZE, 10) || 50 * 1024 * 1024, // 50MB
  
  // 抓取配置
  fetch: {
    timeout: parseInt(process.env.FETCH_TIMEOUT, 10) || 30000,
    maxRetries: parseInt(process.env.FETCH_RETRIES, 10) || 2,
  },
};

// 部署模式描述
export const deployModeDesc = {
  full: '完整部署 (首页 + 阅读器 + 所有API)',
  api: '仅核心API (评论CRUD，无 /api/v1/fetch)',
  reader: 'API + 阅读器 (含 /api/v1/fetch，无首页)'
};

// 打印配置信息
export function printConfig() {
  console.log(`ParaNote Configuration:`);
  console.log(`- Port: ${config.port}`);
  console.log(`- Deploy mode: ${config.deployMode}`);
  console.log(`  ${deployModeDesc[config.deployMode]}`);
  console.log(`- Storage: ${config.storageType}`);
  console.log(`- Puppeteer: ${config.puppeteer.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`- Rate limit: ${config.rateLimit.enabled ? `${config.rateLimit.maxRequests}/min` : 'Disabled'}`);
}

export default config;
