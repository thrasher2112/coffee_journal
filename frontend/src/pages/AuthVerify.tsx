import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { verifyMagicLink } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export function AuthVerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const verifyAttempted = useRef(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('No verification token found.');
      return;
    }

    if (verifyAttempted.current) return;
    verifyAttempted.current = true;

    async function verify() {
      try {
        await verifyMagicLink(token!);
        await checkAuth();
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed.');
      }
    }

    verify();
  }, [searchParams, navigate, checkAuth]);

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
