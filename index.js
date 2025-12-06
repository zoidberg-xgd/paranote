/**
 * ParaNote - npm 包入口
 * 
 * 导出服务端模块，支持程序化使用
 */

// 核心服务器
export { server } from "./server.js";

// 配置
export { config, printConfig, deployModeDesc } from "./config.js";

// 存储层
export {
  initStorage,
  listComments,
  createComment,
  likeComment,
  deleteComment,
  exportAll,
  importAll,
  banUser,
  unbanUser,
  isUserBanned,
  listBannedUsers,
} from "./storage.js";

// 工具函数
export {
  sendJson,
  sendText,
  sendHtml,
  parseBody,
  getClientIp,
  verifyJwt,
  isValidUrl,
  sanitizeString,
  validateCommentInput,
  checkRateLimit,
  md5,
  generateWorkId,
} from "./utils.js";

// 抓取器
export { fetchPageContent } from "./fetcher.js";

// 路由处理
export { handleApiRoutes } from "./routes/api.js";
export { handleStaticRoutes } from "./routes/static.js";

// 启动服务器的便捷函数
export async function startServer(options = {}) {
  const { config: appConfig } = await import("./config.js");
  const { initStorage } = await import("./storage.js");
  const { server } = await import("./server.js");
  
  // 允许覆盖配置
  if (options.port) appConfig.port = options.port;
  if (options.host) appConfig.host = options.host;
  if (options.storageType) appConfig.storageType = options.storageType;
  
  await initStorage();
  
  return new Promise((resolve, reject) => {
    server.listen(appConfig.port, appConfig.host, () => {
      console.log(`ParaNote listening on http://${appConfig.host}:${appConfig.port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}
