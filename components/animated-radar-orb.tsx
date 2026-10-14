'use client';
import {useId} from 'react';

export interface AnimatedRadarOrbProps {
  small?: boolean;
  scanning?: boolean;
  size?: number;
}

/**
 * Renderiza el radar pixel-art con barrido rotatorio en vivo,
 * ondas de pulso concéntricas y señales (blips) animadas por cuadrante.
 */
export function AnimatedRadarSvg({
  size = 205,
  scanning = false,
}: {
  size?: number;
  scanning?: boolean;
}) {
  const rawId = useId().replace(/:/g, '');
  const gridId = `radar-grid-${rawId}`;
  const screenId = `radar-screen-${rawId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={'radar-svg' + (scanning ? ' is-scanning' : '')}
    >
      <defs>
        <pattern id={gridId} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#00be00" />
          <path d="M0 6V0h6" fill="none" stroke="#073b00" strokeWidth="1" />
        </pattern>
        <clipPath id={screenId}>
          <path d="M24 19h16v2h6v3h4v4h3v6h2v12h-2v6h-3v4h-4v3h-6v2H24v-2h-6v-3h-4v-4h-3v-6H9V34h2v-6h3v-4h4v-3h6Z" />
        </clipPath>
      </defs>

      {/* Antena metálica y carcasa circular escalonada */}
      <path
        fill="#101010"
        d="M27 1h10v2h4v3h2v6h-3v4H24v-4h-3V6h2V3h4Z"
      />
      <path
        fill="#c0c0c0"
        d="M27 3h10v2h3v5H24V6h3Zm-1 9h12v5H26Z"
      />
      <path
        fill="#fff"
        d="M27 3h5v2h-5Zm-3 3h2v4h-2Zm2 7h3v3h-3Z"
      />
      <path
        fill="#606060"
        d="M35 4h2v2h-2Zm3 3h2v2h-2Zm-3 6h2v2h-2Z"
      />
      <path
        fill="#101010"
        d="M22 13h20v2h7v3h5v5h4v7h2v17h-2v7h-4v4h-5v3h-7v2H22v-2h-7v-3h-5v-4H6v-7H4V30h2v-7h4v-5h5v-3h7Z"
      />
      <path
        fill="#a0a0a0"
        d="M22 15h20v2h7v3h3v4h4v7h2v15h-2v7h-4v3h-4v3h-7v2H23v-2h-7v-3h-4v-4H8v-7H6V31h2v-7h4v-4h4v-3h6Z"
      />
      <path
        fill="#e4e4e4"
        d="M22 15h20v2h7v3h3v4h4v7h2v10h-3V31h-3v-6h-4v-4h-7v-2H23v2h-7v4h-4v6H9v14h2v7h4v4h7v3h-6v-3h-4v-4H8v-7H6V31h2v-7h4v-4h4v-3h6Z"
      />
      <path
        fill="#fff"
        d="M23 16h18v1H23Zm19 2h6v2h-6Zm8 4h2v5h-2Zm-41 9h1v9H9Zm5 23h3v2h-3Zm5 4h7v2h-7Z"
      />
      <path
        fill="#101010"
        d="M23 17h18v2h7v3h4v5h3v6h2v14h-2v6h-3v5h-4v3h-7v1H23v-1h-7v-3h-4v-5H9v-6H7V33h2v-6h3v-5h4v-3h7Z"
      />
      <path
        fill="#808080"
        d="M23 18h18v2h6v3h4v5h3v6h2v12h-2v6h-3v5h-4v3h-6v1H23v-1h-6v-3h-4v-5h-3v-6H8V34h2v-6h3v-5h4v-3h6Z"
      />

      {/* Pantalla interior del radar con barrido y ondas */}
      <g clipPath={`url(#${screenId})`}>
        <rect x="8" y="18" width="48" height="44" fill={`url(#${gridId})`} />

        {/* Onda expansiva desde el centro del radar */}
        <circle
          cx="32"
          cy="40"
          r="6"
          fill="none"
          stroke="#7aff3b"
          strokeWidth="1"
          className="radar-ping-wave"
        />

        {/* Haz de barrido giratorio */}
        <g className="radar-sweep-beam">
          <path d="M32 40V16h16l10 10Z" fill="#50ef00" opacity=".36" />
          <path d="M32 40V18" stroke="#b8ff7a" strokeWidth="1" opacity=".8" />
        </g>

        {/* Ejes de referencia amarillos */}
        <path
          d="M32 30v20M22 40h20"
          stroke="#fff34b"
          strokeWidth="1"
        />
      </g>

      {/* Señales detectadas (blips) separadas por cuadrante para pulso secuencial */}
      <g className="radar-blip radar-blip-1">
        <path
          fill="#ffdd00"
          d="M41 24h4v1h1v4h-1v1h-4v-1h-1v-4h1Z"
        />
        <path fill="#181800" d="M42 26h2v2h-2Z" />
      </g>

      <g className="radar-blip radar-blip-2">
        <path
          fill="#ffdd00"
          d="M17 37h4v1h1v4h-1v1h-4v-1h-1v-4h1Z"
        />
        <path
          fill="#181800"
          d="M17 39h1v1h-1Zm3 0h1v1h-1Zm-3 2h1v1h-1Zm3 0h1v1h-1Z"
        />
      </g>

      <g className="radar-blip radar-blip-3">
        <path
          fill="#ffdd00"
          d="M22 50h4v1h1v4h-1v1h-4v-1h-1v-4h1Z"
        />
        <path
          fill="#181800"
          d="M22 52h1v1h-1Zm3 0h1v1h-1Zm-2 2h1v1h-1Z"
        />
      </g>

      {/* Marcador de dirección central rojo */}
      <g className="radar-center-marker">
        <path
          fill="#700000"
          d="M31 35h2v3h2v3h2v3H27v-3h2v-3h2Z"
        />
        <path fill="#ec1600" d="M31 35h2v4h2v4h-6v-4h2Z" />
        <rect x="32" y="41" width="1" height="1" fill="#101010" />
      </g>

      {/* Luces LED del chasis */}
      <path
        fill="#303030"
        d="M57 36h1v1h-1Zm0 3h1v1h-1Zm0 3h1v1h-1ZM30 61h1v1h-1Zm3 0h1v1h-1Z"
      />
      <rect
        x="57"
        y="36"
        width="1"
        height="1"
        fill="#00ff44"
        className="radar-chassis-led"
      />
    </svg>
  );
}

export function AnimatedRadarOrb({
  small = false,
  scanning = false,
}: AnimatedRadarOrbProps) {
  return (
    <div
      className={
        'radar-orb ' +
        (small ? 'small ' : 'hero-orb ') +
        (scanning ? 'is-scanning' : '')
      }
    >
      <AnimatedRadarSvg size={small ? 43 : 205} scanning={scanning} />
    </div>
  );
}
