'use client';
import {useEffect,useRef,useState} from 'react';
import {interpolateCounter} from '@/lib/animations';

export interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
}

/**
 * Muestra un número entero interpolando suavemente cuando su valor cambia,
 * respetando prefers-reduced-motion y el control de animaciones de la aplicación.
 */
export function AnimatedCounter({
  value,
  duration = 420,
  className = '',
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [bumping, setBumping] = useState(false);
  const previousRef = useRef(value);

  useEffect(() => {
    const startValue = previousRef.current;
    if (startValue === value) return;
    previousRef.current = value;

    const motionOff =
      typeof document !== 'undefined' &&
      (document.documentElement.getAttribute('data-motion') === 'off' ||
        (document.documentElement.getAttribute('data-motion') !== 'on' &&
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches));

    if (motionOff || duration <= 0) {
      const immediateFrame = requestAnimationFrame(() => {
        setDisplayValue(value);
        setBumping(false);
      });
      return () => cancelAnimationFrame(immediateFrame);
    }

    let rafId = 0;
    const startTime = performance.now();
    const bumpStartFrame = requestAnimationFrame(() => setBumping(true));

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setDisplayValue(interpolateCounter(startValue, value, progress));
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    const bumpTimer = window.setTimeout(() => setBumping(false), 360);

    return () => {
      cancelAnimationFrame(bumpStartFrame);
      cancelAnimationFrame(rafId);
      window.clearTimeout(bumpTimer);
    };
  }, [value, duration]);

  return (
    <span
      className={
        'animated-counter' +
        (bumping ? ' is-bumping' : '') +
        (className ? ' ' + className : '')
      }
    >
      {displayValue}
    </span>
  );
}
