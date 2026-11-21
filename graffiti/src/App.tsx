import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { FeedBackToTop } from './components/FeedBackToTop';
import { SupportNote } from './components/SupportNote';
import { ScrollToTop } from './components/ScrollToTop';
import { AdminGate } from './components/AdminGate';
import { RequireAuth } from './components/RequireAuth';
import { FeedPage } from './pages/FeedPage';
import { GraffitiPage } from './pages/GraffitiPage';
import { WallsPage } from './pages/WallsPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { CollectionPage } from './pages/CollectionPage';
import { WallPage } from './pages/WallPage';
import { NewWallPage } from './pages/NewWallPage';
import { AccountPage } from './pages/AccountPage';
import { SubmitPage } from './pages/SubmitPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminPage } from './pages/AdminPage';
import { WalkPage } from './pages/WalkPage';
import { NotFoundPage } from './pages/NotFoundPage';

function Footer() {
  const { user } = useAuth();
  return (
    <footer className="site-footer">
      <div>
        <strong>Туристический Саратов</strong>
        <span>граффити и прогулки</span>
      </div>
      <p>
        Архив пополняют горожане. Фото принадлежат авторам, работы — художникам.
      </p>
      {!user ? <Link to="/login">Вход для администратора</Link> : null}
      <p className="site-footer-credit">product by team «НАПИШИ 123» © 2026</p>
    </footer>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ConfirmProvider>
          <div className="app-shell">
          <ScrollToTop />
          <Header />
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/map" element={<WalkPage />} />
            <Route path="/graffiti" element={<Navigate to="/" replace />} />
            <Route path="/g/:id" element={<GraffitiPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionPage />} />
            <Route path="/walls" element={<WallsPage />} />
            <Route path="/walk" element={<Navigate to="/map" replace />} />
            <Route path="/r/:slug" element={<WalkPage />} />
            <Route
              path="/walls/new"
              element={(
                <RequireAuth>
                  <NewWallPage />
                </RequireAuth>
              )}
            />
            <Route path="/walls/:id" element={<WallPage />} />
            <Route
              path="/account"
              element={(
                <RequireAuth>
                  <AccountPage />
                </RequireAuth>
              )}
            />
            <Route
              path="/submit"
              element={(
                <RequireAuth>
                  <SubmitPage />
                </RequireAuth>
              )}
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/admin"
              element={(
                <AdminGate>
                  <AdminPage />
                </AdminGate>
              )}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <SupportNote />
          <Footer />
          <BottomNav />
          <FeedBackToTop />
          </div>
        </ConfirmProvider>
      </AuthProvider>
    </HashRouter>
  );
}
