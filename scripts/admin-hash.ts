/**
 * Prints a scrypt hash for ADMIN_PASSWORD_HASH. The password is read from a
 * hidden prompt (TTY) or from stdin (pipe), never from argv, and is never printed.
 *   npm run admin:hash
 *   printf '%s' "$PASSWORD" | npm run admin:hash --silent
 */
import { hashPassword } from "@/server/auth/password";

const MIN_LENGTH = 12;

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          reject(new Error("cancelled"));
          return;
        }
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPiped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main(): Promise<void> {
  let password: string;
  if (process.stdin.isTTY) {
    password = await readHidden("Admin password: ");
    const again = await readHidden("Repeat password: ");
    if (again !== password) throw new Error("passwords do not match");
  } else {
    password = await readPiped();
  }
  if (password.length < MIN_LENGTH) throw new Error(`password must be at least ${MIN_LENGTH} characters`);
  process.stdout.write(`${await hashPassword(password)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "failed");
  process.exit(1);
});
