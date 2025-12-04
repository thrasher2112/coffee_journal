import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { HomePage } from './pages/Home';
import { BeansPage } from './pages/Beans';
import { BrewFormPage } from './pages/BrewForm';
import { SettingsPage } from './pages/Settings';
import { BestCupsPage } from './pages/BestCups';

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-night text-crema">
        <NavBar />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/brew" element={<BrewFormPage />} />
            <Route path="/beans" element={<BeansPage />} />
            <Route path="/best-cups" element={<BestCupsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
