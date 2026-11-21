import { lazy, Suspense } from 'react';
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
import { UserPage } from './pages/UserPage';
import { AddObjectPage } from './pages/AddObjectPage';
import { SubmitPage } from './pages/SubmitPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminPage } from './pages/AdminPage';
import { NotFoundPage } from './pages/NotFoundPage';

const MapPage = lazy(() => import('./pages/MapPage').then((module) => ({ default: module.MapPage })));
const ObjectPage = lazy(() => import('./pages/ObjectPage').then((module) => ({ default: module.ObjectPage })));
const RoutePage = lazy(() => import('./pages/RoutePage').then((module) => ({ default: module.RoutePage })));
const RoutesPage = lazy(() => import('./pages/RoutesPage').then((module) => ({ default: module.RoutesPage })));
const AddBuildingPage = lazy(() => import('./pages/AddBuildingPage').then((module) => ({ default: module.AddBuildingPage })));

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
          <Suspense fallback={<main className="page"><div className="detail-skeleton" /></main>}>
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/graffiti" element={<Navigate to="/" replace />} />
            <Route path="/g/:id" element={<GraffitiPage />} />
            <Route path="/object/:id" element={<ObjectPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionPage />} />
            <Route path="/walls" element={<WallsPage />} />
            <Route path="/walk" element={<Navigate to="/map" replace />} />
            <Route path="/r/:slug" element={<RoutePage />} />
            <Route path="/routes/:slug" element={<RoutePage />} />
            <Route path="/u/:id" element={<UserPage />} />
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
            <Route path="/add" element={<AddObjectPage />} />
            <Route
              path="/add-building"
              element={(
                <RequireAuth>
                  <AddBuildingPage />
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
          </Suspense>
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
