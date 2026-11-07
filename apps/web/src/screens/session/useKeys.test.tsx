import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeys } from './useKeys';

function Probe({ handler }: { handler(event: KeyboardEvent): void }) {
  useKeys(handler);
  return null;
}

describe('useKeys', () => {
  it('ignores keydowns already handled elsewhere or auto-repeated', () => {
    const handler = vi.fn();
    render(<Probe handler={handler} />);
    window.addEventListener('keydown', (e) => e.key === 'x' && e.preventDefault(), true);
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: ' ', repeat: true });
    expect(handler).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: ' ' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
