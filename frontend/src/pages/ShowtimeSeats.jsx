import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/axios';
import SeatGrid from '../components/SeatGrid';
import LoadingSpinner from '../components/LoadingSpinner';
import Alert from '../components/Alert';

export default function ShowtimeSeats() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['seats', id],
    queryFn: async () => {
      const res = await api.get(`/showtimes/${id}/seats`);
      return res.data.data;
    },
    refetchInterval: 3000,
  });

  const seats = data?.seats ?? [];
  const liveSelected = useMemo(() => {
    const taken = new Set(seats.filter((s) => !s.available).map((s) => s.seatNumber));
    return selected.filter((n) => !taken.has(n));
  }, [seats, selected]);

  const price = Number(data?.showtime?.price || 0);
  const total = (liveSelected.length * price).toFixed(2);

  const toggle = (seatNumber) => {
    setSelected((prev) =>
      prev.includes(seatNumber) ? prev.filter((n) => n !== seatNumber) : [...prev, seatNumber]
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/reservations', {
        showtimeId: id,
        seatNumbers: liveSelected,
      });
      return res.data.data.reservation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seats', id] });
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
      navigate('/reservations');
    },
    onError: (err) => {
      setMessage(err.message);
      queryClient.invalidateQueries({ queryKey: ['seats', id] });
    },
  });

  if (isLoading) return <LoadingSpinner label="Loading seat map…" />;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert>{error.message}</Alert>
      </div>
    );
  }

  const { showtime, availableCount } = data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 animate-fade-in">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neon-cyan">{showtime.movie.genre}</p>
        <h1 className="page-title">{showtime.movie.title}</h1>
        <p className="section-sub">
          {new Date(showtime.startTime).toLocaleString()} · ${price.toFixed(2)} / seat ·{' '}
          {availableCount} available
          {isFetching && <span className="ml-2 text-neon-cyan/70">· live</span>}
        </p>
      </div>

      {message && <Alert onClose={() => setMessage('')}>{message}</Alert>}

      <div className="glass rounded-2xl p-4 sm:p-8">
        <SeatGrid seats={seats} selected={liveSelected} onToggle={toggle} />
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-silver-300">
          Selected:{' '}
          <span className="font-medium text-silver-100">
            {liveSelected.length ? [...liveSelected].sort((a, b) => a - b).join(', ') : 'none'}
          </span>
          <span className="ml-3 text-neon-cyan">Total ${total}</span>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={!liveSelected.length || mutation.isPending}
          onClick={() => {
            setMessage('');
            mutation.mutate();
          }}
        >
          {mutation.isPending ? 'Reserving…' : 'Confirm reservation'}
        </button>
      </div>
    </div>
  );
}
