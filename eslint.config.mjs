import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Keep generated output, dependencies, and repository governance tooling
  // outside application linting. Governance scripts have their own lifecycle.
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "scripts/**",
      "eslint.config.mjs",
    ],
  },

  // Apply JavaScript's baseline recommended rules only to TypeScript
  // application and test files owned by the backend implementation.
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    ...eslint.configs.recommended,
  },

  // Type-aware rules catch mistakes that syntax-only linting cannot detect.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["src/**/*.ts", "tests/**/*.ts"],
  })),

  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        // Use a dedicated type-aware project so tests are linted without
        // leaking test files into the production TypeScript build.
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Express error middleware requires four parameters. Prefix intentionally
      // unused parameters with "_" so the framework signature stays explicit.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
