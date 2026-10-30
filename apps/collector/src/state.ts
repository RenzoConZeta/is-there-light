import type { ChargeEventType } from "@app/shared";

export interface PendingTransition {
  type: ChargeEventType;
  /** Hora real en que se detectó la transición (ISO 8601 UTC). */
  occurred_at: string;
}

/**
 * Estado previo de conexión. `null` significa "todavía sin sincronizar", que
 * es el estado del arranque: mientras valga `null` nunca se persiste un evento.
 */
let wasPlugged: boolean | null = null;

/**
 * Cola FIFO de transiciones pendientes de escribir en la base.
 *
 * Se encolan con su `occurred_at` real en cuanto se detectan, de modo que si la
 * red (Turso) falla durante minutos, al recuperarse se registran todas con la
 * hora correcta y sin perder las intermedias.
 *
 * La cola vive sólo en memoria: si el collector se reinicia antes de vaciarla,
 * esas transiciones se pierden (igual que antes de este cambio).
 */
let pending: PendingTransition[] = [];

export function getWasPlugged(): boolean | null {
  return wasPlugged;
}

export function setWasPlugged(plugged: boolean | null): void {
  wasPlugged = plugged;
}

export function peekPending(): PendingTransition | null {
  return pending[0] ?? null;
}

/** Quita la primera transición de la cola (tras confirmar su escritura). */
export function shiftPending(): PendingTransition | null {
  return pending.shift() ?? null;
}

export function pendingCount(): number {
  return pending.length;
}

export function resetState(): void {
  wasPlugged = null;
  pending = [];
}

/**
 * Registra una lectura del estado de energía y, sólo cuando representa un
 * cambio real respecto de la anterior, encola la transición y la devuelve.
 * La primera lectura únicamente sincroniza el estado (sin evento).
 *
 * `wasPlugged` avanza en el momento de detectar la transición porque el evento
 * ya queda en la cola: así una segunda transición durante el mismo corte de red
 * también se registra con su hora real.
 *
 * Devuelve la transición detectada o `null` si no hubo cambio.
 */
export function onPowerChange(plugged: boolean): PendingTransition | null {
  if (wasPlugged === null) {
    // Sincroniza el estado inicial. NO insertar evento.
    wasPlugged = plugged;
    return null;
  }

  if (plugged === wasPlugged) {
    return null;
  }

  const transition: PendingTransition = {
    type: plugged ? "plug" : "unplug",
    occurred_at: new Date().toISOString(),
  };

  wasPlugged = plugged;
  pending.push(transition);

  return transition;
}
