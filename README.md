# is-there-light

¿Hubo luz? Un MVP que registra **cuándo la laptop deja de cargar** (`unplug`) y **cuándo vuelve a cargar** (`plug`), y expone el historial en una web.

Dos procesos independientes comparten la misma base de datos:

- **`collector`** — corre en tu portátil, detecta la transición de energía y escribe el evento.
- **`web`** — sitio [Astro](https://astro.build/) (SSR) con el historial y una API JSON.

La base de datos es [libSQL](https://github.com/tursodatabase/libsql) / [Turso](https://turso.tech/), con un archivo SQLite local como *fallback* de desarrollo.

```text
┌─────────────┐   escribe    ┌──────────────┐   lee    ┌──────────┐
│  collector  │ ───────────▶ │ libSQL/Turso │ ◀─────── │   web    │
│ (tu laptop) │              │  (o .db)     │          │ (Astro)  │
└─────────────┘              └──────────────┘          └──────────┘
```

## Stack

- **Runtime:** Node.js `>= 22.12` + TypeScript
- **Monorepo:** pnpm workspaces
- **Base de datos:** `@libsql/client` (Turso remoto o archivo SQLite local)
- **Web:** Astro 7 con adapter Node *standalone*
- **Colector:** proceso Node sin servidor HTTP
- **Notificaciones:** Telegram Bot API (opcional)
- **Producción local:** pm2

## Estructura

```text
.
├── apps/
│   ├── web/        # Astro: página + API /api/events
│   └── collector/  # Detección plug/unplug y escritura a la DB
├── packages/
│   ├── db/         # Cliente libSQL, esquema, migraciones y helpers
│   └── shared/     # Tipos compartidos (ChargeEvent, ChargeEventType)
├── data/           # SQLite local de fallback y logs (ignorado por git)
├── docs/tasks.md   # Plan de tareas del proyecto
├── render.yaml     # Blueprint de Render (solo la web)
└── ecosystem.config.cjs  # Config de pm2 (collector)
```

## Puesta en marcha

```bash
pnpm install          # instala todos los workspaces
cp .env.example .env  # ajusta TURSO_* si usas Turso (opcional en desarrollo)
pnpm db:migrate       # crea la tabla charge_events (idempotente)
pnpm dev              # arranca web y collector en paralelo
```

- Web: <http://localhost:4321>
- API: <http://localhost:4321/api/events>
- El collector **no** crea eventos al arrancar: solo sincroniza el estado inicial.

Sin `TURSO_DATABASE_URL`, todo funciona contra `data/charge.db`.

## Comandos

Todos se ejecutan desde la raíz con `pnpm`.

| Comando | Descripción |
|---|---|
| `pnpm dev` | Ejecuta `web` y `collector` en paralelo |
| `pnpm dev:web` | Servidor de desarrollo de Astro |
| `pnpm dev:collector` | Collector en modo desarrollo (`tsx watch`) |
| `pnpm build` | Build de todos los paquetes (orden topológico) |
| `pnpm preview` | Sirve el build de Astro localmente |
| `pnpm start` | `web` y `collector` en modo producción |
| `pnpm start:web` | Solo la web en producción |
| `pnpm start:collector` | Solo el collector en producción |
| `pnpm typecheck` | `tsc --noEmit` en todos los workspaces |
| `pnpm db:migrate` | Crea el esquema en la base configurada |
| `pnpm db:reset` | Vacía `charge_events` (DROP + CREATE) |
| `pnpm pm2:start` | Compila y arranca el collector con pm2 |
| `pnpm pm2:stop` / `restart` / `status` / `logs` / `save` | Gestión del proceso pm2 |

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `TURSO_DATABASE_URL` | — | URL de Turso (`libsql://...`). Si está definida tiene prioridad |
| `TURSO_AUTH_TOKEN` | — | Token de Turso (requerido con `TURSO_DATABASE_URL`) |
| `DB_PATH` | `./data/charge.db` | SQLite local. **Solo fallback** (relativo a la raíz del repo) |
| `COLLECTOR_INTERVAL_MS` | `2000` | Intervalo de polling (macOS/Windows) |
| `POWER_WATCH_DEBOUNCE_MS` | `100` | Debounce de `fs.watch()` (Linux) |
| `PORT` | `4321` | Puerto del servidor Astro |
| `HOST` | `localhost` | Host de Astro (`0.0.0.0` en Render) |
| `NODE_ENV` | `development` | `development` \| `production` |
| `TELEGRAM_BOT_TOKEN` | — | Token del bot ([@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_CHAT_ID` | — | Chat destino ([@userinfobot](https://t.me/userinfobot)) |
| `TELEGRAM_ENABLED` | `true` | `false` para desactivar notificaciones |

## API

`GET /api/events?limit=100&offset=0`

```json
{
  "events": [
    {
      "id": 42,
      "type": "plug",
      "occurred_at": "2026-10-15T19:16:54.000Z",
      "source": "collector",
      "created_at": "2026-10-15 19:16:54"
    }
  ]
}
```

`limit` está acotado a `1..1000` (por defecto `100`).

## Modelo de datos

Tabla `charge_events`:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `type` | TEXT | `plug` \| `unplug` (`CHECK`) |
| `occurred_at` | TEXT | ISO 8601 en UTC |
| `source` | TEXT | `collector` por defecto |
| `created_at` | TEXT | `datetime('now')` por defecto |

Solo se persisten **transiciones reales**, nunca el estado actual.

## Detección por SO

| SO | Estrategia | Implementación |
|---|---|---|
| Linux | Eventos (`fs.watch`) | Vigila `/sys/class/power_supply/*/online` |
| macOS | Polling | `pmset -g batt` (`AC Power` vs `Battery Power`) |
| Windows | Polling | PowerShell `Win32_Battery.BatteryStatus` |

Si `fs.watch()` falla, el collector cae automáticamente a polling.

## Notificaciones de Telegram

Opcionales. Configura `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` y el collector enviará un mensaje en cada transición (🔌 al conectar, 🔋 al desconectar). Sin credenciales —o con `TELEGRAM_ENABLED=false`— el envío se omite sin afectar al collector.

## Dejar el collector siempre activo

El collector solo registra transiciones mientras está corriendo. Para producción local se usa **pm2**:

```bash
pnpm pm2:start   # build + arranque
pnpm pm2:save    # persiste la lista para resurrect tras reinicio
pnpm pm2:logs    # logs en vivo
```

Los logs quedan en `data/logs/collector.out.log` y `data/logs/collector.err.log`.

## Despliegue en Render

Solo la **web** se despliega (el collector mide tu laptop y sigue corriendo en local contra la misma base Turso). El blueprint está en `render.yaml`:

1. Sube el repo a GitHub/GitLab.
2. En Render: **New +** → **Blueprint** → selecciona el repo.
3. Define `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` cuando lo pida.

> **Turso es obligatorio en producción.** El filesystem de Render es efímero: sin `TURSO_DATABASE_URL` los datos se pierden en cada deploy.

## Documentación

- [`AGENTS.md`](./AGENTS.md) — guía técnica completa (arquitectura, convenciones, despliegue).
- [`docs/tasks.md`](./docs/tasks.md) — plan y seguimiento de tareas.
