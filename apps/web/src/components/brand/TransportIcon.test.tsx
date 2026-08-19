import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransportIcon } from './TransportIcon';

describe('TransportIcon', () => {
  it.each(['flight', 'train', 'bus', 'suburbanTrain', 'hotel'] as const)(
    'renders %s as a decorative authored SVG',
    (mode) => {
      const { container } = render(<TransportIcon mode={mode} />);
      const icon = container.querySelector('svg');

      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.hasAttribute('role')).toBe(false);
      expect(icon?.querySelector('path, rect, circle')).not.toBeNull();
    },
  );
});
