'use client';
import {useEffect,useState} from 'react';
import {MOTION_STORAGE_KEY,resolveMotionPreference} from '@/lib/animations';

function applyDocumentMotion(active: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-motion', active ? 'on' : 'off');
}

/**
 * Control accesible en la barra de ventana para activar o pausar las animaciones.
 * Respeta prefers-reduced-motion por defecto y guarda la preferencia del usuario.
 */
export function MotionToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const syncPreference = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(MOTION_STORAGE_KEY);
      } catch {
        /* Fallback a preferencia del sistema si localStorage no está disponible. */
      }
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const active = resolveMotionPreference(stored, prefersReduced);
      setEnabled(active);
      applyDocumentMotion(active);
    };

    const frame = requestAnimationFrame(syncPreference);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMediaChange = () => syncPreference();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MOTION_STORAGE_KEY && event.key !== null) return;
      syncPreference();
    };

    media.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorage);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    applyDocumentMotion(next);
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* La preferencia permanece activa en la sesión actual. */
    }
  }

  return (
    <button
      type="button"
      className="motion-toggle"
      aria-label={enabled ? 'Pausar animaciones' : 'Activar animaciones'}
      aria-pressed={enabled}
      title={
        enabled
          ? 'Animaciones activadas · pausar'
          : 'Animaciones en pausa · activar'
      }
      onClick={toggle}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        shapeRendering="crispEdges"
        className="motion-toggle-icon"
      >
        <path
          fill="currentColor"
          d="M7 1h2v3h2v2h3v2h-3v2H9v3H7v-3H5V8H2V6h3V4h2Z"
        />
        {enabled ? (
          <>
            <rect x="12" y="1" width="2" height="2" fill="currentColor" />
            <rect x="2" y="12" width="2" height="2" fill="currentColor" />
          </>
        ) : (
          <path
            stroke="currentColor"
            strokeWidth="1.5"
            d="M2 2l12 12"
          />
        )}
      </svg>
      <span>Animación</span>
    </button>
  );
}
