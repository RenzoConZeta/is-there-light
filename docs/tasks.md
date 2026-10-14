# tasks.md

> Ordenado por dependencia. Todas las tareas tienen una duración estimada < 30 min.  
> Objetivo: MVP local para registrar `plug`/`unplug` con collector + Astro + SQLite (`better-sqlite3`).

## Fase 1: Base del monorepo

### T-001: Crear estructura de carpetas
- [x] **T-001: Crear estructura de carpetas**
  - **Duración:** < 10 min
  - **Dependencias:** Ninguna
  - **RF:**
    - RF-001: Debe existir `apps/web/`, `apps/collector/`, `packages/db/`, `packages/shared/`, `data/` y `docs/`.
  - **Hecho cuando:** Al ejecutar `tree -L 2` (o `ls -la`) se visualizan las carpetas `apps`, `packages`, `data`, `docs`.

### T-002: Crear `.gitignore`
- [x] **T-002: Crear `.gitignore`**
  - **Duración:** < 10 min
  - **Dependencias:** T-001
  - **RF:**
    - RF-002: Debe ignorar `node_modules/`, `dist/`, `.astro/`, `data/*.db`, `data/*.sqlite`, `data/*.sqlite3`, `.env`, `.DS_Store`.
  - **Hecho cuando:** El archivo `.gitignore` contiene al menos las reglas anteriores y `git check-ignore data/charge.db 2>/dev/null || true` no falla al validar la regla `data/*.db`.

### T-003: Crear `pnpm-workspace.yaml`
- [x] **T-003: Crear `pnpm-workspace.yaml`**
  - **Duración:** < 5 min
  - **Dependencias:** T-001
  - **RF:**
    - RF-003: Debe definir `packages: ["apps/*", "packages/*"]`.
  - **Hecho cuando:** `cat pnpm-workspace.yaml` incluye `apps/*` y `packages/*`.

### T-004: Crear `package.json` raíz con workspaces y scripts
- [x] **T-004: Crear `package.json` raíz con workspaces y scripts**
  - **Duración:** < 15 min
  - **Dependencias:** T-003
  - **RF:**
    - RF-004: Debe usar `"private": true`, `"packageManager": "pnpm@*"`, workspaces `["apps/*", "packages/*"]`.
    - RF-005: Deben existir scripts: `dev`, `dev:web`, `dev:collector`, `build`, `preview`, `start`, `start:web`, `start:collector`, `typecheck`, `lint`, `test`, `db:migrate`, `db:reset`.
  - **Hecho cuando:** `pnpm --filter . run --if-present typecheck` se ejecuta sin error de parseo JSON y todos los scripts listados aparecen en `package.json`.

### T-005: Crear `tsconfig.base.json`
- [x] **T-005: Crear `tsconfig.base.json`**
  - **Duración:** < 10 min
  - **Dependencias:** T-004
  - **RF:**
    - RF-006: Debe tener `strict: true`, `moduleResolution: "bundler"`, `target: "ES2022"`, `module: "ESNext"`, `esModuleInterop: true`, `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`.
  - **Hecho cuando:** `tsconfig.base.json` existe y sus campos `strict`, `module`, `target`, `moduleResolution` coinciden con lo esperado.

## Fase 2: Paquetes compartidos

### T-006: Crear `packages/shared` con tipos
- [x] **T-006: Crear `packages/shared` con tipos**
  - **Duración:** < 10 min
  - **Dependencias:** T-005
  - **RF:**
    - RF-007: Debe existir `packages/shared/package.json` con `name: "@app/shared"`, `type: "module"`, `main`, `types` apuntando a `dist/index.*`.
    - RF-008: Debe existir `packages/shared/src/types.ts` con `export type ChargeEventType = "plug" | "unplug"`.
    - RF-009: Debe existir `packages/shared/src/index.ts` exportando los tipos compartidos.
    - RF-010: Debe existir `packages/shared/tsconfig.json` extendiendo `../../tsconfig.base.json`.
  - **Hecho cuando:** `cat packages/shared/src/types.ts` contiene `ChargeEventType` y `cat packages/shared/src/index.ts` exporta desde `./types.js` o `./types`.

