import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Alert from '../components/Alert';

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MovieDetail() {
  const { id } = useParams();

  const { data: movie, isLoading, error } = useQuery({
    queryKey: ['movie', id],
    queryFn: async () => {
      const res = await api.get(`/movies/${id}`);
      return res.data.data.movie;
    },
  });

  if (isLoading) return <LoadingSpinner label="Loading film…" />;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert>{error.message}</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 animate-fade-in">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="gradient-border">
          <div className="gradient-border-inner overflow-hidden">
            <img
              src={movie.posterUrl}
              alt={movie.title}
              className="aspect-[2/3] w-full object-cover"
            />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neon-cyan">{movie.genre}</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-silver-100 sm:text-4xl">
            {movie.title}
          </h1>
          <p className="mt-4 max-w-2xl text-silver-300 leading-relaxed">{movie.description}</p>

          <h2 className="mt-10 font-display text-lg font-semibold tracking-wide text-silver-100">
            Upcoming Showtimes
          </h2>
          {movie.showtimes?.length === 0 ? (
            <p className="mt-4 text-sm text-silver-400">No upcoming showtimes.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {movie.showtimes.map((st) => (
                <li
                  key={st.id}
                  className="glass flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-silver-100">{formatTime(st.startTime)}</p>
                    <p className="text-xs text-silver-400">
                      Capacity {st.capacity} · ${Number(st.price).toFixed(2)} / seat
                    </p>
                  </div>
                  <Link to={`/showtimes/${st.id}/seats`} className="btn-primary !text-xs">
                    Select seats
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
