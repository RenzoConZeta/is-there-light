import type { ChargeEventType } from "@app/shared";

/**
 * Estado previo de conexión. `null` significa "todavía sin sincronizar", que
 * es el estado del arranque: mientras valga `null` nunca se persiste un evento.
 */
let wasPlugged: boolean | null = null;

/**
 * Transición pendiente de confirmar. Mientras exista, no se avanza wasPlugged
 * hasta que la escritura a la base de datos tenga éxito.
 */
let pendingTransition: ChargeEventType | null = null;

export function getWasPlugged(): boolean | null {
  return wasPlugged;
}

export function setWasPlugged(plugged: boolean | null): void {
  wasPlugged = plugged;
}

export function getPendingTransition(): ChargeEventType | null {
  return pendingTransition;
}

export function setPendingTransition(type: ChargeEventType | null): void {
  pendingTransition = type;
}

export function clearPendingTransition(): void {
  pendingTransition = null;
}

export function resetState(): void {
  wasPlugged = null;
  pendingTransition = null;
}

/**
 * Registra una lectura del estado de energía y, sólo cuando representa un
 * cambio real respecto de la anterior, devuelve el tipo de evento. La primera
 * lectura únicamente sincroniza el estado (sin evento).
 *
 * NO se avanza wasPlugged hasta que la persistencia se confirme. Mientras haya
 * una transición pendiente, no se genera una nueva.
 *
 * Devuelve la transición detectada o `null` si no hubo cambio.
 */
export function onPowerChange(plugged: boolean): ChargeEventType | null {
  if (wasPlugged === null) {
    // Sincroniza el estado inicial. NO insertar evento.
    wasPlugged = plugged;
    return null;
  }

  // Si ya hay una transición pendiente, no generar otra nueva
  if (pendingTransition !== null) {
    return null;
  }

  if (plugged === wasPlugged) {
    return null;
  }

  const type: ChargeEventType = plugged ? "plug" : "unplug";
  // NO actualizamos wasPlugged hasta confirmar la escritura
  pendingTransition = type;
  return type;
}

/**
 * Confirma que la transición pendiente se guardó correctamente.
 * Actualiza wasPlugged al valor correspondiente.
 */
export function confirmPendingTransition(): void {
  if (pendingTransition === "plug") {
    wasPlugged = true;
  } else if (pendingTransition === "unplug") {
    wasPlugged = false;
  }
  pendingTransition = null;
}
