import { getDb, initSchema } from "./db.js";

/**
 * Deja la base vacía recreando la tabla `charge_events`.
 *
 * A diferencia del `reset` anterior (borrar el archivo SQLite local), ahora
 * funciona igual contra Turso: se elimina la tabla y se vuelve a crear.
 */
export async function reset(): Promise<void> {
  await getDb().execute("DROP TABLE IF EXISTS charge_events");
  await initSchema();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  reset().catch((error: unknown) => {
    console.error("[db] Falló el reset", error);
    process.exitCode = 1;
  });
}
