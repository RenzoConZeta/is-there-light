import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `tsc` no copia assets no-TS, pero `initSchema` lee `schema.sql` desde `dist/`.
// Este script garantiza que el archivo exista tras un build limpio.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src", "schema.sql");
const destination = join(root, "dist", "schema.sql");

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);

console.log("Copiado src/schema.sql -> dist/schema.sql");
