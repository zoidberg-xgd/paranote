// 基于 ESLint Flat Config 的简单配置，主要校验 JS 代码风格和常见错误。

import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "data/**"],
  },
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
];


