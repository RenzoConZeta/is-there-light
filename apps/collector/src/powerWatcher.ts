import { watch, type FSWatcher } from "fs";
import { isPlugged, listLinuxOnlinePaths } from "./detectPlug.js";

export const DEFAULT_DEBOUNCE_MS = 100;

export type PluggedCallback = (plugged: boolean) => void;

export interface WatcherHandle {
  stop(): void;
}

export interface WatcherOptions {
  /** Espera tras un evento antes de releer. Por defecto `POWER_WATCH_DEBOUNCE_MS` (100 ms). */
  debounceMs?: number;
  /** Rutas a vigilar; por defecto todos los `online` de `power_supply`. */
  paths?: string[];
  /** Inyectable para tests; por defecto `isPlugged()`. */
  detect?: () => boolean;
  onError?: (error: unknown) => void;
}

/** Lee `POWER_WATCH_DEBOUNCE_MS` y cae al default si no es un número positivo. */
export function resolveDebounceMs(value: string | undefined = process.env.POWER_WATCH_DEBOUNCE_MS): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEBOUNCE_MS;
}

/**
 * Estrategia por eventos (Linux): vigila con `fs.watch()` los archivos
 * `online` de `/sys/class/power_supply/<fuente>`.
 *
 * `fs.watch()` suele emitir más de un evento por cambio, así que se espera el
 * debounce y recién entonces se relee el valor real antes de notificar.
 * Emite una primera lectura inmediata para sincronizar el estado inicial.
 */
export function startWatching(onPlugged: PluggedCallback, options: WatcherOptions = {}): WatcherHandle {
  const debounceMs = options.debounceMs ?? resolveDebounceMs();
  // Se considera energía de línea si cualquiera de los AC*/online vale "1".
  const paths = options.paths ?? listLinuxOnlinePaths();
  const detect = options.detect ?? (() => isPlugged());
  const onError = options.onError ?? (() => {});

  if (paths.length === 0) {
    throw new Error("No se encontraron archivos online en /sys/class/power_supply");
  }

  const watchers: FSWatcher[] = [];
  let debounceTimer: NodeJS.Timeout | null = null;

  const readAndNotify = (): void => {
    try {
      onPlugged(detect());
    } catch (error) {
      onError(error);
    }
  };

  const scheduleRead = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      readAndNotify();
    }, debounceMs);
  };

  for (const path of paths) {
    try {
      const watcher = watch(path, () => scheduleRead());
      watcher.on("error", onError);
      watchers.push(watcher);
    } catch (error) {
      onError(error);
    }
  }

  if (watchers.length === 0) {
    throw new Error("No se pudo vigilar ninguna fuente de energía con fs.watch()");
  }

  readAndNotify();

  return {
    stop(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      for (const watcher of watchers) {
        watcher.removeAllListeners();
        watcher.close();
      }
    },
  };
}
