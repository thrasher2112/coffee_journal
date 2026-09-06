import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { verifyMagicLink } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

/**
 * Pull the token out of the URL fragment.
 *
 * The sign-in link puts it after `#` rather than in the query string because a
 * fragment is never sent to the server: the SPA and the API share one origin,
 * so a `?token=` would be written verbatim into the API's own access log on
 * every sign-in, where it stays replayable until it expires.
 */
function readTokenFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const token = new URLSearchParams(hash).get('token');
  return token && token.trim() ? token : null;
}

export function AuthVerifyPage() {
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const verifyAttempted = useRef(false);

  useEffect(() => {
    const token = readTokenFromHash();
    if (!token) {
      setError('No verification token found.');
      return;
    }

    if (verifyAttempted.current) return;
    verifyAttempted.current = true;

    async function verify() {
      try {
        await verifyMagicLink(token!);
        // Drop the token from the address bar before navigating, so it does not
        // sit in browser history or get shared with a screenshot.
        window.history.replaceState(null, '', window.location.pathname);
        await checkAuth();
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed.');
      }
    }

    verify();
  }, [navigate, checkAuth]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-night px-4">
        <div className="journal-card w-full max-w-md p-8 text-center space-y-4">
          <h1 className="text-2xl font-display text-espresso">Verification failed</h1>
          <p className="text-sm text-moss">{error}</p>
          <Link to="/login" className="inline-block text-sm text-caramel underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-night px-4">
      <div className="journal-card w-full max-w-md p-8 text-center">
        <p className="text-lg text-espresso font-display">Verifying your link...</p>
      </div>
    </div>
  );
}
