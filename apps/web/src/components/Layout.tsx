import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded px-2 py-1 text-sm font-medium ${isActive ? 'bg-lake-soft text-lake-dark' : 'text-ink/70 hover:text-ink'}`;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-mist bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="font-display text-xl font-extrabold text-lake-dark">
            Services Mall
          </Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            {user && <NavLink to="/bookings" className={link}>My bookings</NavLink>}
            {user && <NavLink to="/owner" className={link}>{user.role === 'customer' ? 'Open a shop' : 'My shops'}</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin" className={link}>Admin</NavLink>}
            {user ? (
              <button className="btn-ghost ml-2" onClick={logout}>Sign out</button>
            ) : (
              <>
                <NavLink to="/login" className={link}>Sign in</NavLink>
                <Link to="/register" className="btn-primary ml-1">Create account</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-mist bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-4 py-4 text-sm text-ink/60">
          <span>Services Mall. Book local services and order fresh goods.</span>
          <Link to="/terms" className="underline">Terms of use</Link>
        </div>
      </footer>
    </div>
  );
}
