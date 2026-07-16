import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Alert from '../components/Alert';

const tabs = ['stats', 'movies', 'showtimes', 'users'];

const emptyMovie = { title: '', description: '', posterUrl: '', genre: '' };
const emptyShowtime = {
  movieId: '',
  startTime: '',
  endTime: '',
  capacity: 50,
  price: 12,
};

export default function Admin() {
  const [tab, setTab] = useState('stats');
  const [movieForm, setMovieForm] = useState(emptyMovie);
  const [editingMovieId, setEditingMovieId] = useState(null);
  const [showtimeForm, setShowtimeForm] = useState(emptyShowtime);
  const [feedback, setFeedback] = useState('');
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] });
    queryClient.invalidateQueries({ queryKey: ['movies'] });
  };

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data.data,
    enabled: tab === 'stats',
  });

  const moviesQuery = useQuery({
    queryKey: ['admin', 'movies'],
    queryFn: async () => (await api.get('/admin/movies')).data.data.movies,
    enabled: tab === 'movies' || tab === 'showtimes',
  });

  const showtimesQuery = useQuery({
    queryKey: ['admin', 'showtimes'],
    queryFn: async () => (await api.get('/admin/showtimes')).data.data.showtimes,
    enabled: tab === 'showtimes',
  });

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get('/admin/users')).data.data.users,
    enabled: tab === 'users',
  });

  const saveMovie = useMutation({
    mutationFn: async () => {
      if (editingMovieId) {
        await api.put(`/admin/movies/${editingMovieId}`, movieForm);
      } else {
        await api.post('/admin/movies', movieForm);
      }
    },
    onSuccess: () => {
      setMovieForm(emptyMovie);
      setEditingMovieId(null);
      setFeedback(editingMovieId ? 'Movie updated' : 'Movie created');
      invalidateAll();
    },
    onError: (e) => setFeedback(e.message),
  });

  const deleteMovie = useMutation({
    mutationFn: (id) => api.delete(`/admin/movies/${id}`),
    onSuccess: () => {
      setFeedback('Movie deleted');
      invalidateAll();
    },
    onError: (e) => setFeedback(e.message),
  });

  const createShowtime = useMutation({
    mutationFn: async () => {
      await api.post('/admin/showtimes', {
        ...showtimeForm,
        capacity: Number(showtimeForm.capacity),
        price: Number(showtimeForm.price),
        startTime: new Date(showtimeForm.startTime).toISOString(),
        endTime: new Date(showtimeForm.endTime).toISOString(),
      });
    },
    onSuccess: () => {
      setShowtimeForm(emptyShowtime);
      setFeedback('Showtime created');
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['admin', 'showtimes'] });
    },
    onError: (e) => setFeedback(e.message),
  });

  const deleteShowtime = useMutation({
    mutationFn: (id) => api.delete(`/admin/showtimes/${id}`),
    onSuccess: () => {
      setFeedback('Showtime deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'showtimes'] });
      invalidateAll();
    },
    onError: (e) => setFeedback(e.message),
  });

  const promoteUser = useMutation({
    mutationFn: (id) => api.patch(`/admin/users/${id}/promote`),
    onSuccess: () => {
      setFeedback('User promoted to ADMIN');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => setFeedback(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 animate-fade-in">
      <h1 className="page-title">Admin Console</h1>
      <p className="section-sub mb-6">Manage catalog, capacity, and revenue.</p>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setFeedback('');
              setTab(t);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? 'bg-btn-gradient text-white shadow-glow'
                : 'border border-white/10 bg-white/5 text-silver-300 hover:bg-white/10'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {feedback && (
        <Alert type="success" onClose={() => setFeedback('')}>
          {feedback}
        </Alert>
      )}

      {tab === 'stats' && (
        <StatsPanel query={statsQuery} />
      )}

      {tab === 'movies' && (
        <div className="grid gap-8 lg:grid-cols-2">
          <form
            className="glass space-y-3 rounded-xl p-5"
            onSubmit={(e) => {
              e.preventDefault();
              saveMovie.mutate();
            }}
          >
            <h2 className="font-display text-lg text-silver-100">
              {editingMovieId ? 'Edit movie' : 'Add movie'}
            </h2>
            {['title', 'genre', 'posterUrl'].map((field) => (
              <div key={field}>
                <label className="label">{field}</label>
                <input
                  className="input-field"
                  value={movieForm[field]}
                  onChange={(e) => setMovieForm({ ...movieForm, [field]: e.target.value })}
                  required
                />
              </div>
            ))}
            <div>
              <label className="label">description</label>
              <textarea
                className="input-field min-h-[100px]"
                value={movieForm.description}
                onChange={(e) => setMovieForm({ ...movieForm, description: e.target.value })}
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={saveMovie.isPending}>
                {editingMovieId ? 'Update' : 'Create'}
              </button>
              {editingMovieId && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditingMovieId(null);
                    setMovieForm(emptyMovie);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="space-y-3">
            {moviesQuery.isLoading && <LoadingSpinner />}
            {moviesQuery.data?.map((m) => (
              <div key={m.id} className="glass flex items-start justify-between gap-3 rounded-xl p-4">
                <div>
                  <p className="font-medium text-silver-100">{m.title}</p>
                  <p className="text-xs text-silver-400">{m.genre}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 !text-xs"
                    onClick={() => {
                      setEditingMovieId(m.id);
                      setMovieForm({
                        title: m.title,
                        description: m.description,
                        posterUrl: m.posterUrl,
                        genre: m.genre,
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 !text-xs"
                    onClick={() => {
                      if (window.confirm('Delete this movie and all showtimes?')) {
                        deleteMovie.mutate(m.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'showtimes' && (
        <div className="grid gap-8 lg:grid-cols-2">
          <form
            className="glass space-y-3 rounded-xl p-5"
            onSubmit={(e) => {
              e.preventDefault();
              createShowtime.mutate();
            }}
          >
            <h2 className="font-display text-lg text-silver-100">Add showtime</h2>
            <div>
              <label className="label">Movie</label>
              <select
                className="input-field"
                value={showtimeForm.movieId}
                onChange={(e) => setShowtimeForm({ ...showtimeForm, movieId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {moviesQuery.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Start</label>
              <input
                type="datetime-local"
                className="input-field"
                value={showtimeForm.startTime}
                onChange={(e) => setShowtimeForm({ ...showtimeForm, startTime: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">End</label>
              <input
                type="datetime-local"
                className="input-field"
                value={showtimeForm.endTime}
                onChange={(e) => setShowtimeForm({ ...showtimeForm, endTime: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  className="input-field"
                  value={showtimeForm.capacity}
                  onChange={(e) => setShowtimeForm({ ...showtimeForm, capacity: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field"
                  value={showtimeForm.price}
                  onChange={(e) => setShowtimeForm({ ...showtimeForm, price: e.target.value })}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={createShowtime.isPending}>
              Create showtime
            </button>
          </form>

          <div className="space-y-3">
            {showtimesQuery.isLoading && <LoadingSpinner />}
            {showtimesQuery.data?.map((st) => (
              <div key={st.id} className="glass flex items-start justify-between gap-3 rounded-xl p-4">
                <div>
                  <p className="font-medium text-silver-100">{st.movie?.title}</p>
                  <p className="text-xs text-silver-400">
                    {new Date(st.startTime).toLocaleString()} · ${Number(st.price).toFixed(2)} ·{' '}
                    {st.capacity} seats
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 !text-xs"
                  onClick={() => {
                    if (window.confirm('Delete this showtime?')) deleteShowtime.mutate(st.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-3">
          {usersQuery.isLoading && <LoadingSpinner />}
          {usersQuery.data?.map((u) => (
            <div key={u.id} className="glass flex items-center justify-between rounded-xl p-4">
              <div>
                <p className="text-silver-100">{u.email}</p>
                <p className="text-xs text-silver-400">
                  {u.role} · {u._count.reservations} reservations
                </p>
              </div>
              {u.role !== 'ADMIN' && (
                <button
                  type="button"
                  className="btn-primary !text-xs"
                  onClick={() => promoteUser.mutate(u.id)}
                  disabled={promoteUser.isPending}
                >
                  Promote
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsPanel({ query }) {
  if (query.isLoading) return <LoadingSpinner label="Loading analytics…" />;
  if (query.error) return <Alert>{query.error.message}</Alert>;

  const { summary, capacityReport } = query.data;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Revenue', value: `$${summary.totalRevenue}` },
          { label: 'Seats sold', value: summary.seatsSold },
          { label: 'Confirmed', value: summary.confirmedReservations },
          { label: 'Movies', value: summary.movieCount },
        ].map((card) => (
          <div key={card.label} className="gradient-border">
            <div className="gradient-border-inner glass p-5">
              <p className="text-xs uppercase tracking-wider text-silver-400">{card.label}</p>
              <p className="mt-2 font-display text-2xl font-bold text-silver-100">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-4 font-display text-lg text-silver-100">Capacity report</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-gunmetal-800 text-xs uppercase tracking-wider text-silver-400">
              <tr>
                <th className="px-4 py-3">Movie</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">Fill</th>
                <th className="px-4 py-3">Seats</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {capacityReport.map((row) => (
                <tr key={row.showtimeId} className="border-t border-white/5">
                  <td className="px-4 py-3 text-silver-100">{row.movieTitle}</td>
                  <td className="px-4 py-3 text-silver-400">
                    {new Date(row.startTime).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-neon-cyan">{row.fillRate}%</td>
                  <td className="px-4 py-3 text-silver-300">
                    {row.reserved}/{row.capacity}
                  </td>
                  <td className="px-4 py-3">${Number(row.price).toFixed(2)}</td>
                  <td className="px-4 py-3">${Number(row.projectedRevenue).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
