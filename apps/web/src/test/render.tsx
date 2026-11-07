import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppDataProvider } from '../app/AppData';
import type { Auth } from '../data';
import { Session } from '../screens/Session';
import { Today } from '../screens/Today';
import type { MemoryRepository } from './MemoryRepository';

const auth: Auth = {
  getSession: async () => ({ id: 'local', name: 'Tom Reyes' }),
  signInWithEmail: async () => undefined,
  signOut: async () => undefined,
  onAuthChange: () => () => undefined,
};

export function renderApp(path: string, repo: MemoryRepository) {
  return render(
    <AppDataProvider repo={repo} auth={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/session" element={<Session />} />
        </Routes>
      </MemoryRouter>
    </AppDataProvider>,
  );
}
