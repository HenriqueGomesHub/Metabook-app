import type { Card, MediaItem } from '@metabook/core';
import { DEFAULT_SETTINGS } from '@metabook/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../test/MemoryRepository';
import { renderApp } from '../../test/render';

// vi.mock factories are hoisted above imports, so the photos are too
const media = vi.hoisted(() =>
  ['pl', 'lt', 'cz', 'de'].map((country, i): MediaItem => ({
    id: `0a1b2c3d4e${i}f`,
    country,
    subject: 'bollard',
    url: `approved/0a1b2c3d4e${i}f.webp`,
    caption: 'Roadside post at dusk',
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
  answer: '0a1b2c3d4e0f',
  options: ['0a1b2c3d4e1f', '0a1b2c3d4e0f', '0a1b2c3d4e2f', '0a1b2c3d4e3f'],
  prompt: { kind: 'text', value: 'Poland’s bollard?' },
  tags: ['europe', 'bollard'],
  subject: 'bollard',
  media: ['0a1b2c3d4e1f', '0a1b2c3d4e0f', '0a1b2c3d4e2f', '0a1b2c3d4e3f'],
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
    // captions can describe the place, so they stay out of the labels until the reveal
    expect(photos.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Photo 1',
      'Photo 2',
      'Photo 3',
      'Photo 4',
    ]);
    expect(photos[0]?.querySelector('img')?.getAttribute('src')).toBe(
      'https://media.example/approved/0a1b2c3d4e1f.webp',
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
      expect(r.reviews[0]).toMatchObject({ cardId: card.id, correct: false, answerGiven: '0a1b2c3d4e1f' }),
    );
    expect(r.confusions).toEqual([]);
  });

  it('accepts the right photo', async () => {
    renderApp('/session?subject=bollard', repo());
    fireEvent.click(await screen.findByRole('button', { name: 'Photo 2' }));
    expect(screen.getByRole('dialog', { name: 'Got it' })).toBeTruthy();
  });
});
