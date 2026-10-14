import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

/** Marca de la raíz del monorepo: su presencia en un directorio lo identifica. */
const WORKSPACE_MARKER = "pnpm-workspace.yaml";

const DEFAULT_DATA_DIR = "data";
const DEFAULT_DB_FILENAME = "charge.db";

/**
 * Sube desde `start` hasta encontrar la raíz del monorepo (marcada por
 * `pnpm-workspace.yaml`). Si no la encuentra, devuelve el propio `start`.
 *
 * Se basa en `process.cwd()` y no en la ubicación del módulo para que funcione
 * igual con `tsx` (src), con el build (dist) y con el bundle SSR de Astro.
 */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = start;

  for (;;) {
    if (existsSync(join(dir, WORKSPACE_MARKER))) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }

    dir = parent;
  }
}

/**
 * Ruta absoluta al SQLite compartido por web, collector y scripts del paquete.
 *
 * `DB_PATH` tiene prioridad; si es relativo se ancla a la raíz del monorepo (no
 * al cwd del proceso), de modo que un `DB_PATH=./data/charge.db` apunte siempre
 * al mismo archivo sin importar desde qué workspace se ejecute. Sin `DB_PATH`
 * usa `<repo>/data/charge.db`.
 */
export function resolveDbPath(configured: string | undefined = process.env.DB_PATH): string {
  const root = findRepoRoot();
  const value = configured?.trim();

  if (!value) {
    return join(root, DEFAULT_DATA_DIR, DEFAULT_DB_FILENAME);
  }

  return isAbsolute(value) ? value : join(root, value);
}
