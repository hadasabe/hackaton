import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      const result = await api.login(email.trim(), password);
      navigate(result.user.role === 'admin' && from === '/' ? '/admin' : from, { replace: true });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось войти');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page login-page">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> В ленту</Link>
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <div className="login-icon"><LockKeyhole size={24} /></div>
        <span className="section-kicker">Аккаунт</span>
        <h1>Вход</h1>
        <p>Войдите, чтобы ставить реакции, писать комментарии и предлагать работы.</p>

        <label className="field">
          <span>Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error ? <div className="notice error">{error}</div> : null}

        <button type="submit" className="button button-dark button-wide" disabled={sending}>
          {sending ? 'Проверяем…' : 'Войти'}
        </button>
        <p className="auth-switch">
          Нет аккаунта?{' '}
          <Link to="/register" state={{ from }}>Зарегистрироваться</Link>
        </p>
      </form>
    </main>
  );
}
