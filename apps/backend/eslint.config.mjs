import { config } from "@workspace/eslint-config/base"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "prisma/migrations/**",
      "src/generated/**",
    ],
  },
]
