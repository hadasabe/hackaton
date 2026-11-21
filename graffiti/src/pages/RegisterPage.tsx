import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { BackLink } from '../components/BackLink';

export function RegisterPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedFrom = (location.state as { from?: string } | null)?.from;
  const from = typeof requestedFrom === 'string' && requestedFrom.startsWith('/') && !requestedFrom.startsWith('//') ? requestedFrom : '/';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      setError('Введите корректный email, например name@mail.ru');
      return;
    }
    setSending(true);
    setError('');
    try {
      await api.register(name.trim(), normalizedEmail, password);
      await refresh();
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось зарегистрироваться');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page login-page">
      <BackLink />
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <div className="login-icon"><UserPlus size={24} /></div>
        <span className="section-kicker">Новый аккаунт</span>
        <h1>Регистрация</h1>
        <p>Три поля — и можно ставить лайки, комментировать и присылать работы.</p>

        <label className="field">
          <span>Имя</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            minLength={2}
            maxLength={40}
            placeholder="Как вас показывать"
            required
          />
        </label>
        <label className="field">
          <span>Email <em>например, name@mail.ru</em></span>
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
          <span>Пароль <em>от 8 символов</em></span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        </label>

        {error ? <div className="notice error">{error}</div> : null}

        <button type="submit" className="button button-dark button-wide" disabled={sending}>
          {sending ? 'Создаём…' : 'Создать аккаунт'}
        </button>
        <p className="auth-switch">
          Уже есть аккаунт?{' '}
          <Link to="/login" state={{ from }}>Войти</Link>
        </p>
      </form>
    </main>
  );
}
