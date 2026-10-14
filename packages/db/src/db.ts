import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolveDbPath } from "./paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database | null = null;

export function getDb(dbPath: string = resolveDbPath()): Database.Database {
  if (db) {
    return db;
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

export function initSchema(dbPath?: string): void {
  const database = getDb(dbPath);
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  database.exec(schema);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}