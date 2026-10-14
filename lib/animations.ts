export const MOTION_STORAGE_KEY = 'recomp-radar-ui-motion';

/**
 * Calcula la variable CSS --stagger-index acotada a maxIndex para evitar
 * demoras excesivas en listas o cuadrículas largas.
 */
export function staggerStyle(
  index: number,
  maxIndex = 12,
): Record<'--stagger-index', number> {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const safeMax = Number.isFinite(maxIndex) ? Math.max(0, Math.floor(maxIndex)) : 12;
  return {
    '--stagger-index': Math.min(safeIndex, safeMax),
  };
}

/**
 * Interpola un contador entero usando una curva easeOutCubic.
 */
export function interpolateCounter(
  startValue: number,
  endValue: number,
  progress: number,
): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const eased = 1 - Math.pow(1 - clamped, 3);
  return Math.round(startValue + (endValue - startValue) * eased);
}

/**
 * Determina si las animaciones deben estar activas según la preferencia guardada
 * por el usuario o la configuración prefers-reduced-motion del sistema.
 */
export function resolveMotionPreference(
  storedValue: string | null | undefined,
  prefersReducedMotion: boolean,
): boolean {
  if (storedValue === 'on') return true;
  if (storedValue === 'off') return false;
  return !prefersReducedMotion;
}
