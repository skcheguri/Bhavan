import { describe, it, expect } from 'vitest';
import { partyName } from './useReviews';

// The tenancy picker names the other party from the rental agreement,
// which stores that name as free text. On real agreements that text is
// sometimes an email address, which then appeared on screen as though it
// were a person's name.
describe('partyName', () => {
  it('uses the name on the agreement when it is a name', () => {
    expect(partyName('Sai Krishna Reddy', 'S. K. Reddy')).toBe('Sai Krishna Reddy');
  });

  it('falls back to the account name when the agreement holds an email', () => {
    expect(partyName('skrockster@gmail.com', 'skrockster')).toBe('skrockster');
  });

  it('uses the agreement name when the account has no name', () => {
    expect(partyName('Priya Sharma', null)).toBe('Priya Sharma');
  });

  it('uses the account name when the agreement has none', () => {
    expect(partyName('', 'Arjun Mehta')).toBe('Arjun Mehta');
  });

  // Not reachable in today's data, which is exactly why it is pinned:
  // showing a bare local part is still better than putting a full
  // address in front of the other party.
  it('shows the part before the @ when both are emails', () => {
    expect(partyName('a@b.com', 'c@d.com')).toBe('a');
  });

  it('does not mistake a name containing @ for an email', () => {
    expect(partyName('Flat 2 @ Rohini', null)).toBe('Flat 2 @ Rohini');
  });

  it('says Unnamed when there is nothing to show', () => {
    expect(partyName(null, undefined)).toBe('Unnamed');
    expect(partyName('  ', '')).toBe('Unnamed');
  });
});
