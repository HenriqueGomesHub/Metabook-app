import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppDataProvider } from './app/AppData';
import { router } from './app/routes';
import { auth, mode, repo } from './data';
import './styles/tokens.css';
import './components/components.css';
import './screens/screens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDataProvider repo={repo} auth={auth} mode={mode}>
      <RouterProvider router={router} />
    </AppDataProvider>
  </StrictMode>,
);
