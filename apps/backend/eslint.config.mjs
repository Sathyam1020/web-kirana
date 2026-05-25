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
    files: ["tests/**/*.ts", "tests/**/*.test.ts"],
    rules: {
      // Tests assert values with expect() right before using them; allow
      // the non-null shorthand instead of redundant intermediate variables.
      "@typescript-eslint/no-non-null-assertion": "off",
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
