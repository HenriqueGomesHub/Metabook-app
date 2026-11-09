import type { Card, MediaItem } from '@metabook/core';
import { DEFAULT_SETTINGS } from '@metabook/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../test/MemoryRepository';
import { renderApp } from '../../test/render';

// vi.mock factories are hoisted above imports, so the photos are too
const media = vi.hoisted(() =>
  ['pl', 'lt', 'cz', 'de'].map((country): MediaItem => ({
    id: `${country}-c1`,
    country,
    subject: 'bollard',
    url: `approved/${country}/${country}-c1.webp`,
    width: 1280,
    height: 960,
    credit: `Ana Ruiz ${country} · Wikimedia Commons · CC BY-SA 4.0`,
    licence: 'CC BY-SA 4.0',
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${country}.jpg`,
  })),
);

const card: Card = {
  id: 'gen:pl:bollard:choice',
  type: 'photo-choice',
  country: 'PL',
  answer: 'pl-c1',
  options: ['lt-c1', 'pl-c1', 'cz-c1', 'de-c1'],
  prompt: { kind: 'text', value: 'Poland’s bollard?' },
  tags: ['europe', 'bollard'],
  subject: 'bollard',
  media: ['lt-c1', 'pl-c1', 'cz-c1', 'de-c1'],
  source: 'https://example.com',
};
const other: Card = { ...card, id: 'flag:pl', type: 'flag', subject: undefined };

vi.mock('../../data/content', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadContent: async () => ({ pool: [], chapters: [], cards: [card, other], tips: [] }),
}));
vi.mock('../../data/media', () => ({
  mediaById: new Map(media.map((m) => [m.id, m])),
  mediaUrl: (path: string) => `https://media.example/${path}`,
}));

const repo = () => {
  const r = new MemoryRepository();
  r.settings = { ...DEFAULT_SETTINGS, newPerDay: 5 };
  return r;
};

describe('PhotoChoiceCard', () => {
  it('shows four photos without credits, and picks with number keys', async () => {
    const r = repo();
    renderApp('/session?subject=bollard', r);
    expect(await screen.findByRole('heading', { name: 'Poland’s bollard?' })).toBeTruthy();
    const photos = screen.getAllByRole('button', { name: /^Photo \d/ });
    expect(photos).toHaveLength(4);
    expect(photos[0]?.querySelector('img')?.getAttribute('src')).toBe(
      'https://media.example/approved/lt/lt-c1.webp',
    );
    expect(screen.queryByText(/Wikimedia Commons/)).toBeNull();

    fireEvent.keyDown(window, { key: '1' });
    const dialog = screen.getByRole('dialog', { name: 'Not quite — it’s the marked photo' });
    expect(within(dialog).getByText('You picked Lithuania’s bollard')).toBeTruthy();
    // credits and countries appear once answered
    expect(screen.getByText('Ana Ruiz pl · Wikimedia Commons · CC BY-SA 4.0')).toBeTruthy();
    expect(screen.getByText('Poland')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Photo \d/ })[0]?.hasAttribute('disabled')).toBe(
      true,
    );
    await waitFor(() =>
      expect(r.reviews[0]).toMatchObject({ cardId: card.id, correct: false, answerGiven: 'lt-c1' }),
    );
    expect(r.confusions).toEqual([]);
  });

  it('accepts the right photo', async () => {
    renderApp('/session?subject=bollard', repo());
    fireEvent.click(await screen.findByRole('button', { name: 'Photo 2' }));
    expect(screen.getByRole('dialog', { name: 'Got it' })).toBeTruthy();
  });
});