### T-007: Crear `packages/shared/tsconfig.build.json`
- [x] **T-007: Crear `packages/shared/tsconfig.build.json`**
  - **Duración:** < 5 min
  - **Dependencias:** T-006
  - **RF:**
    - RF-011: Debe extender `./tsconfig.json` con `outDir: "dist"`, `declaration: true`, `declarationMap: true`, `emitDeclarationOnly: false` o acorde a build elegido.
  - **Hecho cuando:** `tsconfig.build.json` existe en `packages/shared/` y referencia `outDir: "dist"`.

## Fase 3: Capa de datos SQLite

### T-008: Crear `packages/db` con package.json y tsconfig
- [x] **T-008: Crear `packages/db` con package.json y tsconfig**
  - **Duración:** < 10 min
  - **Dependencias:** T-007
  - **RF:**
    - RF-012: Debe existir `packages/db/package.json` con `name: "@app/db"`, `type: "module"`, dependencia `better-sqlite3` y dependencia a `@app/shared`.
    - RF-013: Debe existir `packages/db/tsconfig.json` extendiendo `../../tsconfig.base.json` con `paths` o referencias mínimas.
  - **Hecho cuando:** `packages/db/package.json` lista `better-sqlite3` y `@app/shared` en `dependencies`.

### T-009: Crear esquema, init y helpers en `packages/db`
- [x] **T-009: Crear esquema, init y helpers en `packages/db`**
  - **Duración:** < 20 min
  - **Dependencias:** T-008
  - **RF:**
    - RF-014: `packages/db/src/schema.sql` debe definir tabla `charge_events` con campos `id`, `type`, `occurred_at`, `source`, `created_at` y `CHECK (type IN ('plug','unplug'))`.
    - RF-015: `packages/db/src/db.ts` debe crear conexión con `better-sqlite3`, aplicar `PRAGMA journal_mode = WAL;`, `PRAGMA foreign_keys = ON;` (opcional) y exponer `getDb(path)`.
    - RF-016: `packages/db/src/migrate.ts` debe ejecutar `schema.sql` con `CREATE TABLE IF NOT EXISTS`.
    - RF-017: `packages/db/src/queries.ts` debe exportar `insertChargeEvent({type, occurred_at, source})` y `getChargeEvents({limit, offset})`.
    - RF-018: `packages/db/src/index.ts` debe re-exportar helpers y tipos necesarios.
  - **Hecho cuando:** Existe `schema.sql`, `db.ts`, `migrate.ts`, `queries.ts`, `index.ts` en `packages/db/src/` y `index.ts` importa/expone `getChargeEvents`, `insertChargeEvent`, `initSchema` o `migrate`.

## Fase 4: Collector (detección plug/unplug)

### T-010: Crear `apps/collector` con package.json, tsconfig y deps
- [x] **T-010: Crear `apps/collector` con package.json, tsconfig y deps**
  - **Duración:** < 10 min
  - **Dependencias:** T-009
  - **RF:**
    - RF-019: `apps/collector/package.json` debe tener `name: "@app/collector"`, `type: "module"`, `dev`/`start` scripts mínimos y deps a `@app/db`, `@app/shared`.
    - RF-020: `apps/collector/tsconfig.json` debe extender `../../tsconfig.base.json`.
  - **Hecho cuando:** `apps/collector/package.json` referencia `@app/db` y `@app/shared`.

