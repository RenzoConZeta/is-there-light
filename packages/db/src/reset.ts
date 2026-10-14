import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";
import { resolveDbPath } from "./paths.js";

export function reset(dbPath?: string): void {
  const path = dbPath || resolveDbPath();

  if (existsSync(path)) {
    unlinkSync(path);
  }

  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  reset();
}