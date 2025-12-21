import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default [
  eslint.configs.recommended,
  prettierConfig,
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", ".nx/**"],
  },
  // Server-side packages (Node.js environment)
  {
    files: ["packages/core/**/*.ts", "packages/create-app/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ["./packages/core/tsconfig.json", "./packages/create-app/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs["strict-type-checked"]?.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "off", // Allow placeholder async functions
      "@typescript-eslint/no-unnecessary-condition": "off", // Allow defensive checks
      "@typescript-eslint/restrict-template-expressions": "off", // Allow flexible template literals
      "no-console": "warn",
      "no-debugger": "error",
      eqeqeq: ["error", "always"],
    },
  },
  // Client-side packages (Browser environment)
  {
    files: ["packages/ui/**/*.ts", "packages/ui-react/**/*.ts", "packages/ui-react/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ["./packages/ui/tsconfig.json", "./packages/ui-react/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs["strict-type-checked"]?.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "off", // Allow placeholder async functions
      "@typescript-eslint/no-unnecessary-type-parameters": "off", // Allow type parameters for API design
      "@typescript-eslint/no-unnecessary-type-assertion": "off", // Allow explicit assertions
      "@typescript-eslint/no-confusing-void-expression": "off", // Allow void returns
      "@typescript-eslint/no-deprecated": "warn", // Warn on deprecated APIs
      "no-console": "warn",
      "no-debugger": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },
];
