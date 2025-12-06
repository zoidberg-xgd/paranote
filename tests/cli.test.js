/**
 * CLI 命令测试
 * 测试 bin/paranote.js 的各种命令
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "bin/paranote.js");

// 执行 CLI 命令的辅助函数
function runCli(args, options = {}) {
  const cmd = `node ${cliPath} ${args}`;
  try {
    const output = execSync(cmd, {
      cwd: projectRoot,
      encoding: "utf-8",
      env: { ...process.env, ...options.env },
      timeout: 10000,
    });
    return { success: true, output, exitCode: 0 };
  } catch (e) {
    return {
      success: false,
      output: e.stdout || "",
      stderr: e.stderr || "",
      exitCode: e.status,
    };
  }
}

describe("CLI - 帮助和版本", () => {
  it("help 命令显示帮助信息", () => {
    const result = runCli("help");
    expect(result.success).toBe(true);
    expect(result.output).toContain("ParaNote - 段落评论服务");
    expect(result.output).toContain("用法:");
    expect(result.output).toContain("服务器命令:");
    expect(result.output).toContain("数据管理:");
    expect(result.output).toContain("用户管理:");
  });

  it("--help 显示帮助信息", () => {
    const result = runCli("--help");
    expect(result.success).toBe(true);
    expect(result.output).toContain("ParaNote");
  });

  it("-h 显示帮助信息", () => {
    const result = runCli("-h");
    expect(result.success).toBe(true);
    expect(result.output).toContain("ParaNote");
  });

  it("version 命令显示版本", () => {
    const result = runCli("version");
    expect(result.success).toBe(true);
    expect(result.output).toMatch(/ParaNote v\d+\.\d+\.\d+/);
  });

  it("--version 显示版本", () => {
    const result = runCli("--version");
    expect(result.success).toBe(true);
    expect(result.output).toMatch(/ParaNote v/);
  });

  it("-v 显示版本", () => {
    const result = runCli("-v");
    expect(result.success).toBe(true);
    expect(result.output).toMatch(/ParaNote v/);
  });

  it("未知命令显示错误和帮助", () => {
    const result = runCli("unknown-command");
    expect(result.success).toBe(false);
    // 错误信息可能在 stdout 或 stderr
    const allOutput = result.output + (result.stderr || "");
    expect(allOutput).toContain("Unknown command");
  });
});

describe("CLI - stats 命令", () => {
  it("stats 显示统计信息", () => {
    const result = runCli("stats");
    expect(result.success).toBe(true);
    expect(result.output).toContain("统计信息");
    expect(result.output).toContain("评论总数:");
    expect(result.output).toContain("站点数:");
  });
});

describe("CLI - list 命令", () => {
  it("list 列出评论", () => {
    const result = runCli("list --limit 5");
    expect(result.success).toBe(true);
    // 可能有评论也可能没有
    expect(result.output).toMatch(/评论列表|没有找到评论/);
  });

  it("list --json 输出 JSON 格式", () => {
    const result = runCli("list --limit 3 --json");
    expect(result.success).toBe(true);
    // 应该是有效的 JSON
    const parsed = JSON.parse(result.output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("list --site 过滤站点", () => {
    const result = runCli("list --site nonexistent-site-12345");
    expect(result.success).toBe(true);
    expect(result.output).toContain("没有找到评论");
  });
});

describe("CLI - search 命令", () => {
  it("search 需要关键词参数", () => {
    const result = runCli("search");
    expect(result.success).toBe(false);
    const allOutput = result.output + (result.stderr || "");
    expect(allOutput).toContain("请指定搜索关键词");
  });

  it("search 搜索评论", () => {
    const result = runCli('search "test"');
    expect(result.success).toBe(true);
    // 可能找到也可能没找到
    expect(result.output).toMatch(/搜索结果|没有找到/);
  });

  it("search --json 输出 JSON", () => {
    const result = runCli('search "nonexistent12345" --json');
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(0);
  });
});

describe("CLI - export 命令", () => {
  const testExportFile = path.join(projectRoot, "test-export-cli.json");

  afterEach(async () => {
    try {
      await fs.unlink(testExportFile);
    } catch {
      // 文件可能不存在
    }
  });

  it("export 导出数据到文件", async () => {
    const result = runCli(`export -o ${testExportFile}`);
    expect(result.success).toBe(true);
    expect(result.output).toContain("导出成功");

    // 验证文件存在且是有效 JSON
    const content = await fs.readFile(testExportFile, "utf-8");
    const data = JSON.parse(content);
    expect(Array.isArray(data)).toBe(true);
  });

  it("export 默认文件名包含日期", () => {
    // 不指定 -o，会使用默认文件名
    const result = runCli("export");
    expect(result.success).toBe(true);
    expect(result.output).toContain("导出成功");
    expect(result.output).toMatch(/paranote-backup-\d{4}-\d{2}-\d{2}\.json/);
  });
});

describe("CLI - delete 命令", () => {
  it("delete 需要评论 ID", () => {
    const result = runCli("delete");
    expect(result.success).toBe(false);
    const allOutput = result.output + (result.stderr || "");
    expect(allOutput).toContain("请指定评论 ID");
  });

  it("delete 不存在的评论返回错误", () => {
    const result = runCli("delete nonexistent-id-12345 -y");
    expect(result.success).toBe(false);
    const allOutput = result.output + (result.stderr || "");
    expect(allOutput).toContain("评论不存在");
  });
});

describe("CLI - ban 命令", () => {
  it("ban 需要用户 ID", () => {
    const result = runCli("ban");
    expect(result.success).toBe(false);
    const allOutput = result.output + (result.stderr || "");
    expect(allOutput).toContain("请指定用户 ID");
  });

  it("ban 需要站点 ID", () => {
    const result = runCli("ban some-user-id");
    expect(result.success).toBe(false);
    const allOutput = result.output + (result.stderr || "");
    expect(allOutput).toContain("请指定站点 ID");
  });

  it("ban 拉黑用户", () => {
    const testSite = `cli-test-site-${Date.now()}`;
    const testUser = `cli-test-user-${Date.now()}`;
    
    const result = runCli(`ban ${testUser} --site ${testSite} --reason "CLI test" -y`);
    expect(result.success).toBe(true);
    expect(result.output).toContain("用户已被拉黑");
  });
});

describe("CLI - unban 命令", () => {
  it("unban 需要用户 ID", () => {
    const result = runCli("unban");
    expect(result.success).toBe(false);
    const allOutput = result.output + (result.stderr || "");
    expect(allOutput).toContain("请指定用户 ID");
  });

  it("unban 需要站点 ID", () => {
    const result = runCli("unban some-user-id");
    expect(result.success).toBe(false);
    const allOutput = result.output + (result.stderr || "");
    expect(allOutput).toContain("请指定站点 ID");
  });

  it("unban 解除不存在的用户", () => {
    const result = runCli("unban nonexistent-user --site nonexistent-site");
    expect(result.success).toBe(true);
    expect(result.output).toContain("不在黑名单中");
  });
});

describe("CLI - banlist 命令", () => {
  it("banlist 显示黑名单", () => {
    const result = runCli("banlist");
    expect(result.success).toBe(true);
    // 可能有黑名单也可能为空
    expect(result.output).toMatch(/黑名单|黑名单为空/);
  });

  it("banlist --json 输出 JSON", () => {
    const result = runCli("banlist --json");
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("banlist --site 过滤站点", () => {
    const result = runCli("banlist --site nonexistent-site-12345");
    expect(result.success).toBe(true);
    // 应该为空
    expect(result.output).toContain("黑名单为空");
  });
});

describe("CLI - init 命令", () => {
  const testDir = path.join(projectRoot, "test-init-dir");
  
  beforeEach(async () => {
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch {
      // 目录可能已存在
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 清理失败不影响测试
    }
  });

  it("init 在当前目录创建 .env", async () => {
    // 在测试目录运行 init
    const cmd = `node ${cliPath} init`;
    const output = execSync(cmd, {
      cwd: testDir,
      encoding: "utf-8",
    });
    
    expect(output).toContain("已创建");
    
    // 验证文件存在
    const envPath = path.join(testDir, ".env");
    const stat = await fs.stat(envPath);
    expect(stat.isFile()).toBe(true);
  });
});

describe("CLI - 参数解析", () => {
  it("--port 参数被正确解析", () => {
    // 通过 help 命令验证参数解析不会崩溃
    const result = runCli("help --port 3000");
    expect(result.success).toBe(true);
  });

  it("--storage 参数被正确解析", () => {
    const result = runCli("stats --storage file");
    expect(result.success).toBe(true);
    expect(result.output).toContain("Using storage: file");
  });

  it("--limit 参数限制输出", () => {
    const result = runCli("list --limit 2 --json");
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.length).toBeLessThanOrEqual(2);
  });
});

describe("CLI - 完整工作流", () => {
  const testSite = `workflow-test-${Date.now()}`;
  const testUser = `workflow-user-${Date.now()}`;

  it("ban -> banlist -> unban 工作流", () => {
    // 1. 拉黑用户
    let result = runCli(`ban ${testUser} --site ${testSite} --reason "Workflow test" -y`);
    expect(result.success).toBe(true);
    expect(result.output).toContain("用户已被拉黑");

    // 2. 验证在黑名单中
    result = runCli(`banlist --site ${testSite} --json`);
    expect(result.success).toBe(true);
    const banned = JSON.parse(result.output);
    expect(banned.some(b => b.userId === testUser || b.targetUserId === testUser)).toBe(true);

    // 3. 解除拉黑
    result = runCli(`unban ${testUser} --site ${testSite}`);
    expect(result.success).toBe(true);
    expect(result.output).toContain("已解除拉黑");

    // 4. 验证不在黑名单中
    result = runCli(`banlist --site ${testSite}`);
    expect(result.success).toBe(true);
    expect(result.output).toContain("黑名单为空");
  });
});
