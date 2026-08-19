import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransportIcon, type TransportIconMode } from './TransportIcon';

const MODES: readonly TransportIconMode[] = [
  'flight',
  'train',
  'bus',
  'suburbanTrain',
  'hotel',
  'transfer',
];

describe('TransportIcon', () => {
  it.each(MODES)('renders an svg for %s without inventing a carrier mark', (mode) => {
    const { container } = render(<TransportIcon mode={mode} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toBe('');
  });
});