### T-011: Crear `detectPlug.ts` y `state.ts`
- [x] **T-011: Crear `detectPlug.ts` y `state.ts`**
  - **Duración:** < 15 min
  - **Dependencias:** T-010
  - **RF:**
    - RF-021: `apps/collector/src/detectPlug.ts` debe parsear salida `pmset -g batt` (macOS), `/sys/class/power_supply/*/online` (Linux) vía lectura y PowerShell `Win32_Battery.BatteryStatus` (Windows) con lógica clara.
    - RF-022: `apps/collector/src/state.ts` debe mantener `wasPlugged: boolean | null` con `get/set/reset` y función `onPowerChange(plugged, onTransition)` que **NO** dispare transición cuando `wasPlugged === null` (solo sincronice).
  - **Hecho cuando:** `detectPlug.ts` exporta `isPlugged()` o `detectPlug()` y `state.ts` implementa la regla "sin evento al arrancar".

### T-012: Crear `powerPoller.ts`, `powerWatcher.ts`, `platform.ts`
- [x] **T-012: Crear `powerPoller.ts`, `powerWatcher.ts`, `platform.ts`**
  - **Duración:** < 20 min
  - **Dependencias:** T-011
  - **RF:**
    - RF-023: `apps/collector/src/powerPoller.ts` debe usar `setInterval` con `COLLECTOR_INTERVAL_MS` (default 2000) y llamar callback con `plugged`.
    - RF-024: `apps/collector/src/powerWatcher.ts` debe usar `fs.watch` sobre `/sys/class/power_supply/*/online`, leer valor real tras evento, aplicar `POWER_WATCH_DEBOUNCE_MS` (default 100) y considerar **cualquiera** con `online === '1'` como `plugged`.
    - RF-025: `apps/collector/src/platform.ts` debe detectar `process.platform` (`linux|darwin|win32`) y devolver estrategia (`watch` o `poll`).
  - **Hecho cuando:** Los tres archivos existen, exportan sus funciones y `powerWatcher.ts` menciona "cualquiera de los AC*/online".

### T-013: Crear `index.ts` del collector
- [x] **T-013: Crear `index.ts` del collector**
  - **Duración:** < 15 min
  - **Dependencias:** T-012
  - **RF:**
    - RF-026: Debe cargar `.env` si existe (sin romper si no hay), leer `DB_PATH`, `COLLECTOR_INTERVAL_MS`, `POWER_WATCH_DEBOUNCE_MS`.
    - RF-027: Debe inicializar DB (`initSchema`/`migrate`) y activar WAL.
    - RF-028: Debe elegir estrategia según `platform.ts`, usar `state.onPowerChange` para **solo guardar transiciones** `plug/unplug` con `occurred_at = new Date().toISOString()`, `source = 'collector'`.
    - RF-029: Debe loggear `info/warn` sin lanzar excepción no controlada. No debe crear evento en arranque.
  - **Hecho cuando:** `apps/collector/src/index.ts` existe y contiene las referencias a `platform`, `detectPlug`, `state`, `@app/db`.

## Fase 5: Web con Astro

### T-014: Crear `apps/web` con Astro mínimo (TypeScript)
- [ ] **T-014: Crear `apps/web` con Astro mínimo (TypeScript)**
  - **Duración:** < 15 min
  - **Dependencias:** T-013
  - **RF:**
    - RF-030: `apps/web/package.json` debe tener `name: "@app/web"`, `type: "module"`, scripts `dev`, `build`, `preview`, `start` compatibles con Astro y deps a `@app/db`, `@app/shared`.
    - RF-031: Debe existir `apps/web/astro.config.mjs` con configuración mínima (output/server si se usarán rutas API, o hybrid; al menos válido).
    - RF-032: Debe existir `apps/web/tsconfig.json` extendiendo `../../tsconfig.base.json`.
  - **Hecho cuando:** `apps/web/package.json` existe, `astro.config.mjs` es parseable y `tsconfig.json` existe.

### T-015: Crear página principal con historial
- [ ] **T-015: Crear página principal con historial**
  - **Duración:** < 15 min
  - **Dependencias:** T-014
  - **RF:**
    - RF-033: `apps/web/src/pages/index.astro` debe obtener eventos desde la API (`/api/events`) o directamente desde DB si se renderiza SSR, mostrando `type`, `occurred_at` (formateado legible) y ordenados desc.
    - RF-034: Debe mostrar mensaje vacío si no hay eventos.
  - **Hecho cuando:** `index.astro` existe y referencia `events` con campos `id`, `type`, `occurred_at`.

