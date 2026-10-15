import type { ChargeEventType } from "@app/shared";

/**
 * Estado previo de conexión. `null` significa "todavía sin sincronizar", que
 * es el estado del arranque: mientras valga `null` nunca se persiste un evento.
 */
let wasPlugged: boolean | null = null;

export function getWasPlugged(): boolean | null {
  return wasPlugged;
}

export function setWasPlugged(plugged: boolean | null): void {
  wasPlugged = plugged;
}

export function resetState(): void {
  wasPlugged = null;
}

/**
 * Registra una lectura del estado de energía y, sólo cuando representa un
 * cambio real respecto de la anterior, devuelve el tipo de evento. La primera
 * lectura únicamente sincroniza el estado (sin evento).
 *
 * `onTransition` es opcional: quien necesite reaccionar de forma imperativa
 * puede pasarlo, pero el valor de retorno ya informa la transición detectada.
 *
 * Devuelve la transición detectada o `null` si no hubo cambio.
 */
export function onPowerChange(
  plugged: boolean,
  onTransition?: (type: ChargeEventType) => void
): ChargeEventType | null {
  if (wasPlugged === null) {
    // Sincroniza el estado inicial. NO insertar evento.
    wasPlugged = plugged;
    return null;
  }

  if (plugged === wasPlugged) {
    return null;
  }

  const type: ChargeEventType = plugged ? "plug" : "unplug";
  // Se actualiza antes de notificar: si la persistencia falla, la próxima
  // lectura no debe volver a intentar la misma transición como si fuese nueva.
  wasPlugged = plugged;
  onTransition?.(type);

  return type;
}
