import { describe, it, expect } from 'vitest';
import { describeAlert, type ErrorRateAlert } from './useErrorRateAlerts';

// The admin screens need an MFA'd session to render, so this wording is
// otherwise unverifiable without a live admin login. It is also the part
// that matters most: an alert that describes the wrong incident is worse
// than no alert, because it reads as reassurance.

type AlertInput = Parameters<typeof describeAlert>[0];

const base: AlertInput = {
  kind: 'error_rate',
  detail: null,
  errorCount: 12,
  thresholdCount: 10,
  windowStart: '2026-08-04T10:00:00Z',
  windowEnd: '2026-08-04T10:15:00Z',
};

describe('describeAlert', () => {
  it('describes an error spike with its count and window', () => {
    const d = describeAlert(base);
    expect(d.headline).toBe('12 errors in the last 15 minutes');
    expect(d.context).toBe('Threshold was 10');
    expect(d.timeLabel).toBe('latest spike');
  });

  it('describes a stalled job without borrowing error-count wording', () => {
    const d = describeAlert({
      ...base,
      kind: 'cron_stalled',
      errorCount: 2,
      thresholdCount: 0,
      detail: 'Scheduled job(s) not succeeding: purge-unconfirmed-accounts, expire-lapsed-subscriptions.',
    });
    expect(d.headline).toBe('2 scheduled jobs not running');
    expect(d.context).toContain('purge-unconfirmed-accounts');
    expect(d.timeLabel).toBe('last checked');

    // The specific failure this guards against: never render a stalled job
    // as an error count, which would say "0 errors" and read as all-clear.
    expect(d.headline).not.toContain('errors');
    expect(d.context).not.toContain('Threshold');
  });

  it('keeps the count singular for a single stalled job', () => {
    expect(describeAlert({ ...base, kind: 'cron_stalled', errorCount: 1, detail: 'x' }).headline)
      .toBe('1 scheduled job not running');
  });

  it('falls back to a real sentence when detail is missing', () => {
    // detail is nullable in the schema; the banner must not render "null".
    const d = describeAlert({ ...base, kind: 'cron_stalled', errorCount: 1, detail: null });
    expect(d.context).toBe('A scheduled job has stopped succeeding.');
  });

  it('treats an unknown kind as an error spike rather than blanking', () => {
    const d = describeAlert({ ...base, kind: 'something_new' as ErrorRateAlert['kind'] });
    expect(d.headline).toContain('errors');
  });
});
