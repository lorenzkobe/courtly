import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Naming: prefer descriptive identifiers in app code; see scoped id-length below for API + lib.
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "base44/**",
  ]),
  // Stricter identifier length for server routes and shared libs (no JSX/event handlers).
  {
    files: ["src/app/api/**/*.ts", "src/lib/**/*.ts"],
    ignores: ["**/*.d.ts"],
    rules: {
      "id-length": [
        "warn",
        {
          min: 2,
          properties: "never",
          exceptions: ["_", "a", "b", "e", "i", "n", "t", "v", "o", "s", "d", "h", "r", "u", "w"],
        },
      ],
    },
  },
]);

export default eslintConfig;
