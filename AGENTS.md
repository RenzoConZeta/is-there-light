# AGENTS.md

## Propósito

MVP local para registrar cambios de estado de carga de la laptop:

- Guarda la fecha y hora en que la laptop deja de cargar (`unplug`).
- Guarda la fecha y hora en que vuelve a cargar (`plug`).
- Expone una web con [Astro](https://astro.build/) para consultar el historial de esos eventos.

Almacena los eventos en **libSQL/Turso** (base remota en la nube), con un archivo SQLite local como fallback de desarrollo. El `collector` y la `web` son procesos independientes que comparten la misma base de datos.

## Stack

- **Runtime:** Node.js + TypeScript
- **Gestor de paquetes:** pnpm (con workspaces)
- **Base de datos:** [libSQL](https://github.com/tursodatabase/libsql) / [Turso](https://turso.tech/) con [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts). Fallback a archivo SQLite local (`file:`) cuando no hay Turso configurado.
- **Web:** [Astro](https://astro.build/) (con posibilidad de usar SSR para exponer las rutas API)
- **Colector:** Proceso Node independiente, sin servidor HTTP

## Estructura del repositorio

```text
.
├── apps/
│   ├── web/        # App Astro (páginas + rutas API para consultar eventos)
│   └── collector/  # Proceso en segundo plano que detecta plug/unplug
├── packages/
│   ├── db/         # Cliente libSQL (@libsql/client), esquema, migraciones y helpers
│   └── shared/     # Tipos compartidos entre web y collector
├── data/           # Archivo SQLite local de fallback (OBLIGATORIO ignorar en .gitignore)
├── render.yaml     # Blueprint de Render (despliega la web; el collector sigue local)
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

**Notas:** Con Turso la concurrencia la gestiona el servidor, así que ya **no se usa** `PRAGMA journal_mode = WAL` (era relevante con `better-sqlite3` local). El esquema se crea de forma idempotente con `initSchema()`.

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
| `pnpm pm2:start` | Compila y arranca el collector con pm2 |
| `pnpm pm2:stop` | Detiene el collector con pm2 |
| `pnpm pm2:restart` | Reinicia el collector con pm2 |
| `pnpm pm2:status` | Muestra el estado de pm2 |
| `pnpm pm2:logs` | Sigue los logs del collector |
| `pnpm pm2:save` | Guarda la lista actual para resurrect tras reinicio |
| `pnpm typecheck` | Ejecuta `tsc --noEmit` en todos los workspaces |
| `pnpm lint` | Lint (definir al configurar eslint) |
| `pnpm test` | Tests (definir al configurar vitest/jest) |
| `pnpm db:migrate` | Crea el esquema en la base configurada (Turso o archivo local) |
| `pnpm db:reset` | Vacía `charge_events` (DROP + CREATE) en la base configurada (usar con cuidado) |

> `lint` y `test` pueden dejarse sin implementación inicial, pero deben registrarse con su comando exacto en este archivo en cuanto se añadan.

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `TURSO_DATABASE_URL` | — | URL de la base Turso (`libsql://...`). Si está definida, tiene prioridad y se usa la base remota |
| `TURSO_AUTH_TOKEN` | — | Token de autenticación de Turso (requerido si se define `TURSO_DATABASE_URL`) |
| `DB_PATH` | `./data/charge.db` | Ruta al archivo SQLite local. **Solo fallback** cuando `TURSO_DATABASE_URL` está vacía (rutas relativas ancladas a la raíz del repo) |
| `COLLECTOR_INTERVAL_MS` | `2000` | Intervalo (ms) para polling como fallback (macOS/Windows) |
| `POWER_WATCH_DEBOUNCE_MS` | `100` | Debounce (ms) al usar `fs.watch()` (Linux) para evitar eventos duplicados |
| `PORT` | `4321` | Puerto del servidor Astro |
| `HOST` | `localhost` | Host del servidor Astro (en Render debe ser `0.0.0.0`) |
| `NODE_ENV` | `development` | `development` \| `production` |
| `TELEGRAM_BOT_TOKEN` | — | Token del bot de Telegram (obtenido con [@BotFather](https://t.me/BotFather)). Requerido para enviar notificaciones |
| `TELEGRAM_CHAT_ID` | — | ID del chat/usuario/grupo de Telegram donde enviar notificaciones (p.ej. [@userinfobot](https://t.me/userinfobot)). Requerido para enviar notificaciones |
| `TELEGRAM_ENABLED` | `true` | `true`/`false` para activar/desactivar notificaciones sin borrar credenciales |

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

En producción local (o para dejarlo corriendo entre reinicios) se usa **pm2** desde la raíz del repo:

| Comando | Descripción |
|---|---|
| `pnpm pm2:start` | Compila (`pnpm build`) y arranca el collector con pm2 (ecosystem.config.cjs) |
| `pnpm pm2:stop` | Detiene el collector |
| `pnpm pm2:restart` | Reinicia el collector |
| `pnpm pm2:status` | Muestra el estado de pm2 |
| `pnpm pm2:logs` | Muestra logs del collector en tiempo real |
| `pnpm pm2:save` | Guarda la lista para que pm2 la vuelva a cargar tras un reinicio del sistema |

Los logs se guardan en `data/logs/collector.out.log` y `data/logs/collector.err.log`. Tras `pnpm pm2:start`, recuerda ejecutar `pnpm pm2:save` para persistir entre reinicios. Para autorresurrect al iniciar sesión, puedes usar `pm2 startup` (macOS genera un LaunchAgent o las instrucciones necesarias) y confirmar con `pm2 save`.

Con la estrategia híbrida el consumo es **despreciable**: ~0% CPU en reposo con `fs.watch()` y < 0.01% con polling cada 2s.

## Despliegue en Render

La **web** (Astro SSR) se despliega en Render como *Web Service*. El **collector NO se despliega** en Render: mide el estado de carga del equipo local, así que debe seguir corriendo en tu portátil (con `pnpm start:collector` o pm2) apuntando a la **misma base Turso**.

El blueprint está en `render.yaml` y define:

| Ajuste | Valor |
|---|---|
| Tipo | `web` (Node) |
| Build | `pnpm install --frozen-lockfile && pnpm build` |
| Start | `node apps/web/dist/server/entry.mjs` |
| Health check | `/api/events` |
| `HOST` | `0.0.0.0` (obligatorio para que el proxy de Render alcance el servicio) |
| `PORT` | Lo inyecta Render; el servidor standalone lo respeta |
| Secretos | `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` (`sync: false`) |

**Pasos:**

1. Sube el repo a GitHub/GitLab.
2. En Render: **New +** → **Blueprint** → selecciona el repo.
3. Define `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` cuando Render los pida.
4. El collector sigue corriendo en local contra la misma base Turso.

**Requisitos / notas:**

- **Turso es obligatorio en producción.** El filesystem de Render es efímero: sin `TURSO_DATABASE_URL` se usa un SQLite local que se pierde en cada deploy/reinicio. `packages/db` avisa con un `warning` si `NODE_ENV=production` y no hay Turso.
- Node **>= 22.12** (lo exige Astro 7). El blueprint fija `NODE_VERSION=22`.
- El colector y la web comparten la base Turso, así que los eventos generados en local aparecen en la web desplegada.

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
- `apps/web/src/pages/api/events.ts` (o `events/index.ts`) – API para leer eventos desde la base libSQL
- `apps/collector/src/index.ts` – Entrada del collector
- `packages/db/src/index.ts` – Cliente + `getChargeEvents`, `insertChargeEvent`, `initSchema`, `migrate`
- `packages/shared/src/types.ts` – `ChargeEvent`, `ChargeEventType`, tipos compartidos