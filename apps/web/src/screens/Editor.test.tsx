import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

async function fillNewCard(source: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'New card' }));
  fireEvent.change(screen.getByLabelText('Id'), { target: { value: 'meta:test:1' } });
  fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'LT' } });
  fireEvent.change(screen.getByLabelText('Answer'), { target: { value: 'Lithuania' } });
  fireEvent.change(screen.getByLabelText('Prompt value'), { target: { value: 'Yellow bollards' } });
  fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: source } });
  fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
}

describe('Editor', () => {
  it('rejects a card without a source', async () => {
    const repo = new MemoryRepository();
    renderScreens('/editor', repo);
    await fillNewCard('');
    expect(await screen.findByText('A source URL is required.')).toBeTruthy();
    expect(repo.overrides).toHaveLength(0);
  });

  it('rejects a source that is not http(s)', async () => {
    const repo = new MemoryRepository();
    renderScreens('/editor', repo);
    await fillNewCard('ftp://example.com/x');
    expect(await screen.findByText('Source must be an http(s) URL.')).toBeTruthy();
    expect(repo.overrides).toHaveLength(0);
  });

  it('saves a valid new card as an override and lists it', async () => {
    const repo = new MemoryRepository();
    renderScreens('/editor', repo);
    await fillNewCard('https://example.com/source');
    await waitFor(() => expect(repo.overrides).toHaveLength(1));
    expect(repo.overrides[0]).toMatchObject({
      id: 'meta:test:1',
      kind: 'card',
      data: { answer: 'Lithuania', source: 'https://example.com/source' },
    });
    expect(await screen.findByText('Saved meta:test:1.')).toBeTruthy();
  });

  it('rejects an id that already exists', async () => {
    const repo = new MemoryRepository();
    renderScreens('/editor', repo);
    fireEvent.click(await screen.findByRole('button', { name: 'New card' }));
    fireEvent.change(screen.getByLabelText('Id'), { target: { value: 'flag:lt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(await screen.findByText('This id is already used.')).toBeTruthy();
  });
});
