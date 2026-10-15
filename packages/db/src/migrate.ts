import { initSchema } from "./db.js";

export async function migrate(): Promise<void> {
  await initSchema();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((error: unknown) => {
    console.error("[db] Falló la migración", error);
    process.exitCode = 1;
  });
}
