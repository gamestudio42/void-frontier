interface CompassProps {
  heading: number;
  course: number | null;
}

const TICKS = Array.from({ length: 36 }, (_, i) => i * 10);

/** Heading (blue triangle) and direction of travel (amber arrow) on one dial. */
export function Compass({ heading, course }: CompassProps) {
  return (
    <svg className="compass" viewBox="-60 -60 120 120" aria-hidden="true">
      <circle r="54" className="compass-ring" />
      {TICKS.map((deg) => (
        <line
          key={deg}
          x1="0"
          y1={deg % 90 === 0 ? -54 : -54}
          x2="0"
          y2={deg % 90 === 0 ? -44 : -49}
          className={deg % 90 === 0 ? 'compass-tick major' : 'compass-tick'}
          transform={`rotate(${deg})`}
        />
      ))}
      <text y="-32" className="compass-label">N</text>
      {course !== null && (
        <g transform={`rotate(${course})`} className="compass-course">
          <line x1="0" y1="10" x2="0" y2="-40" />
          <path d="M0 -46 L-5 -36 L5 -36 Z" />
        </g>
      )}
      <g transform={`rotate(${heading})`} className="compass-heading">
        <path d="M0 -30 L-9 12 L0 6 L9 12 Z" />
      </g>
    </svg>
  );
}
