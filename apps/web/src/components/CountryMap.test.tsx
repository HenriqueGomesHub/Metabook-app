import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegionMap } from '../data/content';
import { BrazilMap } from './BrazilMap';
import { CountryMap } from './CountryMap';

// a generated regions file: no capitals, so trails run label to label
const map: RegionMap = {
  country: 'PL',
  viewBox: '0 0 640 400',
  states: [
    {
      code: 'MZ',
      name: 'Masovian Voivodeship',
      path: 'M300,100L400,100L400,200Z',
      label: [360, 140],
    },
    { code: 'LD', name: 'Łódź Voivodeship', path: 'M200,200L300,200L300,300Z', label: [260, 250] },
  ],
};

describe('CountryMap', () => {
  it('renders any regions file and picks by click or keyboard', () => {
    const onPick = vi.fn();
    const onHover = vi.fn();
    render(<CountryMap map={map} label="Map of Poland" onPick={onPick} onHover={onHover} />);
    expect(screen.getByRole('group', { name: 'Map of Poland' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Masovian Voivodeship' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Łódź Voivodeship' }), { key: 'Enter' });
    expect(onPick.mock.calls).toEqual([['MZ'], ['LD']]);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Łódź Voivodeship' }));
    expect(onHover).toHaveBeenLastCalledWith('LD');
  });

  it('locks on reveal and draws the trail between labels when there are no capitals', () => {
    const onPick = vi.fn();
    const { container } = render(
      <CountryMap
        map={map}
        label="Map of Poland"
        reveal={{ answer: 'MZ', picked: 'LD', group: new Set() }}
        onPick={onPick}
        onHover={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Masovian Voivodeship' }));
    expect(onPick).not.toHaveBeenCalled();
    expect(container.querySelector('.ddd-state.ans')?.getAttribute('aria-label')).toBe(
      'Masovian Voivodeship',
    );
    expect(container.querySelector('.ddd-trail')?.getAttribute('d')).toBe('M260 250L360 140');
  });

  it('frames inset islands without making the frames pickable', () => {
    const { container } = render(
      <CountryMap
        map={{ ...map, insets: [{ x: 8, y: 300, w: 120, h: 80 }] }}
        label="Map of Poland"
        onPick={() => undefined}
        onHover={() => undefined}
      />,
    );
    const frames = container.querySelectorAll('rect.ddd-inset');
    expect(frames).toHaveLength(1);
    expect(['x', 'y', 'width', 'height'].map((a) => frames[0]?.getAttribute(a))).toEqual([
      '8',
      '300',
      '120',
      '80',
    ]);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('keeps Brazil working through the BrazilMap wrapper, callouts included', () => {
    const onPick = vi.fn();
    const { container } = render(<BrazilMap onPick={onPick} onHover={() => undefined} />);
    expect(screen.getByRole('group', { name: 'Map of Brazil with state borders' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(27);
    expect(container.querySelectorAll('.ddd-label.callout')).toHaveLength(8);
    fireEvent.click(container.querySelector('.ddd-hit') as Element);
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
