export type Platform = "linux" | "darwin" | "win32";

/** Estrategia de detección: por eventos (`fs.watch`) o por polling. */
export type PowerStrategy = "watch" | "poll";

/** Detecta el SO actual a partir de `process.platform`. */
export function detectPlatform(platform: string = process.platform): Platform {
  if (platform === "linux" || platform === "darwin" || platform === "win32") {
    return platform;
  }

  throw new Error(`Plataforma no soportada: ${platform}`);
}

/**
 * Linux expone `/sys/class/power_supply` y permite `fs.watch()`, así que usa
 * eventos. macOS y Windows no tienen un equivalente razonable y usan polling.
 */
export function getStrategy(platform: Platform = detectPlatform()): PowerStrategy {
  return platform === "linux" ? "watch" : "poll";
}
