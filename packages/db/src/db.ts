import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { findRepoRoot, resolveDbPath } from "./paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let client: Client | null = null;
let envLoaded = false;

/**
 * Carga `<raíz del repo>/.env` una única vez por proceso.
 *
 * `process.loadEnvFile` no sobreescribe variables ya presentes en el entorno,
 * así que en producción el entorno real tiene prioridad sobre el `.env`.
 * Se hace aquí (y no solo en el collector) para que web, collector y los
 * scripts `db:migrate`/`db:reset` compartan la misma configuración.
 */
function loadRepoEnv(): void {
  if (envLoaded) {
    return;
  }

  envLoaded = true;
  const envPath = join(findRepoRoot(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  try {
    process.loadEnvFile(envPath);
  } catch {
    // Un .env ilegible no debe impedir arrancar; se usan las variables del entorno.
  }
}

/**
 * Configuración del cliente libSQL.
 *
 * `TURSO_DATABASE_URL` tiene prioridad y conecta con una base remota (Turso
 * Cloud). Sin ella se usa un archivo local (`file:<repo>/data/charge.db`) como
 * fallback de desarrollo, de modo que web y collector funcionan sin Turso.
 */
export function resolveClientConfig(): { url: string; authToken?: string } {
  loadRepoEnv();

  const url = process.env.TURSO_DATABASE_URL?.trim();

  if (url) {
    return { url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() };
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[db] TURSO_DATABASE_URL no está definida: se usa el SQLite local como fallback. " +
        "En hosts con sistema de archivos efímero (Render, etc.) los datos NO persistirán."
    );
  }

  return { url: `file:${resolveDbPath()}` };
}

/** Cliente libSQL compartido (singleton por proceso). */
export function getDb(): Client {
  if (!client) {
    client = createClient(resolveClientConfig());
  }

  return client;
}

/** Crea la tabla `charge_events` si falta (idempotente). */
export async function initSchema(): Promise<void> {
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  await getDb().executeMultiple(schema);
}

/** Cierra el cliente. Útil en el shutdown del collector. */
export function closeDb(): void {
  client?.close();
  client = null;
}
