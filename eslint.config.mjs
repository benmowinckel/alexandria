import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["server/src/**/*.{ts,tsx}", "server/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated and non-primary worktrees.
    ".claude/worktrees/**",
    ".factory/**",
    "scripts/**",
    "server/.wrangler/**",
    "server/dist/**",
    "server/dist-worker/**",
    "server/dist-check/**",
    "server/server/dist/**",
    ".see/**",
    "work/**",
  ]),
]);

export default eslintConfig;
