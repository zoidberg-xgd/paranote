import { handleApiRoutes } from '../routes/api.js';
import { initStorage } from '../storage.js';

// Vercel Serverless Function entry point
// This file maps Vercel's req/res to our handleApiRoutes logic

let isInitialized = false;

export default async function handler(req, res) {
  // Ensure storage is initialized (reuses connection across invocations if hot)
  if (!isInitialized) {
    // Force specific config for Serverless environment
    if (!process.env.DEPLOY_MODE) process.env.DEPLOY_MODE = 'api';
    if (!process.env.STORAGE_TYPE) process.env.STORAGE_TYPE = 'mongo';
    
    await initStorage();
    isInitialized = true;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).setHeader('Access-Control-Allow-Origin', '*')
                   .setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
                   .setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Paranote-Token,X-Admin-Secret')
                   .end();
    return;
  }

  // Construct a URL object from the request
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  const urlStr = `${protocol}://${host}${req.url}`;
  const url = new URL(urlStr);

  // Pass to our API router
  const handled = await handleApiRoutes(req, res, url);

  if (!handled) {
    res.status(404).json({ error: 'not_found', message: 'API endpoint not found' });
  }
}
