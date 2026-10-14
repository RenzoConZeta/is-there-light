# AGENTS.md

## Propósito

MVP local para registrar cambios de estado de carga de la laptop:

- Guarda la fecha y hora en que la laptop deja de cargar (`unplug`).
- Guarda la fecha y hora en que vuelve a cargar (`plug`).
- Expone una web con [Astro](https://astro.build/) para consultar el historial de esos eventos.

Todo corre 100% localmente. El `collector` y la `web` son procesos independientes que comparten la misma base de datos SQLite.

## Stack

- **Runtime:** Node.js + TypeScript
- **Gestor de paquetes:** pnpm (con workspaces)
- **Base de datos:** SQLite con [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- **Web:** [Astro](https://astro.build/) (con posibilidad de usar SSR para exponer las rutas API)
- **Colector:** Proceso Node independiente, sin servidor HTTP

## Estructura del repositorio

```text
.
├── apps/
│   ├── web/        # App Astro (páginas + rutas API para consultar eventos)
│   └── collector/  # Proceso en segundo plano que detecta plug/unplug
├── packages/
│   ├── db/         # Cliente SQLite, esquema, migraciones, helpers y modo WAL
│   └── shared/     # Tipos compartidos entre web y collector
├── data/           # Archivo SQLite local (OBLIGATORIO ignorar en .gitignore)
└── package.json    # Raíz con pnpm workspaces + scripts
```

## Modelo de datos

Tabla `charge_events`:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `type` | TEXT | `plug` \| `unplug` (usar `CHECK` para reforzarlo) |
| `occurred_at` | TEXT | ISO 8601 en UTC (`new Date().toISOString()`) |
| `source` | TEXT | `collector` por defecto |
| `created_at` | TEXT | `datetime('now')` por defecto |

**Recomendado:** Al inicializar la DB usar `PRAGMA journal_mode = WAL;` para permitir lecturas concurrentes entre `web` y `collector` sin bloqueos.

## Comandos

Todos los comandos se ejecutan desde la raíz con `pnpm`.

| Comando | Descripción |
|---|---|
| `pnpm install` | Instala dependencias de todos los workspaces |
| `pnpm dev` | Ejecuta `web` y `collector` en paralelo (modo desarrollo) |
| `pnpm dev:web` | Levanta el servidor de desarrollo de Astro |
| `pnpm dev:collector` | Ejecuta el `collector` en modo desarrollo |
| `pnpm build` | Build de Astro + transpilación TypeScript si aplica |
| `pnpm preview` | Sirve el build de Astro localmente |
| `pnpm start` | Inicia `web` y `collector` en modo producción |
| `pnpm start:web` | Inicia únicamente la web en producción |
| `pnpm start:collector` | Inicia únicamente el collector en producción |
| `pnpm typecheck` | Ejecuta `tsc --noEmit` en todos los workspaces |
| `pnpm lint` | Lint (definir al configurar eslint) |
| `pnpm test` | Tests (definir al configurar vitest/jest) |
| `pnpm db:migrate` | Ejecuta migraciones locales |
| `pnpm db:reset` | Borra `data/charge.db` para desarrollo (usar con cuidado) |

> `lint` y `test` pueden dejarse sin implementación inicial, pero deben registrarse con su comando exacto en este archivo en cuanto se añadan.

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `DB_PATH` | `./data/charge.db` | Ruta al archivo SQLite |
| `COLLECTOR_INTERVAL_MS` | `2000` | Intervalo (ms) para polling como fallback (macOS/Windows) |
| `POWER_WATCH_DEBOUNCE_MS` | `100` | Debounce (ms) al usar `fs.watch()` (Linux) para evitar eventos duplicados |
| `PORT` | `4321` | Puerto del servidor Astro |
| `HOST` | `localhost` | Host del servidor Astro |
| `NODE_ENV` | `development` | `development` \| `production` |

## Collector

El `collector` es un **proceso independiente**. No es un servidor HTTP. Debe mantenerse corriendo en segundo plano para registrar eventos mientras ocurran.

### Detección por SO (híbrido)

Se prioriza **event-driven** cuando es posible, con **polling** como fallback.

| SO | Estrategia | Implementación |
|---|---|---|
| **Linux** | `fs.watch()` (eventos) | Vigilar `/sys/class/power_supply/*/online`. Si cualquiera tiene `online=1` → `plugged = true`. |
| **macOS** | Polling (fallback) | Ejecutar `pmset -g batt` y detectar `AC Power` vs `Battery Power` |
| **Windows** | Polling (fallback) | Ejecutar PowerShell para leer `Win32_Battery.BatteryStatus` (`2` ≈ cargando) |

**Notas:**

- **Múltiples fuentes:** Considerar **todos** los archivos `AC*/online`. Si al menos uno está `1`, se considera `plugged = true`.
- **Debounce:** Con `fs.watch()` suele emitirse más de una vez. Tras el evento, esperar `POWER_WATCH_DEBOUNCE_MS` (50–150ms recomendado) y volver a leer el valor real antes de actuar.
- **Sleep/Wake:** En un MVP local es aceptable. Si se detecta inconsistencia tras reanudación, lo correcto es **resincronizar** el estado sin generar un evento.

### Detección de transiciones (sin falsos eventos al arrancar)

Nunca se guarda un evento al iniciar el proceso. Se usa `wasPlugged: boolean | null`.

```ts
let wasPlugged: boolean | null = null;

function onPowerChange(plugged: boolean) {
  if (wasPlugged === null) {
    // Sincroniza estado inicial. NO insertar evento.
    wasPlugged = plugged;
    return;
  }
  if (plugged !== wasPlugged) {
    const type = plugged ? "plug" : "unplug";
    db.insertChargeEvent({ type, occurred_at: new Date().toISOString() });
    wasPlugged = plugged;
  }
}
```

### Archivos esperados

```text
apps/collector/src/
├── index.ts        # Orquesta: elige estrategia por plataforma + suscribe + escribe a DB
├── platform.ts     # Detecta OS ('linux'|'darwin'|'win32') y retorna watcher/poller
├── powerWatcher.ts # Estrategia event-based con fs.watch (Linux)
├── powerPoller.ts  # Estrategia polling (macOS/Windows)
├── detectPlug.ts   # Parseo de salida por SO
└── state.ts        # Estado anterior (wasPlugged) + helpers
```

### ¿Debe correr siempre?

**Sí.** Si el `collector` se detiene, cualquier transición `plug/unplug` durante ese tiempo **no se registrará**.

Para uso local (MVP) basta con ejecutarlo en segundo plano (`pnpm dev:collector`, `tmux`, etc.). Para dejarlo persistente entre inicios de sesión se pueden usar `launchd` (macOS), `systemd --user` (Linux) o `pm2`.

Con la estrategia híbrida el consumo es **despreciable**: ~0% CPU en reposo con `fs.watch()` y < 0.01% con polling cada 2s.

## Convenciones

- **Ignorar datos locales:** `data/` debe incluirse en `.gitignore` (`data/*.db`, `data/*.sqlite*`).
- **Monorepo pnpm:** Compartir tipos desde `packages/shared` y acceso a DB desde `packages/db`. Evitar importar código entre `apps` directamente.
- **Consistencia:** Seguir estructura, nombres, imports y estilo existente. Preferir cambios puntuales con `edit` sobre reescribir archivos completos.
- **Tipado estricto:** Usar TypeScript. Mantener `typecheck` sin errores.
- **Fechas:** Siempre UTC con `toISOString()`. La web se encarga de formatear a zona horaria local si desea.
- **Transiciones únicamente:** Nunca persistir el estado "actual". Solo cambios reales.
- **Resiliente:** No romper el collector ante errores de comando/FS. Loggear warning y reintentar según estrategia.

## Entrypoints

- `apps/web/src/pages/index.astro` – Vista principal con historial
- `apps/web/src/pages/api/events.ts` (o `events/index.ts`) – API para leer eventos desde SQLite
- `apps/collector/src/index.ts` – Entrada del collector
- `packages/db/src/index.ts` – Cliente + `getChargeEvents`, `insertChargeEvent`, `initSchema`, `migrate`
- `packages/shared/src/types.ts` – `ChargeEvent`, `ChargeEventType`, tipos compartidos