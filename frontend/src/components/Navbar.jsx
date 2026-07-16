import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const linkClass = ({ isActive }) =>
  `text-sm font-medium transition ${
    isActive ? 'text-neon-cyan' : 'text-silver-300 hover:text-white'
  }`;

export default function Navbar() {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="glass-nav sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-btn-gradient shadow-glow">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M7 5v14M17 5v14" />
            </svg>
          </span>
          <div>
            <p className="font-display text-sm font-bold tracking-[0.2em] text-silver-100 group-hover:text-white">
              AETHER
            </p>
            <p className="text-[10px] uppercase tracking-[0.35em] text-silver-400">Cinema</p>
          </div>
        </Link>

        {isAuthenticated && (
          <nav className="hidden items-center gap-6 md:flex">
            <NavLink to="/" end className={linkClass}>
              Movies
            </NavLink>
            <NavLink to="/reservations" className={linkClass}>
              My Reservations
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={linkClass}>
                Admin
              </NavLink>
            )}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="hidden text-xs text-silver-400 sm:inline">{user?.email}</span>
              <button type="button" onClick={handleLogout} className="btn-ghost !py-1.5 !text-xs">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost !py-1.5 !text-xs">
                Login
              </Link>
              <Link to="/register" className="btn-primary !py-1.5 !text-xs">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
