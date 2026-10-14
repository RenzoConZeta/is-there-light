import { initSchema } from "./db.js";

export function migrate(dbPath?: string): void {
  initSchema(dbPath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}