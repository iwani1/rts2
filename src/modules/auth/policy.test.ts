import { describe, expect, it } from 'vitest';
import { mayStartSession } from './policy';

describe('mayStartSession', () => {
  it('allows only explicitly active accounts', () => {
    expect(mayStartSession('ACTIVE')).toBe(true);
    expect(mayStartSession('SUSPENDED')).toBe(false);
    expect(mayStartSession('INVITED')).toBe(false);
    expect(mayStartSession(undefined)).toBe(false);
    expect(mayStartSession(null)).toBe(false);
  });
});
