import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<main>screen</main>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('renders the five navigation links', () => {
    renderAt('/');
    for (const label of ['Today', 'Drills', 'Game review', 'Atlas', 'Stats']) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it('leaves the main landmark to the screen', () => {
    renderAt('/');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('hides the navigation inside sessions', () => {
    renderAt('/session');
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });
});
