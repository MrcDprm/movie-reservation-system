import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';
import MovieCard from '../components/MovieCard';
import LoadingSpinner from '../components/LoadingSpinner';
import Alert from '../components/Alert';

export default function Movies() {
  const [date, setDate] = useState('');

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['movies', date],
    queryFn: async () => {
      const params = date ? { date } : {};
      const res = await api.get('/movies', { params });
      return res.data.data.movies;
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Now Showing</h1>
          <p className="section-sub">Browse films and book premium seats in real time.</p>
        </div>
        <div>
          <label className="label" htmlFor="date">
            Filter by date
          </label>
          <input
            id="date"
            type="date"
            className="input-field !w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {error && <Alert>{error.message}</Alert>}
      {isLoading ? (
        <LoadingSpinner label="Loading movies…" />
      ) : data?.length === 0 ? (
        <p className="py-16 text-center text-silver-400">No movies match this date.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {data?.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      )}
      {isFetching && !isLoading && (
        <p className="mt-4 text-center text-xs text-silver-400">Refreshing…</p>
      )}
    </div>
  );
}
