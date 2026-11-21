import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="page page-narrow">
        <div className="detail-skeleton" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page page-narrow">
        <div className="auth-required">
          <div className="login-icon"><LockKeyhole size={24} /></div>
          <span className="section-kicker">Нужен аккаунт</span>
          <h1>Войдите, чтобы предложить работу</h1>
          <p>
            Граффити открыто для всех, а заявки, лайки и комментарии привязаны к аккаунту.
            Так проще бороться со спамом и накрутками.
          </p>
          <div className="row gap-10 wrap center">
            <Link
              to="/login"
              state={{ from: location.pathname }}
              className="button button-dark"
            >
              Войти
            </Link>
            <Link
              to="/register"
              state={{ from: location.pathname }}
              className="button button-outline"
            >
              Зарегистрироваться
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
