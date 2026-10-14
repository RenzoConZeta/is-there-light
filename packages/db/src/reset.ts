import { getDb } from "./db.js";
import { existsSync, unlinkSync } from "fs";
import { dirname } from "path";
import { mkdirSync } from "fs";

export function reset(dbPath?: string): void {
  const path = dbPath || process.env.DB_PATH || "./data/charge.db";
  
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