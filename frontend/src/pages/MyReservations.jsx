import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export default function MyReservations() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-reservations'],
    queryFn: async () => {
      const res = await api.get('/reservations/me');
      return res.data.data.reservations;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id) => {
      await api.patch(`/reservations/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
    },
  });

  if (isLoading) return <LoadingSpinner label="Loading reservations…" />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 animate-fade-in">
      <h1 className="page-title">My Reservations</h1>
      <p className="section-sub mb-8">View and cancel upcoming bookings.</p>

      {error && <Alert>{error.message}</Alert>}
      {cancelMutation.error && <Alert>{cancelMutation.error.message}</Alert>}

      {!data?.length ? (
        <p className="py-16 text-center text-silver-400">No reservations yet.</p>
      ) : (
        <ul className="space-y-4">
          {data.map((r) => {
            const upcoming = new Date(r.showtime.startTime) > new Date();
            const canCancel = r.status === 'CONFIRMED' && upcoming;
            const seatLabel = r.seats.map((s) => s.seatNumber).join(', ');
            const total = (r.seats.length * Number(r.showtime.price)).toFixed(2);

            return (
              <li key={r.id} className="gradient-border">
                <div className="gradient-border-inner glass flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <img
                    src={r.showtime.movie.posterUrl}
                    alt=""
                    className="h-24 w-16 rounded object-cover"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display font-semibold text-silver-100">
                        {r.showtime.movie.title}
                      </h3>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          r.status === 'CONFIRMED'
                            ? 'bg-neon-cyan/15 text-neon-cyan'
                            : 'bg-silver-400/20 text-silver-400'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-silver-400">{formatTime(r.showtime.startTime)}</p>
                    <p className="mt-1 text-sm text-silver-300">
                      Seats {seatLabel || '—'} · ${total}
                    </p>
                  </div>
                  {canCancel && (
                    <button
                      type="button"
                      className="btn-ghost !text-xs"
                      disabled={cancelMutation.isPending}
                      onClick={() => {
                        if (window.confirm('Cancel this reservation?')) {
                          cancelMutation.mutate(r.id);
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