### T-016: Crear ruta API para leer eventos
- [ ] **T-016: Crear ruta API para leer eventos**
  - **Duración:** < 10 min
  - **Dependencias:** T-015
  - **RF:**
    - RF-035: Debe existir `apps/web/src/pages/api/events.ts` (o `events/index.ts`) que lea `DB_PATH` y devuelva `JSON` con `{ events: [...] }` usando `getChargeEvents`.
    - RF-036: Debe aceptar `limit`/`offset` opcionales (con valores por defecto razonables).
    - RF-037: Debe usar `@app/db` y no acceder a archivos fuera de lo necesario.
  - **Hecho cuando:** La ruta API existe y exporta `GET` (u `handler`) retornando `application/json`.

## Fase 6: Integración, verificación y pulido

### T-017: Añadir `.env.example`
- [ ] **T-017: Añadir `.env.example`**
  - **Duración:** < 5 min
  - **Dependencias:** T-016
  - **RF:**
    - RF-038: Debe listar `DB_PATH`, `COLLECTOR_INTERVAL_MS`, `POWER_WATCH_DEBOUNCE_MS`, `PORT`, `HOST`, `NODE_ENV` con sus valores por defecto del AGENTS.md.
  - **Hecho cuando:** `.env.example` existe y contiene las 6 variables con valores mostrados.

### T-018: Verificar `typecheck` en todos los workspaces
- [ ] **T-018: Verificar `typecheck` en todos los workspaces**
  - **Duración:** < 10 min
  - **Dependencias:** T-017
  - **RF:**
    - RF-039: `pnpm typecheck` debe ejecutarse sin errores TypeScript (`tsc --noEmit`).
    - RF-040: No debe haber `any` implícito no deseado en archivos nuevos.
  - **Hecho cuando:** Salida de `pnpm typecheck` finaliza con `0 errors`.

### T-019: Smoke test manual (collector + web)
- [ ] **T-019: Smoke test manual (collector + web)**
  - **Duración:** < 15 min
  - **Dependencias:** T-018
  - **RF:**
    - RF-041: `pnpm dev:collector` inicia sin crash con estado inicial `wasPlugged` sincronizado (sin insertar evento).
    - RF-042: Al simular cambio `unplug->plug` o `plug->unplug` se inserta **exactamente 1** evento por transición.
    - RF-043: `pnpm dev:web` levanta y `/api/events` devuelve JSON válido.
    - RF-044: Página `/` muestra historial correctamente (o vacío).
  - **Hecho cuando:** Se generan >= 0 eventos sin duplicados al arrancar y solo 1 por transición real. `/api/events` responde 200 con `Content-Type: application/json`.

### T-020: Hardening mínimo del repo
- [ ] **T-020: Hardening mínimo del repo**
  - **Duración:** < 10 min
  - **Dependencias:** T-019
  - **RF:**
    - RF-045: Comprobar que `data/` está ignorado (`.gitignore`).
    - RF-046: Verificar imports entre apps: `apps/web` usa `@app/*`, `apps/collector` usa `@app/*`. Sin imports cruzados directos entre `apps/web` y `apps/collector`.
    - RF-047: Confirmar `occurred_at` usa `toISOString()` (UTC).
  - **Hecho cuando:** `.gitignore` incluye `data/*.db` y revisión rápida de imports cumple límites de monorepo.

## Criterio global de cierre

**Hecho cuando:** Todas las tareas T-001–T-020 tienen checkbox marcado, `pnpm typecheck` pasa, `pnpm dev:web` y `pnpm dev:collector` arrancan sin errores y el flujo plug/unplug genera transiciones únicas registradas en `charge_events`.