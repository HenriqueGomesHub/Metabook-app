import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppDataProvider } from '../app/AppData';
import { AuthGate } from '../app/AuthGate';
import type { Auth, AuthUser, Mode } from '../data';
import { Blocks } from '../screens/Blocks';
import { Editor } from '../screens/Editor';
import { Login } from '../screens/Login';
import { Placement } from '../screens/Placement';
import { Review } from '../screens/Review';
import { Settings } from '../screens/Settings';
import { Today } from '../screens/Today';
import type { MemoryRepository } from './MemoryRepository';

export const USER: AuthUser = { id: 'local', name: 'Tom Reyes' };

export function fakeAuth(user: AuthUser | null = USER): Auth {
  return {
    getSession: async () => user,
    signInWithEmail: async () => undefined,
    signOut: async () => undefined,
    onAuthChange: () => () => undefined,
  };
}

/** Renders the management screens behind the auth gate, as the app routes them. */
export function renderScreens(
  path: string,
  repo: MemoryRepository,
  options: { mode?: Mode; auth?: Auth } = {},
) {
  return render(
    <AppDataProvider repo={repo} auth={options.auth ?? fakeAuth()} mode={options.mode}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Today />} />
            <Route path="/review" element={<Review />} />
            <Route path="/blocks" element={<Blocks />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/placement/:country" element={<Placement />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppDataProvider>,
  );
}
