import { isPlugged } from "./detectPlug.js";

export const DEFAULT_INTERVAL_MS = 2000;

export type PluggedCallback = (plugged: boolean) => void;

export interface PollerHandle {
  stop(): void;
}

export interface PollerOptions {
  /** Intervalo entre lecturas. Por defecto `COLLECTOR_INTERVAL_MS` (2000 ms). */
  intervalMs?: number;
  /** Inyectable para tests; por defecto `isPlugged()`. */
  detect?: () => boolean;
  /** Errores de lectura: se avisan y se reintenta en el próximo intervalo. */
  onError?: (error: unknown) => void;
}

/** Lee `COLLECTOR_INTERVAL_MS` y cae al default si no es un número positivo. */
export function resolveIntervalMs(value: string | undefined = process.env.COLLECTOR_INTERVAL_MS): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

/**
 * Estrategia de polling (macOS/Windows y fallback): lee el estado cada
 * `intervalMs` y notifica el valor a `onPlugged`. Emite una primera lectura
 * inmediata para sincronizar el estado inicial.
 */
export function startPolling(onPlugged: PluggedCallback, options: PollerOptions = {}): PollerHandle {
  const intervalMs = options.intervalMs ?? resolveIntervalMs();
  const detect = options.detect ?? (() => isPlugged());
  const onError = options.onError ?? (() => {});

  const tick = (): void => {
    try {
      onPlugged(detect());
    } catch (error) {
      onError(error);
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);

  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
