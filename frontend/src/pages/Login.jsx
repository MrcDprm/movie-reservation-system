import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'ADMIN' ? '/admin' : from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-12 animate-fade-in">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold tracking-[0.15em] text-silver-100">AETHER</h1>
        <p className="mt-2 text-sm text-silver-400">Sign in to reserve your seats</p>
      </div>

      <div className="gradient-border">
        <div className="gradient-border-inner glass p-6 sm:p-8">
          {error && (
            <Alert onClose={() => setError('')}>{error}</Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-silver-400">
            No account?{' '}
            <Link to="/register" className="text-neon-cyan hover:underline">
              Register
            </Link>
          </p>
          <p className="mt-4 text-center text-[11px] text-silver-400/80">
            Demo admin: admin@cinema.com / Admin123!
          </p>
        </div>
      </div>
    </div>
  );
}
