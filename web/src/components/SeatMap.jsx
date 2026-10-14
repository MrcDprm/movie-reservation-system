// The hall, drawn from the data alone: each seat has a row and a column, so aisles are simply
// empty columns. Every seat is a real button, usable with a keyboard and a screen reader.
import { useLayoutEffect, useRef } from 'react';

import { usePrefs } from '../lib/prefs.jsx';

const STYLE = {
  free: 'border-ink-3/60 bg-transparent text-ink-2 hover:border-velvet hover:bg-velvet/15',
  selected: 'border-velvet bg-velvet text-on-velvet',
  mine: 'border-gold bg-gold text-bg',
  // Held seats may come free again in a few minutes, so they look different from sold ones.
  held: 'border-dashed border-ink-3 bg-ink-3/10 text-transparent cursor-not-allowed',
  sold: 'border-transparent bg-ink-3/55 text-transparent cursor-not-allowed',
};

function Wheelchair() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
      <circle cx="11" cy="4" r="2" fill="currentColor" />
      <path d="M10 8v6h6l3 5M10 11h5M8 10.5a6 6 0 1 0 7.5 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function seatState(seat, selected) {
  if (selected.has(seat.id)) return 'selected';
  if (seat.status === 'mine' || seat.status === 'mine_paid') return 'mine';
  return seat.status; // free, held, sold
}

export default function SeatMap({ seats, selected, onToggle, disabled }) {
  const { t } = usePrefs();
  const rows = [...new Set(seats.map((s) => s.row))];
  const columns = Math.max(...seats.map((s) => s.col));
  const scroller = useRef(null);

  // On a narrow screen the hall may be wider than the box: start in the middle, facing the screen.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (box) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
  }, [columns]);

  return (
    // Seat size follows the screen width (never below a tappable minimum, never above 2rem).
    <div ref={scroller} className="overflow-x-auto pb-2" style={{ '--seat': `clamp(1.2rem, calc((100vw - 5.5rem) / ${columns}), 2rem)` }}>
      <div className="mx-auto w-max min-w-full px-2">
        {/* The screen: a soft curve of light at the front of the hall. */}
        <div className="mx-auto mb-8 max-w-md text-center">
          <div className="h-2 rounded-[50%] bg-gradient-to-b from-gold/70 to-transparent" />
          <p className="mt-2 text-[0.65rem] font-bold uppercase tracking-[0.35em] text-ink-3">{t('seats.screen')}</p>
        </div>

        <div className="grid gap-1 sm:gap-1.5" role="group" aria-label={t('seats.map')}>
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-1.5 sm:gap-2">
              <span className="w-4 text-center font-mono text-xs text-ink-3" aria-hidden="true">{row}</span>
              <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, var(--seat))` }}>
                {seats
                  .filter((s) => s.row === row)
                  .map((seat) => {
                    const state = seatState(seat, selected);
                    const clickable = !disabled && (state === 'free' || state === 'selected');
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        style={{ gridColumn: seat.col }}
                        className={`grid aspect-square place-items-center rounded-t-lg rounded-b-sm border text-[0.6rem] font-bold ${STYLE[state]}`}
                        disabled={!clickable}
                        aria-pressed={state === 'selected'}
                        aria-label={t('seats.label', {
                          row,
                          number: seat.number,
                          state: t(`seats.state.${state}`),
                          extra: seat.kind === 'ACCESSIBLE' ? `, ${t('seats.accessible')}` : '',
                        })}
                        onClick={() => onToggle(seat)}
                      >
                        {seat.kind === 'ACCESSIBLE' && (state === 'free' || state === 'selected' || state === 'mine') ? <Wheelchair /> : seat.number}
                      </button>
                    );
                  })}
              </div>
              <span className="hidden w-4 text-center font-mono text-xs text-ink-3 sm:inline" aria-hidden="true">{row}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SeatLegend() {
  const { t } = usePrefs();
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-2">
      {['free', 'selected', 'mine', 'held', 'sold'].map((state) => (
        <li key={state} className="flex items-center gap-2">
          <span className={`inline-block h-4 w-4 rounded-t-md rounded-b-sm border ${STYLE[state]}`} aria-hidden="true" />
          {t(`seats.legend.${state}`)}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className="grid h-4 w-4 place-items-center rounded-t-md rounded-b-sm border border-ink-3/60 text-ink-2" aria-hidden="true">
          <Wheelchair />
        </span>
        {t('seats.accessible')}
      </li>
    </ul>
  );
}
