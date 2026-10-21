import { describe, expect, it } from 'vitest';
import {
  CONTRACT_STATUSES,
  allowedContractTargets,
  contractTransitions,
  isAllowedContractTransition,
} from './contract-transitions';

describe('contract transition table (D-049)', () => {
  it('covers every ordered from-to pair in the full matrix', () => {
    const allowed = new Set(contractTransitions.map(({ from, to }) => `${from} -> ${to}`));
    for (const from of CONTRACT_STATUSES) {
      for (const to of CONTRACT_STATUSES) {
        expect(isAllowedContractTransition(from, to), `${from} -> ${to}`).toBe(allowed.has(`${from} -> ${to}`));
      }
    }
  });

  it('allows exactly the approved transitions', () => {
    expect(contractTransitions.map(({ from, to }) => `${from} -> ${to}`).sort()).toEqual([
      'Active -> Expired',
      'Active -> Suspended',
      'Active -> Terminated',
      'Draft -> Pending Approval',
      'Expired -> Active',
      'Pending Approval -> Active',
      'Pending Approval -> Draft',
      'Suspended -> Active',
      'Suspended -> Expired',
      'Suspended -> Terminated',
    ].sort());
  });

  it('treats Terminated as terminal and forbids self-transitions', () => {
    expect(allowedContractTargets('Terminated')).toEqual([]);
    for (const status of CONTRACT_STATUSES) {
      expect(isAllowedContractTransition(status, status)).toBe(false);
    }
  });

  it('rejects unknown statuses', () => {
    expect(isAllowedContractTransition('Unknown', 'Active')).toBe(false);
    expect(isAllowedContractTransition('Draft', 'Unknown')).toBe(false);
    expect(allowedContractTargets('Unknown')).toEqual([]);
  });
});
