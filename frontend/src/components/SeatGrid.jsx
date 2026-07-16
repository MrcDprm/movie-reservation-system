export default function SeatGrid({ seats, selected, onToggle }) {
  const selectedSet = new Set(selected);

  return (
    <div>
      <div className="mb-6 flex justify-center">
        <div className="w-3/4 max-w-md rounded-t-full border border-white/10 bg-gradient-to-b from-white/15 to-transparent py-2 text-center text-[10px] uppercase tracking-[0.4em] text-silver-300">
          Screen
        </div>
      </div>

      <div className="mx-auto grid max-w-xl grid-cols-10 gap-1.5 sm:gap-2">
        {seats.map((seat) => {
          const isSelected = selectedSet.has(seat.seatNumber);
          const isTaken = !seat.available;

          let classes =
            'aspect-square rounded-md text-[10px] sm:text-xs font-medium transition border ';
          if (isTaken) {
            classes += 'cursor-not-allowed border-gunmetal-600 bg-gunmetal-700 text-silver-400/50';
          } else if (isSelected) {
            classes +=
              'border-neon-cyan bg-gradient-to-br from-neon-blue to-neon-purple text-white shadow-glow scale-105';
          } else {
            classes +=
              'cursor-pointer border-white/15 bg-gunmetal-800 text-silver-200 hover:border-neon-purple/60 hover:bg-gunmetal-700';
          }

          return (
            <button
              key={seat.seatNumber}
              type="button"
              disabled={isTaken}
              onClick={() => onToggle(seat.seatNumber)}
              className={classes}
              title={isTaken ? 'Taken' : `Seat ${seat.seatNumber}`}
            >
              {seat.seatNumber}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-silver-400">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-white/15 bg-gunmetal-800" /> Available
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-gradient-to-br from-neon-blue to-neon-purple" /> Selected
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-gunmetal-700" /> Taken
        </span>
      </div>
    </div>
  );
}
