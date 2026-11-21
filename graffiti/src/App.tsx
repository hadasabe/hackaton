import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { Header } from './components/Header';
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
        <strong>Стена</strong>
        <span>граффити Саратова</span>
      </div>
      <p>
        Архив пополняют горожане. Фото принадлежат авторам, работы — художникам.
      </p>
      {!user ? <Link to="/login">Вход для администратора</Link> : null}
    </footer>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ConfirmProvider>
          <div className="app-shell">
          <Header />
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/g/:id" element={<GraffitiPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionPage />} />
            <Route path="/walls" element={<WallsPage />} />
            <Route path="/walk" element={<WalkPage />} />
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
          <Footer />
          </div>
        </ConfirmProvider>
      </AuthProvider>
    </HashRouter>
  );
}
