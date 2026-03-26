import { Link, NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';

const links = [
  { to: '/', label: 'Home' },
  { to: '/beans', label: 'Beans' },
  { to: '/all-cups', label: 'All Cups' },
  { to: '/best-cups', label: 'Best Cups' },
  { to: '/settings', label: 'Settings' }
];

export function NavBar() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className="bg-espresso/90 backdrop-blur-md border-b border-caramel/30 sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 text-crema">
        <Link to="/" className="flex items-center gap-2 text-2xl font-display tracking-wide">
          <span role="img" aria-hidden>
            ☕️
          </span>
          Coffee Journal
        </Link>
        <nav className="hidden gap-6 text-sm uppercase tracking-[0.2em] md:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                clsx('transition-colors text-crema/70 hover:text-crema', isActive && 'text-caramel')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="#quick-log"
            className="rounded-full bg-caramel px-4 py-2 text-espresso text-sm font-semibold shadow-card"
          >
            Quick Log
          </a>
          {user && (
            <div className="hidden items-center gap-2 text-sm text-crema/70 md:flex">
              <span>{user.display_name || user.email}</span>
              <button
                onClick={handleLogout}
                className="text-caramel/80 hover:text-caramel transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
