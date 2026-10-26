import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LockKeyhole, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage({ language, setLanguage }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const gu = language === 'gu';

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.errors?.email?.[0] ||
        err.response?.data?.message ||
        'Login failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8">
        <div className="flex justify-end">
          <select
            aria-label="Language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="border rounded-lg p-2"
          >
            <option value="gu">ગુજરાતી</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="text-center mt-4 mb-8">
          <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl mx-auto flex items-center justify-center">
            <Store size={30} />
          </div>
          <h1 className="text-3xl font-bold mt-4">
            {gu ? 'સ્માર્ટ ખાતું' : 'Smart Khata'}
          </h1>
          <p className="text-slate-500 mt-2">
            {gu ? 'દુકાનદાર લૉગિન' : 'Store Owner Login'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-xl px-4 py-3"
              placeholder="owner@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {gu ? 'પાસવર્ડ' : 'Password'}
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-xl px-4 py-3"
            />
          </div>

          {error && (
            <p role="alert" className="text-red-600 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-semibold disabled:opacity-50 flex justify-center items-center gap-2"
          >
            <LockKeyhole size={18} />
            {submitting
              ? (gu ? 'કૃપા કરીને રાહ જુઓ...' : 'Please wait...')
              : (gu ? 'લૉગિન કરો' : 'Login')}
          </button>
        </form>
      </div>
    </div>
  );
}