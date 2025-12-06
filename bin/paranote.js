#!/usr/bin/env node

/**
 * ParaNote CLI
 * 命令行启动工具
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 设置根目录为包的安装位置
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0] || "start";

function printHelp() {
  console.log(`
ParaNote - 段落评论服务

用法:
  paranote [command] [options]

服务器命令:
  start                 启动服务器 (默认)
  build                 构建嵌入脚本
  init                  初始化配置文件

数据管理:
  export                导出所有评论数据
  import <file>         导入评论数据
  stats                 显示统计信息
  list                  列出评论 (支持过滤)
  delete <id>           删除指定评论
  search <keyword>      搜索评论内容

用户管理:
  ban <userId>          拉黑用户
  unban <userId>        解除拉黑
  banlist               查看黑名单

其他:
  version               显示版本信息
  help                  显示帮助信息

选项:
  --port, -p            指定端口 (默认: 4000)
  --host                指定主机 (默认: 0.0.0.0)
  --mode, -m            部署模式: full | api | reader
  --output, -o          输出文件路径
  --storage, -s         存储类型: file | mongo
  --site                指定站点 ID (用于过滤)
  --work                指定作品 ID
  --chapter             指定章节 ID
  --reason              拉黑原因
  --limit, -n           限制输出数量
  --json                以 JSON 格式输出

环境变量:
  PORT                  服务器端口
  HOST                  服务器主机
  STORAGE_TYPE          存储类型: file | mongo
  MONGO_URI             MongoDB 连接字符串
  ADMIN_SECRET          管理员密钥
  DEPLOY_MODE           部署模式

示例:
  paranote start --port 3000
  paranote export -o backup.json
  paranote import backup.json
  paranote stats
  paranote list --site my-site --limit 20
  paranote search "关键词"
  paranote delete abc123
  paranote ban ip_abc123 --site my-site --reason "垃圾评论"
  paranote banlist --site my-site
`);
}

function parseArgs(args) {
  const options = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port" || arg === "-p") {
      options.port = parseInt(args[++i], 10);
    } else if (arg === "--host") {
      options.host = args[++i];
    } else if (arg === "--mode" || arg === "-m") {
      options.mode = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      options.output = args[++i];
    } else if (arg === "--storage" || arg === "-s") {
      options.storage = args[++i];
    } else if (arg === "--site") {
      options.site = args[++i];
    } else if (arg === "--work") {
      options.work = args[++i];
    } else if (arg === "--chapter") {
      options.chapter = args[++i];
    } else if (arg === "--reason") {
      options.reason = args[++i];
    } else if (arg === "--limit" || arg === "-n") {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (!arg.startsWith("-")) {
      options.positional.push(arg);
    }
  }
  return options;
}

// 静默初始化存储 (用于 JSON 输出模式)
async function initStorageSilent(options) {
  if (options.storage) process.env.STORAGE_TYPE = options.storage;
  
  // 临时替换 console.log 来抑制 initStorage 的输出
  const originalLog = console.log;
  if (options.json) {
    console.log = () => {};
  }
  
  const { initStorage } = await import("../storage.js");
  await initStorage();
  
  // 恢复 console.log
  console.log = originalLog;
}

async function startServer(options) {
  // 设置环境变量
  if (options.port) process.env.PORT = String(options.port);
  if (options.host) process.env.HOST = options.host;
  if (options.mode) process.env.DEPLOY_MODE = options.mode;

  const { config, printConfig } = await import("../config.js");
  const { initStorage } = await import("../storage.js");
  const { server } = await import("../server.js");

  await initStorage();

  server.listen(config.port, config.host, () => {
    console.log(`\nParaNote listening on http://${config.host}:${config.port}`);
    printConfig();
    console.log("");
  });
}

async function buildEmbed() {
  const { execSync } = await import("node:child_process");
  console.log("Building embed script...");
  try {
    execSync("npm run build:embed", { cwd: packageRoot, stdio: "inherit" });
    console.log("Build complete: dist/paranote.min.js");
  } catch (e) {
    console.error("Build failed:", e.message);
    process.exit(1);
  }
}

async function exportData(options) {
  const fs = await import("node:fs/promises");
  
  if (options.storage) process.env.STORAGE_TYPE = options.storage;
  
  const { initStorage, exportAll } = await import("../storage.js");
  await initStorage();
  
  const data = await exportAll();
  const json = JSON.stringify(data, null, 2);
  
  const outputFile = options.output || `paranote-backup-${new Date().toISOString().slice(0, 10)}.json`;
  await fs.writeFile(outputFile, json, "utf-8");
  
  console.log(`✅ 导出成功: ${outputFile}`);
  console.log(`   评论数: ${data.length}`);
}

async function importData(options) {
  const fs = await import("node:fs/promises");
  const inputFile = options.positional[0];
  
  if (!inputFile) {
    console.error("❌ 请指定要导入的文件: paranote import <file>");
    process.exit(1);
  }
  
  if (options.storage) process.env.STORAGE_TYPE = options.storage;
  
  const { initStorage, importAll } = await import("../storage.js");
  await initStorage();
  
  try {
    const content = await fs.readFile(inputFile, "utf-8");
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      console.error("❌ 无效的数据格式: 应为 JSON 数组");
      process.exit(1);
    }
    
    const result = await importAll(data);
    console.log(`✅ 导入成功`);
    console.log(`   导入数: ${result.imported || data.length}`);
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`❌ 文件不存在: ${inputFile}`);
    } else {
      console.error(`❌ 导入失败: ${e.message}`);
    }
    process.exit(1);
  }
}

async function showStats(options) {
  if (options.storage) process.env.STORAGE_TYPE = options.storage;
  
  const { initStorage, exportAll } = await import("../storage.js");
  await initStorage();
  
  const data = await exportAll();
  
  // 统计信息
  const sites = new Set();
  const works = new Set();
  const chapters = new Set();
  let totalLikes = 0;
  const userComments = {};
  
  for (const comment of data) {
    sites.add(comment.siteId);
    works.add(`${comment.siteId}/${comment.workId}`);
    chapters.add(`${comment.siteId}/${comment.workId}/${comment.chapterId}`);
    totalLikes += comment.likes || 0;
    const user = comment.userName || "匿名";
    userComments[user] = (userComments[user] || 0) + 1;
  }
  
  // 排序用户
  const topUsers = Object.entries(userComments)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  console.log(`
📊 ParaNote 统计信息
${"-".repeat(40)}`);
  console.log(`评论总数:     ${data.length}`);
  console.log(`站点数:       ${sites.size}`);
  console.log(`作品数:       ${works.size}`);
  console.log(`章节数:       ${chapters.size}`);
  console.log(`总点赞数:     ${totalLikes}`);
  
  if (topUsers.length > 0) {
    console.log(`\n🏆 活跃用户 Top 5:`);
    topUsers.forEach(([user, count], i) => {
      console.log(`   ${i + 1}. ${user}: ${count} 条评论`);
    });
  }
  console.log("");
}

async function initConfig() {
  const fs = await import("node:fs/promises");
  const envExample = path.join(packageRoot, ".env.example");
  const envTarget = path.join(process.cwd(), ".env");
  
  try {
    await fs.access(envTarget);
    console.log("⚠️  .env 文件已存在，跳过创建");
  } catch {
    try {
      const content = await fs.readFile(envExample, "utf-8");
      await fs.writeFile(envTarget, content);
      console.log("✅ 已创建 .env 配置文件");
      console.log("   请编辑 .env 文件配置你的设置");
    } catch (e) {
      // 如果没有 .env.example，创建基本配置
      const defaultEnv = `# ParaNote 配置
PORT=4000
HOST=0.0.0.0
STORAGE_TYPE=file
# MONGO_URI=mongodb://localhost:27017/paranote
ADMIN_SECRET=
DEPLOY_MODE=full
`;
      await fs.writeFile(envTarget, defaultEnv);
      console.log("✅ 已创建 .env 配置文件");
    }
  }
  
  // 创建 data 目录
  const dataDir = path.join(process.cwd(), "data");
  try {
    await fs.mkdir(dataDir, { recursive: true });
    console.log("✅ 已创建 data 目录");
  } catch {
    // 已存在
  }
}

async function showVersion() {
  const fs = await import("node:fs/promises");
  const content = await fs.readFile(path.join(packageRoot, "package.json"), "utf-8");
  const pkg = JSON.parse(content);
  console.log(`ParaNote v${pkg.version}`);
}

// ==================== 评论管理命令 ====================

async function listComments(options) {
  await initStorageSilent(options);
  
  const { exportAll } = await import("../storage.js");
  
  let data = await exportAll();
  
  // 过滤
  if (options.site) {
    data = data.filter(c => c.siteId === options.site);
  }
  if (options.work) {
    data = data.filter(c => c.workId === options.work);
  }
  if (options.chapter) {
    data = data.filter(c => c.chapterId === options.chapter);
  }
  
  // 按时间倒序
  data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // 限制数量
  if (options.limit && options.limit > 0) {
    data = data.slice(0, options.limit);
  }
  
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  
  if (data.length === 0) {
    console.log("没有找到评论");
    return;
  }
  
  console.log(`\n📝 评论列表 (共 ${data.length} 条)\n${"─".repeat(60)}`);
  
  for (const c of data) {
    const time = c.createdAt ? new Date(c.createdAt).toLocaleString("zh-CN") : "未知";
    const likes = c.likes ? ` ❤️${c.likes}` : "";
    console.log(`\n[${c.id}]${likes}`);
    console.log(`  👤 ${c.userName || "匿名"} (${c.userId || "unknown"})`);
    console.log(`  📍 ${c.siteId} / ${c.workId} / ${c.chapterId} #${c.paraIndex}`);
    console.log(`  🕐 ${time}`);
    console.log(`  💬 ${c.content.substring(0, 100)}${c.content.length > 100 ? "..." : ""}`);
  }
  console.log("");
}

async function searchComments(options) {
  const keyword = options.positional[0];
  
  if (!keyword) {
    console.error("❌ 请指定搜索关键词: paranote search <keyword>");
    process.exit(1);
  }
  
  await initStorageSilent(options);
  
  const { exportAll } = await import("../storage.js");
  
  let data = await exportAll();
  
  // 过滤站点
  if (options.site) {
    data = data.filter(c => c.siteId === options.site);
  }
  
  // 搜索
  const lowerKeyword = keyword.toLowerCase();
  data = data.filter(c => 
    c.content?.toLowerCase().includes(lowerKeyword) ||
    c.userName?.toLowerCase().includes(lowerKeyword) ||
    c.userId?.toLowerCase().includes(lowerKeyword)
  );
  
  // 限制数量
  if (options.limit && options.limit > 0) {
    data = data.slice(0, options.limit);
  }
  
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  
  if (data.length === 0) {
    console.log(`没有找到包含 "${keyword}" 的评论`);
    return;
  }
  
  console.log(`\n🔍 搜索结果: "${keyword}" (共 ${data.length} 条)\n${"─".repeat(60)}`);
  
  for (const c of data) {
    const time = c.createdAt ? new Date(c.createdAt).toLocaleString("zh-CN") : "未知";
    console.log(`\n[${c.id}]`);
    console.log(`  👤 ${c.userName || "匿名"}`);
    console.log(`  📍 ${c.siteId} / ${c.workId}`);
    console.log(`  🕐 ${time}`);
    // 高亮关键词
    const content = c.content.substring(0, 150);
    console.log(`  💬 ${content}${c.content.length > 150 ? "..." : ""}`);
  }
  console.log("");
}

async function deleteCommentById(options) {
  const commentId = options.positional[0];
  
  if (!commentId) {
    console.error("❌ 请指定评论 ID: paranote delete <id>");
    process.exit(1);
  }
  
  if (options.storage) process.env.STORAGE_TYPE = options.storage;
  
  const { initStorage, exportAll, deleteComment } = await import("../storage.js");
  await initStorage();
  
  // 先找到评论
  const allData = await exportAll();
  const comment = allData.find(c => c.id === commentId);
  
  if (!comment) {
    console.error(`❌ 评论不存在: ${commentId}`);
    process.exit(1);
  }
  
  // 显示评论信息
  console.log(`\n将要删除的评论:`);
  console.log(`  ID: ${comment.id}`);
  console.log(`  用户: ${comment.userName} (${comment.userId})`);
  console.log(`  内容: ${comment.content.substring(0, 80)}${comment.content.length > 80 ? "..." : ""}`);
  console.log(`  位置: ${comment.siteId} / ${comment.workId} / ${comment.chapterId}`);
  
  // 确认
  if (!options.yes) {
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question("\n确定要删除吗? (y/N) ", resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
      console.log("已取消");
      return;
    }
  }
  
  const success = await deleteComment({
    siteId: comment.siteId,
    workId: comment.workId,
    chapterId: comment.chapterId,
    commentId: comment.id
  });
  
  if (success) {
    console.log("✅ 删除成功");
  } else {
    console.error("❌ 删除失败");
    process.exit(1);
  }
}

// ==================== 用户管理命令 ====================

async function banUserCmd(options) {
  const userId = options.positional[0];
  
  if (!userId) {
    console.error("❌ 请指定用户 ID: paranote ban <userId> --site <siteId>");
    process.exit(1);
  }
  
  if (!options.site) {
    console.error("❌ 请指定站点 ID: paranote ban <userId> --site <siteId>");
    process.exit(1);
  }
  
  if (options.storage) process.env.STORAGE_TYPE = options.storage;
  
  const { initStorage, banUser, exportAll } = await import("../storage.js");
  await initStorage();
  
  // 显示该用户的评论数
  const allData = await exportAll();
  const userComments = allData.filter(c => c.siteId === options.site && c.userId === userId);
  
  console.log(`\n用户信息:`);
  console.log(`  用户 ID: ${userId}`);
  console.log(`  站点: ${options.site}`);
  console.log(`  评论数: ${userComments.length}`);
  if (userComments.length > 0) {
    const names = [...new Set(userComments.map(c => c.userName))];
    console.log(`  用户名: ${names.join(", ")}`);
  }
  console.log(`  拉黑原因: ${options.reason || "(未指定)"}`);
  
  // 确认
  if (!options.yes) {
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question("\n确定要拉黑该用户吗? (y/N) ", resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
      console.log("已取消");
      return;
    }
  }
  
  const result = await banUser({
    siteId: options.site,
    targetUserId: userId,
    reason: options.reason || "CLI 拉黑",
    bannedBy: "admin"
  });
  
  console.log("✅ 用户已被拉黑");
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  }
}

async function unbanUserCmd(options) {
  const userId = options.positional[0];
  
  if (!userId) {
    console.error("❌ 请指定用户 ID: paranote unban <userId> --site <siteId>");
    process.exit(1);
  }
  
  if (!options.site) {
    console.error("❌ 请指定站点 ID: paranote unban <userId> --site <siteId>");
    process.exit(1);
  }
  
  if (options.storage) process.env.STORAGE_TYPE = options.storage;
  
  const { initStorage, unbanUser } = await import("../storage.js");
  await initStorage();
  
  const result = await unbanUser({
    siteId: options.site,
    targetUserId: userId
  });
  
  if (result.success) {
    console.log("✅ 用户已解除拉黑");
  } else {
    console.log("⚠️  用户不在黑名单中");
  }
}

async function showBanlist(options) {
  await initStorageSilent(options);
  
  const { listBannedUsers, exportAll } = await import("../storage.js");
  
  // 获取所有站点
  let sites = [];
  if (options.site) {
    sites = [options.site];
  } else {
    const allData = await exportAll();
    sites = [...new Set(allData.map(c => c.siteId))];
  }
  
  let totalBanned = 0;
  const allBanned = [];
  
  for (const siteId of sites) {
    const banned = await listBannedUsers({ siteId });
    if (banned && banned.length > 0) {
      totalBanned += banned.length;
      for (const b of banned) {
        allBanned.push({ ...b, siteId });
      }
    }
  }
  
  if (options.json) {
    console.log(JSON.stringify(allBanned, null, 2));
    return;
  }
  
  if (totalBanned === 0) {
    console.log("黑名单为空");
    return;
  }
  
  console.log(`\n🚫 黑名单 (共 ${totalBanned} 人)\n${"─".repeat(60)}`);
  
  for (const b of allBanned) {
    const time = b.bannedAt ? new Date(b.bannedAt).toLocaleString("zh-CN") : "未知";
    console.log(`\n  用户 ID: ${b.userId || b.targetUserId}`);
    console.log(`  站点: ${b.siteId}`);
    console.log(`  原因: ${b.reason || "(未指定)"}`);
    console.log(`  拉黑者: ${b.bannedBy || "unknown"}`);
    console.log(`  时间: ${time}`);
  }
  console.log("");
}

// 主逻辑
const parsedArgs = parseArgs(args.slice(1));

switch (command) {
  case "start":
    startServer(parsedArgs);
    break;
  case "build":
    buildEmbed();
    break;
  case "export":
    exportData(parsedArgs);
    break;
  case "import":
    importData(parsedArgs);
    break;
  case "stats":
    showStats(parsedArgs);
    break;
  case "init":
    initConfig();
    break;
  case "list":
    listComments(parsedArgs);
    break;
  case "search":
    searchComments(parsedArgs);
    break;
  case "delete":
    deleteCommentById(parsedArgs);
    break;
  case "ban":
    banUserCmd(parsedArgs);
    break;
  case "unban":
    unbanUserCmd(parsedArgs);
    break;
  case "banlist":
    showBanlist(parsedArgs);
    break;
  case "version":
  case "-v":
  case "--version":
    showVersion();
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
