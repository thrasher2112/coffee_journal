import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-night px-4">
      <div className="journal-card w-full max-w-md p-8">
        <h1 className="text-3xl font-display text-espresso text-center mb-2">Coffee Journal</h1>
        <p className="text-sm text-moss text-center mb-6">Sign in to start logging brews</p>

        {sent ? (
          <div className="text-center space-y-3">
            <p className="text-lg text-espresso font-display">Check your email</p>
            <p className="text-sm text-moss">
              We sent a sign-in link to <span className="text-caramel">{email}</span>.
              Click the link to continue.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-sm text-caramel underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-moss">Email address</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema placeholder:text-crema/40"
                disabled={loading}
              />
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-caramel px-4 py-2 text-espresso font-semibold shadow-card disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
