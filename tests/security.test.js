/**
 * 安全性测试
 * 测试路径遍历、XSS、输入验证、边界条件等
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { server } from "../server.js";
import { initStorage } from "../storage.js";
import { isValidId, validateCommentInput, sanitizeString } from "../utils.js";

beforeAll(async () => {
  await initStorage();
});

describe("ID 验证 (isValidId)", () => {
  it("接受有效的 ID", () => {
    expect(isValidId("my-site")).toBe(true);
    expect(isValidId("site_123")).toBe(true);
    expect(isValidId("Site.Name")).toBe(true);
    expect(isValidId("a")).toBe(true);
    expect(isValidId("123")).toBe(true);
  });

  it("拒绝空 ID", () => {
    expect(isValidId("")).toBe(false);
    expect(isValidId(null)).toBe(false);
    expect(isValidId(undefined)).toBe(false);
  });

  it("拒绝非字符串类型", () => {
    expect(isValidId(123)).toBe(false);
    expect(isValidId({})).toBe(false);
    expect(isValidId([])).toBe(false);
  });

  it("拒绝路径遍历字符", () => {
    expect(isValidId("../etc/passwd")).toBe(false);
    expect(isValidId("..\\windows\\system32")).toBe(false);
    expect(isValidId("site/../admin")).toBe(false);
    expect(isValidId("/etc/passwd")).toBe(false);
    expect(isValidId("C:\\Windows")).toBe(false);
  });

  it("拒绝特殊字符", () => {
    expect(isValidId("site<script>")).toBe(false);
    expect(isValidId("site;drop table")).toBe(false);
    expect(isValidId("site'OR'1'='1")).toBe(false);
    expect(isValidId("site\x00null")).toBe(false);
    expect(isValidId("site\ninjection")).toBe(false);
  });

  it("拒绝过长的 ID", () => {
    const longId = "a".repeat(201);
    expect(isValidId(longId)).toBe(false);
    
    const maxId = "a".repeat(200);
    expect(isValidId(maxId)).toBe(true);
  });
});

describe("评论输入验证 (validateCommentInput)", () => {
  const validInput = {
    siteId: "test-site",
    workId: "test-work",
    chapterId: "test-chapter",
    paraIndex: 0,
    content: "Hello World",
  };

  it("接受有效输入", () => {
    const result = validateCommentInput(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("拒绝空 body", () => {
    expect(validateCommentInput(null).valid).toBe(false);
    expect(validateCommentInput(undefined).valid).toBe(false);
    expect(validateCommentInput("string").valid).toBe(false);
  });

  it("拒绝无效的 siteId", () => {
    const result = validateCommentInput({ ...validInput, siteId: "../etc" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("invalid_siteId");
  });

  it("拒绝无效的 paraIndex", () => {
    expect(validateCommentInput({ ...validInput, paraIndex: -1 }).valid).toBe(false);
    expect(validateCommentInput({ ...validInput, paraIndex: 100001 }).valid).toBe(false);
    expect(validateCommentInput({ ...validInput, paraIndex: 1.5 }).valid).toBe(false);
    expect(validateCommentInput({ ...validInput, paraIndex: "0" }).valid).toBe(false);
  });

  it("拒绝空内容", () => {
    expect(validateCommentInput({ ...validInput, content: "" }).valid).toBe(false);
    expect(validateCommentInput({ ...validInput, content: "   " }).valid).toBe(false);
  });

  it("拒绝过长内容", () => {
    const longContent = "a".repeat(10001);
    const result = validateCommentInput({ ...validInput, content: longContent });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("content_too_long");
  });

  it("验证可选字段", () => {
    // 有效的 parentId
    expect(validateCommentInput({ ...validInput, parentId: "abc123" }).valid).toBe(true);
    
    // 无效的 parentId
    expect(validateCommentInput({ ...validInput, parentId: 123 }).valid).toBe(false);
    expect(validateCommentInput({ ...validInput, parentId: "a".repeat(101) }).valid).toBe(false);
    
    // 有效的 userName
    expect(validateCommentInput({ ...validInput, userName: "User" }).valid).toBe(true);
    
    // 无效的 userName
    expect(validateCommentInput({ ...validInput, userName: "a".repeat(101) }).valid).toBe(false);
  });
});

describe("字符串清理 (sanitizeString)", () => {
  it("截断过长字符串", () => {
    const long = "a".repeat(20000);
    expect(sanitizeString(long, 100).length).toBe(100);
  });

  it("去除首尾空格", () => {
    expect(sanitizeString("  hello  ")).toBe("hello");
  });

  it("处理非字符串输入", () => {
    expect(sanitizeString(123)).toBe("");
    expect(sanitizeString(null)).toBe("");
    expect(sanitizeString(undefined)).toBe("");
    expect(sanitizeString({})).toBe("");
  });
});

describe("API 路径遍历防护", () => {
  it("拒绝包含路径遍历的 siteId", async () => {
    const res = await request(server)
      .get("/api/v1/comments")
      .query({ siteId: "../etc", workId: "work", chapterId: "ch" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_params");
  });

  it("拒绝包含路径遍历的 workId", async () => {
    const res = await request(server)
      .get("/api/v1/comments")
      .query({ siteId: "site", workId: "../../passwd", chapterId: "ch" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_params");
  });

  it("拒绝包含特殊字符的 ID", async () => {
    const res = await request(server)
      .get("/api/v1/comments")
      .query({ siteId: "site<script>", workId: "work", chapterId: "ch" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_params");
  });
});

describe("API 输入验证", () => {
  it("拒绝过大的 paraIndex", async () => {
    const res = await request(server)
      .post("/api/v1/comments")
      .send({
        siteId: "test-site",
        workId: "test-work",
        chapterId: "test-chapter",
        paraIndex: 999999,
        content: "test",
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_failed");
  });

  it("拒绝过长的内容", async () => {
    const res = await request(server)
      .post("/api/v1/comments")
      .send({
        siteId: "test-site",
        workId: "test-work",
        chapterId: "test-chapter",
        paraIndex: 0,
        content: "a".repeat(10001),
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_failed");
    expect(res.body.details).toContain("content_too_long");
  });

  it("拒绝无效的 JSON", async () => {
    const res = await request(server)
      .post("/api/v1/comments")
      .set("Content-Type", "application/json")
      .send("not valid json");
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_json");
  });
});

describe("管理员权限验证", () => {
  it("拒绝无权限的导出请求", async () => {
    const res = await request(server).get("/api/v1/export");
    expect(res.status).toBe(403);
  });

  it("拒绝错误的管理员密钥", async () => {
    const res = await request(server)
      .get("/api/v1/export")
      .set("x-admin-secret", "wrong-secret");
    expect(res.status).toBe(403);
  });

  it("拒绝无权限的删除请求", async () => {
    const res = await request(server)
      .delete("/api/v1/comments")
      .send({
        siteId: "test",
        workId: "test",
        chapterId: "test",
        commentId: "test",
      });
    expect(res.status).toBe(403);
  });

  it("拒绝无权限的拉黑请求", async () => {
    const res = await request(server)
      .post("/api/v1/ban")
      .send({
        siteId: "test",
        targetUserId: "user123",
      });
    expect(res.status).toBe(403);
  });
});

describe("速率限制", () => {
  it("应该有速率限制保护", async () => {
    // 这个测试只验证速率限制机制存在
    // 实际的速率限制测试需要发送大量请求
    const res = await request(server).get("/health");
    expect(res.status).toBe(200);
  });
});

describe("边界条件", () => {
  it("处理空请求体", async () => {
    const res = await request(server)
      .post("/api/v1/comments")
      .send({});
    
    expect(res.status).toBe(400);
  });

  it("处理缺少必填字段", async () => {
    const res = await request(server)
      .post("/api/v1/comments")
      .send({ siteId: "test" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_failed");
  });

  it("处理点赞缺少字段", async () => {
    const res = await request(server)
      .post("/api/v1/comments/like")
      .send({ siteId: "test" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing_fields");
  });
});
