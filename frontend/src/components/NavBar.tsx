import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';

type NavItem = {
  to: string;
  label: string;
  /** Shorter form for the phone tab bar, where five labels share one row. */
  short: string;
  icon: ReactNode;
};

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

const links: NavItem[] = [
  {
    to: '/',
    label: 'Home',
    short: 'Home',
    icon: (
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...stroke} />
    )
  },
  {
    to: '/beans',
    label: 'Beans',
    short: 'Beans',
    icon: (
      <>
        <path d="M12 3c3.9 0 7 4 7 9s-3.1 9-7 9-7-4-7-9 3.1-9 7-9z" {...stroke} />
        <path d="M12 3c-2.2 3.4-2.2 14.6 0 18" {...stroke} />
      </>
    )
  },
  {
    to: '/all-cups',
    label: 'All Cups',
    short: 'All',
    icon: <path d="M4 6h16M4 12h16M4 18h16" {...stroke} />
  },
  {
    to: '/best-cups',
    label: 'Best Cups',
    short: 'Best',
    icon: (
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"
        {...stroke}
      />
    )
  },
  {
    to: '/settings',
    label: 'Settings',
    short: 'Settings',
    icon: (
      <>
        <path d="M4 8h16M4 16h16" {...stroke} />
        <circle cx="15" cy="8" r="2.4" {...stroke} />
        <circle cx="9" cy="16" r="2.4" {...stroke} />
      </>
    )
  }
];

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

export function NavBar() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      <header className="bg-espresso/90 backdrop-blur-md border-b border-caramel/30 sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 text-crema">
          <Link to="/" className="flex items-center gap-2 text-xl font-display tracking-wide sm:text-2xl">
            <span role="img" aria-hidden>
              ☕️
            </span>
            Coffee Journal
          </Link>
          <nav aria-label="Primary" className="hidden gap-6 text-sm uppercase tracking-[0.2em] md:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  clsx('transition-colors text-crema/70 hover:text-crema', isActive && 'text-caramel')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
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

      {/*
        Phone navigation. Bottom-anchored rather than a hamburger: this app gets
        used one-handed while standing at a counter, so the tabs belong in thumb
        reach. Sign out lives on the Settings screen, which is reachable here.
      */}
      <nav
        aria-label="Bottom navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-caramel/30 bg-espresso/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {links.map((link) => (
            <li key={link.to} className="flex-1">
              <NavLink
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] uppercase tracking-wider transition-colors',
                    isActive ? 'text-caramel' : 'text-crema/60'
                  )
                }
              >
                <Glyph>{link.icon}</Glyph>
                <span>{link.short}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
