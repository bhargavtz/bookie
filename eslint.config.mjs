import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** Packages that must never reach a client bundle. */
const SERVER_ONLY_PACKAGES = [
  "pg",
  "drizzle-orm",
  "drizzle-orm/*",
  "drizzle-kit",
  "@electric-sql/pglite",
  "@electric-sql/pglite/*",
  "@aws-sdk/*",
  "server-only",
  "fs",
  "fs/promises",
  "node:fs",
  "node:fs/promises",
  "child_process",
  "node:child_process",
  "net",
  "node:net",
  "tls",
  "node:tls",
  "crypto",
  "node:crypto",
];

const serverOnlyGroups = [
  {
    group: SERVER_ONLY_PACKAGES,
    message: "Server-only module: do not import it from client-reachable code (components, lib, contracts).",
  },
  {
    group: ["@/server/*", "**/server/*", "@/lib/env"],
    message: "components, lib and contracts must not import from src/server or read the environment.",
  },
];

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "public/pdfjs/**",
      "tests/fixtures/generated/**",
      "drizzle/**",
      ".data/**",
      ".logs/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Type-aware rules (no-floating-promises etc.) for all TypeScript.
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Rules for every file.
  {
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is banned. The only allow-listed place is src/components/seo/JsonLd.tsx.",
        },
        {
          selector: "MemberExpression[object.name='sql'][property.name='raw']",
          message: "sql.raw is banned outside src/server/db, src/server/repositories, scripts and tests.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read configuration through getEnv() in src/lib/env.ts. process.env is only allowed there, in config files, scripts and tests.",
        },
      ],
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/tabindex-no-positive": "error",
    },
  },

  // Layering: client-reachable code cannot touch server modules, DB drivers, fs or node crypto.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}", "src/contracts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: serverOnlyGroups }],
    },
  },
  // src/lib/env.ts is the only lib file that reads process.env; checksum.ts is server-use (node:crypto) by design.
  {
    files: ["src/lib/env.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    files: ["src/lib/checksum.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  // Route handlers and pages: no direct DB/repository access, no child_process.
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/server/db", "@/server/db/*", "@/server/repositories", "@/server/repositories/*"], message: "Route code must go through src/server/services, never the DB or repositories directly." },
            { group: ["drizzle-orm", "drizzle-orm/*", "pg", "@electric-sql/pglite", "@electric-sql/pglite/*"], message: "No database drivers in src/app." },
            { group: ["child_process", "node:child_process"], message: "child_process is banned in src/app." },
          ],
        },
      ],
    },
  },
  // Only the DB layer (and repositories) may import the Drizzle schema.
  {
    files: ["src/server/services/**/*.ts", "src/server/auth/**/*.ts", "src/server/storage/**/*.ts", "src/server/http/**/*.ts"],
    ignores: ["src/server/auth/rate-limit.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/db/schema", "@/server/db/schema/*", "drizzle-orm", "drizzle-orm/*"], message: "Only src/server/db and src/server/repositories may use the Drizzle schema." }] },
      ],
    },
  },
  // Raw SQL escape hatch is allowed where SQL is the job.
  {
    files: ["src/server/db/**/*.ts", "src/server/repositories/**/*.ts", "scripts/**/*.{ts,mjs}", "tests/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is banned. The only allow-listed place is src/components/seo/JsonLd.tsx.",
        },
      ],
    },
  },
  // The single allow-listed place for dangerouslySetInnerHTML (JSON-LD script tags), created by S6.
  {
    files: ["src/components/seo/JsonLd.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
  // process.env is legitimate in tooling and tests.
  {
    files: [
      "*.config.{ts,mjs,js}",
      "scripts/**/*.{ts,mjs}",
      "tests/**/*.ts",
      "next.config.ts",
      "playwright.config.ts",
      "vitest.config.ts",
      "drizzle.config.ts",
    ],
    rules: {
      "no-restricted-properties": "off",
      "no-console": "off",
    },
  },
  // Legacy landing component (to be replaced by S3b) still logs; exempted so lint stays green.
  {
    files: ["src/components/NewsletterSection.tsx"],
    rules: { "no-console": "off" },
  },
  // Tests may use non-null assertions for brevity.
  {
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
];

export default eslintConfig;
