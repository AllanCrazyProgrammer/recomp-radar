'use client';
import type {CSSProperties,ReactNode} from 'react';
import {staggerStyle as computeStaggerStyle} from '@/lib/animations';

/**
 * Barra superior de escaneo que muestra actividad visual tipo radar
 * mientras se sincronizan o consultan repositorios en GitHub.
 */
export function SyncScanBar({active}: {active: boolean}) {
  return (
    <div
      className={'sync-scan-bar' + (active ? ' is-active' : '')}
      aria-hidden="true"
    >
      <span className="sync-scan-runner" />
    </div>
  );
}

/**
 * Contenedor que anima la transición al cambiar de vista o pestaña.
 */
export function AnimatedView({
  viewKey,
  className = '',
  children,
}: {
  viewKey: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      key={viewKey}
      className={'animated-view' + (className ? ' ' + className : '')}
    >
      {children}
    </div>
  );
}

/**
 * Calcula la variable CSS --stagger-index para animar listas y cuadrículas de forma escalonada.
 */
export function staggerStyle(index: number, maxIndex = 12): CSSProperties {
  return computeStaggerStyle(index, maxIndex) as CSSProperties;
}
