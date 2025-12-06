/**
 * npm 包入口 (index.js) 测试
 * 测试模块导出和 startServer 函数
 */

import { describe, it, expect, afterAll } from "vitest";

describe("npm 包导出", () => {
  it("导出 server", async () => {
    const { server } = await import("../index.js");
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
  });

  it("导出 config 和 printConfig", async () => {
    const { config, printConfig } = await import("../index.js");
    expect(config).toBeDefined();
    expect(typeof config.port).toBe("number");
    expect(typeof printConfig).toBe("function");
  });

  it("导出存储函数", async () => {
    const {
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
    } = await import("../index.js");

    expect(typeof initStorage).toBe("function");
    expect(typeof listComments).toBe("function");
    expect(typeof createComment).toBe("function");
    expect(typeof likeComment).toBe("function");
    expect(typeof deleteComment).toBe("function");
    expect(typeof exportAll).toBe("function");
    expect(typeof importAll).toBe("function");
    expect(typeof banUser).toBe("function");
    expect(typeof unbanUser).toBe("function");
    expect(typeof isUserBanned).toBe("function");
    expect(typeof listBannedUsers).toBe("function");
  });

  it("导出工具函数", async () => {
    const {
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
    } = await import("../index.js");

    expect(typeof sendJson).toBe("function");
    expect(typeof sendText).toBe("function");
    expect(typeof sendHtml).toBe("function");
    expect(typeof parseBody).toBe("function");
    expect(typeof getClientIp).toBe("function");
    expect(typeof verifyJwt).toBe("function");
    expect(typeof isValidUrl).toBe("function");
    expect(typeof sanitizeString).toBe("function");
    expect(typeof validateCommentInput).toBe("function");
    expect(typeof checkRateLimit).toBe("function");
    expect(typeof md5).toBe("function");
    expect(typeof generateWorkId).toBe("function");
  });

  it("导出 fetchPageContent", async () => {
    const { fetchPageContent } = await import("../index.js");
    expect(typeof fetchPageContent).toBe("function");
  });

  it("导出路由处理函数", async () => {
    const { handleApiRoutes, handleStaticRoutes } = await import("../index.js");
    expect(typeof handleApiRoutes).toBe("function");
    expect(typeof handleStaticRoutes).toBe("function");
  });

  it("导出 startServer 函数", async () => {
    const { startServer } = await import("../index.js");
    expect(typeof startServer).toBe("function");
  });
});

describe("子模块导出", () => {
  it("可以从 paranote/config 导入", async () => {
    const configModule = await import("../config.js");
    expect(configModule.config).toBeDefined();
    expect(configModule.printConfig).toBeDefined();
  });

  it("可以从 paranote/storage 导入", async () => {
    const storageModule = await import("../storage.js");
    expect(storageModule.initStorage).toBeDefined();
    expect(storageModule.listComments).toBeDefined();
  });

  it("可以从 paranote/utils 导入", async () => {
    const utilsModule = await import("../utils.js");
    expect(utilsModule.sendJson).toBeDefined();
    expect(utilsModule.md5).toBeDefined();
  });

  it("可以从 paranote/fetcher 导入", async () => {
    const fetcherModule = await import("../fetcher.js");
    expect(fetcherModule.fetchPageContent).toBeDefined();
  });
});

describe("工具函数功能", () => {
  it("md5 生成正确的哈希", async () => {
    const { md5 } = await import("../index.js");
    const hash = md5("test");
    expect(hash).toBe("098f6bcd4621d373cade4e832627b4f6");
  });

  it("generateWorkId 生成带前缀的 ID", async () => {
    const { generateWorkId } = await import("../index.js");
    const id = generateWorkId("https://example.com/article");
    expect(id.startsWith("r_")).toBe(true);
    expect(id.length).toBe(34); // "r_" + 32 字符的 md5
  });

  it("isValidUrl 验证 URL", async () => {
    const { isValidUrl } = await import("../index.js");
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://localhost:3000")).toBe(true);
    expect(isValidUrl("ftp://example.com")).toBe(false);
    expect(isValidUrl("not-a-url")).toBe(false);
  });

  it("sanitizeString 截断和清理字符串", async () => {
    const { sanitizeString } = await import("../index.js");
    expect(sanitizeString("  hello  ")).toBe("hello");
    expect(sanitizeString("a".repeat(20000), 100).length).toBe(100);
    expect(sanitizeString(123)).toBe("");
  });

  it("validateCommentInput 验证评论输入", async () => {
    const { validateCommentInput } = await import("../index.js");
    
    // 有效输入
    const valid = validateCommentInput({
      siteId: "site",
      workId: "work",
      chapterId: "chapter",
      paraIndex: 0,
      content: "Hello",
    });
    expect(valid.valid).toBe(true);

    // 缺少字段
    const invalid = validateCommentInput({
      siteId: "site",
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);

    // 空内容
    const emptyContent = validateCommentInput({
      siteId: "site",
      workId: "work",
      chapterId: "chapter",
      paraIndex: 0,
      content: "",
    });
    expect(emptyContent.valid).toBe(false);
  });
});

describe("配置模块", () => {
  it("config 包含必要的配置项", async () => {
    const { config } = await import("../index.js");
    
    expect(config.port).toBeDefined();
    expect(config.host).toBeDefined();
    expect(config.deployMode).toBeDefined();
    expect(config.storageType).toBeDefined();
    expect(config.rootDir).toBeDefined();
    expect(config.dataDir).toBeDefined();
    expect(config.publicDir).toBeDefined();
  });

  it("deployModeDesc 包含所有模式描述", async () => {
    const { deployModeDesc } = await import("../config.js");
    
    expect(deployModeDesc.full).toBeDefined();
    expect(deployModeDesc.api).toBeDefined();
    expect(deployModeDesc.reader).toBeDefined();
  });
});
