import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { NotFoundPage } from '../pages/NotFoundPage';

export function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main className="page">
        <div className="detail-skeleton" />
      </main>
    );
  }
  if (user?.role !== 'admin') return <NotFoundPage />;
  return <>{children}</>;
}
