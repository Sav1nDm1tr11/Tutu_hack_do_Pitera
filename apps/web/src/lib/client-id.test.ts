import { describe, expect, it } from 'vitest';
import { createClientId } from './client-id';

describe('createClientId', () => {
  it('returns a prefixed id', () => {
    const id = createClientId('req');
    expect(id.startsWith('req_')).toBe(true);
    expect(id.length).toBeGreaterThan(8);
  });
});
