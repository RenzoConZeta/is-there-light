/**
 * Config de pm2 para el collector (producción).
 *
 * Uso desde la raíz del repo:
 *   pnpm pm2:start   # build + pm2 start
 *   pnpm pm2:stop    # pm2 stop collector
 *   pnpm pm2:logs    # pm2 logs collector
 *
 * Notas:
 * - Extensión `.cjs` porque la raíz del monorepo tiene `"type": "module"`
 *   y pm2 carga este archivo con `require()`.
 * - `cwd` = raíz del repo para que `resolveDbPath()` ancle `DB_PATH=./data/charge.db`
 *   vía `findRepoRoot()` y `loadEnvFiles()` encuentre el `.env` de la raíz.
 * - El collector maneja SIGINT/SIGTERM con cierre limpio de la DB,
 *   así que pm2 puede pararlo/reiniciarlo sin riesgo de corrupción.
 */
module.exports = {
  apps: [
    {
      name: "collector",
      script: "apps/collector/dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      // Backoff exponencial para evitar crash-loops si el collector falla al arrancar.
      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      out_file: "data/logs/collector.out.log",
      error_file: "data/logs/collector.err.log",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
