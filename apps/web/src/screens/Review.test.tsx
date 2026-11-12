import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

describe('Review', () => {
  it('logs a missed round by hand, records the confusion and shows the miss', async () => {
    const repo = new MemoryRepository();
    renderScreens('/review', repo);

    fireEvent.click(await screen.findByRole('button', { name: 'Log a game' }));
    fireEvent.change(screen.getByLabelText('You guessed'), { target: { value: 'Latvia' } });
    fireEvent.change(screen.getByLabelText('It was'), { target: { value: 'Lithuania' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log game' }));

    expect(await screen.findByText('Latvia', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Logged 1 round, 1 miss');
    await waitFor(() => expect(repo.rounds).toHaveLength(1));
    expect(repo.rounds[0]).toMatchObject({
      source: 'manual',
      guess: { country: 'LV' },
      truth: { country: 'LT' },
    });
    expect(repo.confusions).toMatchObject([{ picked: 'Latvia', truth: 'Lithuania', count: 1 }]);
  });

  it('rejects a row whose country is not in the pool', async () => {
    const repo = new MemoryRepository();
    renderScreens('/review', repo);
    fireEvent.click(await screen.findByRole('button', { name: 'Log a game' }));
    fireEvent.change(screen.getByLabelText('You guessed'), { target: { value: 'Atlantis' } });
    fireEvent.change(screen.getByLabelText('It was'), { target: { value: 'Lithuania' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log game' }));
    expect(await screen.findByText('Pick both countries from the list.')).toBeTruthy();
    expect(repo.rounds).toHaveLength(0);
  });

  it('imports a Round Analyzer file and reports skipped rounds', async () => {
    const repo = new MemoryRepository();
    renderScreens('/review', repo);
    const file = new File(
      [
        JSON.stringify([
          {
            actual: { countryCode: 'LT' },
            guess: { countryCode: 'LV' },
            timestamp: '2026-03-02T18:30:00Z',
          },
          { actual: { lat: 1, lng: 2 }, guess: { countryCode: 'LV' } },
        ]),
      ],
      'rounds.json',
      { type: 'application/json' },
    );
    fireEvent.change(await screen.findByLabelText('Import'), { target: { files: [file] } });
    expect(
      await screen.findByText('Imported 1 round, skipped 1 without country codes'),
    ).toBeTruthy();
    await waitFor(() => expect(repo.rounds).toHaveLength(1));
  });

  it('lists misses before correct rounds within a day', async () => {
    const repo = new MemoryRepository();
    const round = (id: string, playedAt: string, guess: string) => ({
      id,
      source: 'manual' as const,
      playedAt,
      truth: { country: 'LT' },
      guess: { country: guess },
    });
    repo.rounds = [
      round('a', '2026-03-02T20:00:00Z', 'LT'),
      round('b', '2026-03-02T19:00:00Z', 'LV'),
    ];
    renderScreens('/review', repo);
    const items = await screen.findAllByRole('listitem');
    expect(items[0]?.querySelector('.round')?.className).toContain('round-miss');
    expect(items[1]?.querySelector('.round')?.className).not.toContain('round-miss');
  });
});
