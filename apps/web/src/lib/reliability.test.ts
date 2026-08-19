import { describe, expect, it } from 'vitest';
import { reliabilityGrade } from './reliability';

describe('reliabilityGrade', () => {
  it('maps score bands to letters without treating color as the only signal', () => {
    expect(reliabilityGrade(84).letter).toBe('A');
    expect(reliabilityGrade(71).letter).toBe('B');
    expect(reliabilityGrade(52).letter).toBe('C');
    expect(reliabilityGrade(41).letter).toBe('D');
  });
});
