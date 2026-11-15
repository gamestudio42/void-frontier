import { describe, expect, it } from 'vitest';
import type { AbilityKind } from '@void-frontier/content';
import { padVerb } from '../src/verbs.ts';

const fit = (...kinds: AbilityKind[]) => new Set(kinds);

describe('the gamepad d-pad verbs', () => {
  it('zooms when no module gives the verb', () => {
    expect(padVerb('up', fit(), 0)).toBeNull();
    expect(padVerb('down', fit('dash'), 2)).toBeNull();
  });

  it('dashes on up', () => {
    expect(padVerb('up', fit('dash', 'chaff'), 0)).toBe('dash');
  });

  it('down fires the one defence verb fitted', () => {
    expect(padVerb('down', fit('chaff'), 0)).toBe('chaff');
    expect(padVerb('down', fit('emp'), 3)).toBe('emp');
  });

  it('with both, chaff answers missiles and the EMP answers everything else', () => {
    expect(padVerb('down', fit('chaff', 'emp'), 1)).toBe('chaff');
    expect(padVerb('down', fit('chaff', 'emp'), 0)).toBe('emp');
  });
});
