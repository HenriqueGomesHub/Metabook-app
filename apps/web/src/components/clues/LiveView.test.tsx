import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveView } from './LiveView';

const location = {
  pano: 'abc',
  lat: 1,
  lng: 2,
  heading: 30,
  pitch: 0,
  fov: 90,
  source: 'plonkit' as const,
};
const heading = () => /!3f([\d.]+)/.exec(document.querySelector('iframe')?.src ?? '')?.[1];

describe('LiveView', () => {
  afterEach(() => vi.useRealTimers());

  it('opens facing the clue, locked, until answered', () => {
    const { rerender } = render(<LiveView location={location} locked />);
    expect(heading()).toBe('30');
    expect(screen.getByTestId('live-shield')).toBeTruthy();
    rerender(<LiveView location={location} locked={false} />);
    expect(screen.queryByTestId('live-shield')).toBeNull();
  });

  it('facing away, lets the view be dragged and reloads it facing the clue on Show', () => {
    vi.useFakeTimers();
    const shown = vi.fn();
    render(<LiveView location={location} locked awayBy={120} onShown={shown} />);
    expect(heading()).toBe('150');
    expect(screen.queryByTestId('live-shield')).toBeNull();
    expect(screen.getByTestId('live-cover')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(heading()).toBe('30');
    expect(shown).toHaveBeenCalledOnce();
  });

  it('faces the clue once answered', () => {
    const { rerender } = render(<LiveView location={location} locked awayBy={120} />);
    rerender(<LiveView location={location} locked={false} awayBy={120} />);
    expect(heading()).toBe('30');
  });
});
