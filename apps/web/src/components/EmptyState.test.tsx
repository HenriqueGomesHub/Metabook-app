import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders a named region with a headline, a line of text and at most two pill actions', () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <EmptyState
          title="No games yet"
          text="Log one by hand."
          actions={[
            { label: 'Pair', to: '/settings' },
            { label: 'Log', onClick },
            { label: 'Ignored', to: '/' },
          ]}
        />
      </MemoryRouter>,
    );
    const region = screen.getByRole('region', { name: 'No games yet' });
    expect(within(region).getByRole('heading', { name: 'No games yet' })).toBeTruthy();
    expect(within(region).getByText('Log one by hand.')).toBeTruthy();
    expect(within(region).getByRole('link', { name: 'Pair' }).className).toContain('cta');
    fireEvent.click(within(region).getByRole('button', { name: 'Log' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(within(region).queryByText('Ignored')).toBeNull();
  });
});
