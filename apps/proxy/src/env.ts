import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Environment loading. `apps/proxy/.env` beats the repo-root `.env`, and both
 * lose to the real environment — dotenv never overwrites a key that is already
 * set, so load order encodes priority (first wins per key).
 */

function findRepoRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(appDir, ".env") });
const repoRoot = findRepoRoot(appDir);
if (repoRoot) dotenv.config({ path: path.join(repoRoot, ".env") });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  openaiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com").replace(
    /\/+$/,
    "",
  ),
  openaiApiKey: process.env.OPENAI_API_KEY,
  // When set, every /v1/* request must send `Authorization: Bearer <this key>`.
  // Unset keeps the proxy open (local zero-config default).
  proxyApiKey: process.env.PROXY_API_KEY,
} as const;
