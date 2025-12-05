import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // 每个测试文件独立运行，避免环境变量冲突
    isolate: true,
    // 顺序执行，避免并发问题
    sequence: {
      shuffle: false,
    },
    // 测试超时
    testTimeout: 30000,
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['*.js', 'routes/*.js'],
      exclude: ['tests/**', 'node_modules/**', 'dist/**'],
    },
  },
});
