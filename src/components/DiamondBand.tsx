import { cn } from '@/lib/utils';

/**
 * The Ciment packaging pattern as a decorative band: whole diamonds (squares turned 45°, 64px across),
 * in rows offset by half a diamond. Even rows alternate deep / mid blue per diamond, odd rows are sky
 * blue, and the whole band sits at `--band-opacity`. Row 0 is centred on the top edge (it runs on under
 * the top of the viewport); the last row is whole, so the bottom edge is a row of points, never a
 * straight cut.
 *
 * The sky rows are drawn as one rectangle under the even rows: diamonds tile the plane, so whatever the
 * even rows leave uncovered inside it is exactly the odd rows — and no two translucent shapes meet on
 * an anti-aliased edge (no hairline seams). The group fades as a whole for the same reason.
 */
const DIAGONAL = 64;
const HALF = DIAGONAL / 2;
/** Row centres 0…256: nine rows, the last one whole → 288px tall. */
const ROWS = 9;
/** 4608px across, centred: wider than any screen the app runs on. */
const COLUMNS = 72;
const WIDTH = COLUMNS * DIAGONAL;
const LAST_CENTRE = (ROWS - 1) * HALF;
export const DIAMOND_BAND_HEIGHT = LAST_CENTRE + HALF;

function diamond(cx: number, cy: number) {
  return `M${cx} ${cy - HALF}L${cx + HALF} ${cy}L${cx} ${cy + HALF}L${cx - HALF} ${cy}Z`;
}

function evenRows(parity: 0 | 1) {
  const parts: string[] = [];
  for (let row = 0; row < ROWS; row += 2) {
    for (let col = parity; col <= COLUMNS; col += 2) parts.push(diamond(col * DIAGONAL, row * HALF));
  }
  return parts.join('');
}

const DEEP = evenRows(0);
const MID = evenRows(1);

export function DiamondBand({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width="100%"
      height={DIAMOND_BAND_HEIGHT}
      viewBox={`0 0 ${WIDTH} ${DIAMOND_BAND_HEIGHT}`}
      preserveAspectRatio="xMidYMin slice"
      className={cn('pointer-events-none block opacity-(--band-opacity) select-none', className)}
    >
      <rect x={0} y={0} width={WIDTH} height={LAST_CENTRE} className="fill-band-sky" />
      <path d={DEEP} className="fill-band-deep" />
      <path d={MID} className="fill-band-mid" />
    </svg>
  );
}