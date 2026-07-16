import { Link } from 'react-router-dom';

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MovieCard({ movie }) {
  const nextShow = movie.showtimes?.[0];

  return (
    <article className="gradient-border animate-slide-up group">
      <div className="gradient-border-inner overflow-hidden">
        <Link to={`/movies/${movie.id}`} className="block">
          <div className="relative aspect-[2/3] overflow-hidden">
            <img
              src={movie.posterUrl}
              alt={movie.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gunmetal-950 via-transparent to-transparent" />
            <span className="absolute left-3 top-3 rounded border border-white/20 bg-gunmetal-900/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-silver-200 backdrop-blur">
              {movie.genre}
            </span>
          </div>
          <div className="p-4">
            <h3 className="font-display text-base font-semibold tracking-wide text-silver-100 group-hover:text-white">
              {movie.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs text-silver-400">{movie.description}</p>
            {nextShow && (
              <p className="mt-3 text-xs text-neon-cyan/90">
                Next · {formatTime(nextShow.startTime)} · ${Number(nextShow.price).toFixed(2)}
              </p>
            )}
          </div>
        </Link>
      </div>
    </article>
  );
}
