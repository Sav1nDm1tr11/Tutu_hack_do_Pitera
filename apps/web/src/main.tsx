import { StrictMode } from 'react';
import '@fontsource-variable/manrope';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './app/AppShell';
import { AboutDataScreen } from './routes/AboutDataScreen';
import { NotFoundScreen } from './routes/NotFoundScreen';
import { OfflineScreen } from './routes/OfflineScreen';
import { PlanScreen } from './routes/PlanScreen';
import { SearchScreen } from './routes/SearchScreen';
import './styles/global.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Не найден корневой элемент #root');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<SearchScreen />} />
          <Route path="plan/:planId" element={<PlanScreen />} />
          <Route path="offline" element={<OfflineScreen />} />
          <Route path="about-data" element={<AboutDataScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
