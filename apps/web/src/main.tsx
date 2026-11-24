import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppDataProvider } from './app/AppData';
import { router } from './app/routes';
import { auth, curation, mode, repo } from './data';
import './styles/tokens.css';
import './components/components.css';
import './screens/screens.css';

// After a deploy, an open tab still runs the old build, whose code-split files are gone from the
// server: reload once to pick up the new build instead of showing "Couldn't load your data".
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('reloaded-for-deploy')) return;
    sessionStorage.setItem('reloaded-for-deploy', '1');
  } catch {
    /* no storage: still reload, at worst once per failure */
  }
  event.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => {
  // a good load clears the guard, so the next deploy can reload again
  setTimeout(() => {
    try {
      sessionStorage.removeItem('reloaded-for-deploy');
    } catch {
      /* no storage */
    }
  }, 10_000);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDataProvider repo={repo} auth={auth} mode={mode} curation={curation}>
      <RouterProvider router={router} />
    </AppDataProvider>
  </StrictMode>,
);
