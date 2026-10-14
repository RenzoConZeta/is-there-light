import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

/** Directorio virtual donde el kernel de Linux expone las fuentes de energía. */
export const LINUX_POWER_SUPPLY_DIR = "/sys/class/power_supply";

/**
 * Estados de `Win32_Battery.BatteryStatus` que implican energía de línea.
 * El AGENTS.md fija `2` ≈ cargando; se aceptan además las variantes
 * "Charging*" (6–9) que reporta el CIM.
 */
const WINDOWS_CHARGING_STATUSES = new Set([2, 6, 7, 8, 9]);

const WINDOWS_BATTERY_STATUS_QUERY = "(Get-CimInstance -ClassName Win32_Battery).BatteryStatus";

/** Parseo de `pmset -g batt` (macOS): la fuente es "AC Power" o "Battery Power". */
export function parsePmsetOutput(output: string): boolean {
  return output.includes("AC Power");
}

/** Parseo de la salida de `Win32_Battery.BatteryStatus` (Windows). */
export function parseWindowsBatteryStatus(output: string): boolean {
  return WINDOWS_CHARGING_STATUSES.has(Number.parseInt(output.trim(), 10));
}

/** Rutas `.../power_supply/<fuente>/online` existentes (Linux). */
export function listLinuxOnlinePaths(dir: string = LINUX_POWER_SUPPLY_DIR): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const paths: string[] = [];
  for (const entry of readdirSync(dir)) {
    const onlinePath = join(dir, entry, "online");
    if (existsSync(onlinePath)) {
      paths.push(onlinePath);
    }
  }

  return paths;
}

/**
 * Lectura de `/sys/class/power_supply/<fuente>/online` (Linux): basta con que
 * **cualquiera** de las fuentes tenga `online === "1"` para considerar que
 * hay energía de línea.
 */
export function readLinuxPlugged(paths: string[] = listLinuxOnlinePaths()): boolean {
  if (paths.length === 0) {
    throw new Error(`No se encontraron fuentes de energía en ${LINUX_POWER_SUPPLY_DIR}`);
  }

  return paths.some((path) => readFileSync(path, "utf-8").trim() === "1");
}

function runCommand(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf-8",
    windowsHide: true,
  });
}

function runPowerShell(script: string): string {
  return runCommand("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
}

/**
 * Estado actual de conexión a la red eléctrica según el SO.
 * Lanza si el comando/FS falla o la plataforma no está soportada; quien llama
 * decide cómo reintentar (ver `powerPoller` / `powerWatcher`).
 */
export function isPlugged(platform: string = process.platform): boolean {
  switch (platform) {
    case "darwin":
      return parsePmsetOutput(runCommand("pmset", ["-g", "batt"]));
    case "linux":
      return readLinuxPlugged();
    case "win32":
      return parseWindowsBatteryStatus(runPowerShell(WINDOWS_BATTERY_STATUS_QUERY));
    default:
      throw new Error(`Plataforma no soportada para detectar energía: ${platform}`);
  }
}
