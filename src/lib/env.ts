/**
 * The only module allowed to read `process.env` (enforced by ESLint). Validates
 * with zod, fails fast with the NAMES of bad variables and a generic reason,
 * and never includes a value in any error or log.
 */
import { z } from "zod";

/** "" (as in a copied .env.example) means "not set". */
const blankToUndefined = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const withDefault = <T extends z.ZodType>(schema: T, fallback: z.output<T>) =>
  z.preprocess(blankToUndefined, schema.default(fallback as never));

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const envSchema = z
  .object({
    NODE_ENV: withDefault(z.enum(["development", "test", "production"]), "development"),
    SITE_URL: withDefault(z.url({ protocol: /^https?$/ }), "http://localhost:3000"),
    /** Public contact address shown on the contact, copyright and licensing pages. Unset: the pages say it is not configured. */
    CONTACT_EMAIL: opt(z.email()),

    DATABASE_URL: opt(z.string().regex(/^postgres(?:ql)?:\/\//, "must be a postgres:// or postgresql:// URL")),
    DATABASE_POOL_MAX: withDefault(z.coerce.number().int().min(1).max(100), 10),
    PGLITE_DATA_DIR: withDefault(z.string().min(1), ".data/pglite"),

    STORAGE_DRIVER: withDefault(z.enum(["local", "s3"]), "local"),
    STORAGE_LOCAL_DIR: withDefault(z.string().min(1), ".data/storage"),
    S3_BUCKET: opt(z.string().min(3).max(63)),
    S3_REGION: opt(z.string().min(1)),
    S3_ENDPOINT: opt(z.url({ protocol: /^https?$/ })),
    S3_ACCESS_KEY_ID: opt(z.string().min(1)),
    S3_SECRET_ACCESS_KEY: opt(z.string().min(1)),
    S3_FORCE_PATH_STYLE: withDefault(boolish, false),

    DOWNLOAD_MODE: withDefault(z.enum(["proxy", "redirect"]), "proxy"),
    MAX_UPLOAD_BYTES: withDefault(z.coerce.number().int().min(1).max(5 * 1024 ** 3), 200 * 1024 * 1024),

    ADMIN_EMAIL: opt(z.email()),
    ADMIN_PASSWORD_HASH: opt(z.string().regex(/^scrypt\$\d+\$\d+\$\d+\$[^$\s]+\$[^$\s]+$/, "must be scrypt$N$r$p$salt$hash")),

    IP_HASH_SALT: opt(z.string().min(16, "must be at least 16 characters")),
    TRUST_PROXY: withDefault(boolish, false),
    READER_SYNC: withDefault(boolish, false),
  })
  .superRefine((env, ctx) => {
    const need = (name: string, present: boolean, why: string): void => {
      if (!present) ctx.addIssue({ code: "custom", path: [name], message: `required ${why}` });
    };
    if (env.STORAGE_DRIVER === "s3") {
      need("S3_BUCKET", env.S3_BUCKET !== undefined, "when STORAGE_DRIVER=s3");
      need("S3_REGION", env.S3_REGION !== undefined, "when STORAGE_DRIVER=s3");
      need(
        "S3_SECRET_ACCESS_KEY",
        (env.S3_ACCESS_KEY_ID === undefined) === (env.S3_SECRET_ACCESS_KEY === undefined),
        "together with S3_ACCESS_KEY_ID (set both or neither)",
      );
    }
    if (env.DOWNLOAD_MODE === "redirect") {
      need("DOWNLOAD_MODE", env.STORAGE_DRIVER === "s3", "to be 'proxy' unless STORAGE_DRIVER=s3");
    }
    if ((env.ADMIN_EMAIL === undefined) !== (env.ADMIN_PASSWORD_HASH === undefined)) {
      need("ADMIN_PASSWORD_HASH", false, "together with ADMIN_EMAIL (set both or neither)");
    }
    if (env.NODE_ENV === "production") {
      need("IP_HASH_SALT", env.IP_HASH_SALT !== undefined, "in production");
    }
  });

export type Env = z.output<typeof envSchema>;

export class EnvError extends Error {
  readonly variables: string[];
  constructor(variables: string[], lines: string[]) {
    super(`Invalid environment configuration:\n${lines.join("\n")}`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

/** Pure: validate an env-like object. Messages carry variable names and reasons only. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const lines: string[] = [];
  const variables = new Set<string>();
  for (const issue of result.error.issues) {
    const name = issue.path.length > 0 ? issue.path.map(String).join(".") : "(env)";
    variables.add(name);
    lines.push(`  - ${name}: ${issue.message}`);
  }
  throw new EnvError([...variables], lines);
}

let cached: Env | undefined;

/** Validated environment for the running process; throws EnvError on first use if invalid. */
export function getEnv(): Env {
  cached ??= loadEnv(process.env);
  return cached;
}

/** Test hook. */
export function resetEnvCache(): void {
  cached = undefined;
}
