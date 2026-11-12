import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountryList } from './CountryList';

const MANY = ['AD', 'AL', 'AR', 'AT', 'AU', 'BE', 'BG', 'BR', 'CH', 'CL', 'CZ', 'DE'];

describe('CountryList', () => {
  it('shows a short list whole, with no "See all"', () => {
    render(<CountryList codes={['IT', 'GR']} title="Looks the same in" />);
    expect(screen.getByText('Italy, Greece')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull();
  });

  it('cuts a long list to two lines and opens all of it on a sheet', () => {
    render(<CountryList codes={MANY} title="Looks the same in" />);
    expect(document.querySelector('.country-list.cut')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See all 12' }));
    const sheet = screen.getByRole('dialog', { name: 'Looks the same in' });
    // every country, by name and with its flag
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(12);
    expect(within(sheet).getByText('Andorra')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
