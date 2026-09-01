import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { useAutoSync } from './hooks/useBrewSync';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { HomePage } from './pages/Home';
import { BeansPage } from './pages/Beans';
import { BrewFormPage } from './pages/BrewForm';
import { SettingsPage } from './pages/Settings';
import { BestCupsPage } from './pages/BestCups';
import { AllCupsPage } from './pages/AllCups';
import { LoginPage } from './pages/Login';
import { AuthVerifyPage } from './pages/AuthVerify';

function AuthenticatedLayout() {
  useAutoSync();

  return (
    <>
      <NavBar />
      {/* Bottom padding clears the fixed phone tab bar (NavBar) plus the
          iOS home indicator, so the last card is never trapped under it. */}
      <main className="mx-auto max-w-6xl px-4 py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/brew" element={<BrewFormPage />} />
          <Route path="/beans" element={<BeansPage />} />
          <Route path="/all-cups" element={<AllCupsPage />} />
          <Route path="/best-cups" element={<BestCupsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-night text-crema">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/verify" element={<AuthVerifyPage />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AuthenticatedLayout />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </BrowserRouter>
      </PreferencesProvider>
    </AuthProvider>
  );
}
