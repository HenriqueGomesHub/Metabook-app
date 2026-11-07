import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Prompt } from './Prompt';

const prompt = {
  kind: 'image' as const,
  value: 'https://example.com/a.jpg',
  credit: 'Ana · CC BY',
  creditUrl: 'https://example.com/ana',
};

describe('Prompt image credit', () => {
  it('stays hidden until the card is revealed', () => {
    const { rerender } = render(<Prompt prompt={prompt} alt="Scene" />);
    expect(screen.queryByText('Ana · CC BY')).toBeNull();
    rerender(<Prompt prompt={prompt} alt="Scene" revealed />);
    expect(screen.getByRole('link', { name: 'Ana · CC BY' })).toBeTruthy();
  });
});
