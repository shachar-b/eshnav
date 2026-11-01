import { describe, expect, it } from 'vitest';
import {
  getCurrentTimeWindow,
  getIsraeliDayOfWeek,
  getJerusalemHour,
  getLogicalDateString,
  isTimeWindowElapsed,
  isValidLogicalDate,
  shiftLogicalDate,
} from '../src/time.js';

// Israel 2026: IDT (UTC+3) from Fri 2026-03-27 02:00 local until Sun 2026-10-25 02:00 local; IST (UTC+2) otherwise.
const utc = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h, min);

describe('getLogicalDateString', () => {
  it('rolls to the next Israeli day when UTC is still on the previous day (winter, UTC+2)', () => {
    const now = utc(2026, 11, 1, 22, 30); // 00:30 IST on Nov 2
    expect(new Date(now).toISOString().slice(0, 10)).toBe('2026-11-01'); // the banned approach drifts
    expect(getLogicalDateString(now)).toBe('2026-11-02');
  });

  it('rolls to the next Israeli day in summer (UTC+3)', () => {
    expect(getLogicalDateString(utc(2026, 7, 15, 21, 30))).toBe('2026-07-16');
    expect(getLogicalDateString(utc(2026, 7, 15, 20, 59))).toBe('2026-07-15');
  });
});

describe('getJerusalemHour', () => {
  it('reports midnight as 0, never 24', () => {
    expect(getJerusalemHour(utc(2026, 11, 1, 22, 0))).toBe(0);
  });

  it('jumps from 01:59 to 03:00 at the March DST transition', () => {
    expect(getJerusalemHour(utc(2026, 3, 26, 23, 59))).toBe(1);
    expect(getJerusalemHour(utc(2026, 3, 27, 0, 0))).toBe(3);
  });
});

describe('shiftLogicalDate', () => {
  it.each([
    ['2026-03-26', 1, '2026-03-27'],
    ['2026-03-27', 1, '2026-03-28'],
    ['2026-10-25', -1, '2026-10-24'],
    ['2026-10-24', 1, '2026-10-25'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-11-01', -7, '2026-10-25'],
    ['2026-11-01', 0, '2026-11-01'],
  ])('%s shifted by %i days is %s', (date, days, expected) => {
    expect(shiftLogicalDate(date, days)).toBe(expected);
  });

  it('rejects malformed dates', () => {
    expect(() => shiftLogicalDate('2026-02-30', 1)).toThrow();
    expect(() => shiftLogicalDate('2026-1-01', 1)).toThrow();
  });
});

describe('isValidLogicalDate', () => {
  it.each([
    ['2026-11-01', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['2026-11-01T00:00', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isValidLogicalDate(value)).toBe(expected);
  });
});

describe('getIsraeliDayOfWeek', () => {
  it('maps Sunday to 0 and Saturday to 6', () => {
    expect(getIsraeliDayOfWeek('2026-11-01')).toBe(0);
    expect(getIsraeliDayOfWeek('2026-10-31')).toBe(6);
    expect(getIsraeliDayOfWeek('2026-03-27')).toBe(5);
  });
});

describe('getCurrentTimeWindow', () => {
  it.each([
    [utc(2026, 7, 15, 1, 59), 'MORNING'], // 04:59 IDT — pre-dawn shows the upcoming morning
    [utc(2026, 7, 15, 2, 0), 'MORNING'], // 05:00
    [utc(2026, 7, 15, 8, 59), 'MORNING'], // 11:59
    [utc(2026, 7, 15, 9, 0), 'AFTERNOON'], // 12:00
    [utc(2026, 7, 15, 13, 59), 'AFTERNOON'], // 16:59
    [utc(2026, 7, 15, 14, 0), 'EVENING'], // 17:00
    [utc(2026, 7, 15, 20, 59), 'EVENING'], // 23:59
    [utc(2026, 12, 15, 9, 59), 'MORNING'], // 11:59 IST
    [utc(2026, 12, 15, 10, 0), 'AFTERNOON'], // 12:00 IST
  ] as const)('at %i → %s', (now, expected) => {
    expect(getCurrentTimeWindow(now)).toBe(expected);
  });
});

describe('isTimeWindowElapsed', () => {
  const today = '2026-07-15';

  it('elapses MORNING at 12:00 and AFTERNOON at 17:00 today', () => {
    expect(isTimeWindowElapsed('MORNING', today, utc(2026, 7, 15, 8, 59))).toBe(false);
    expect(isTimeWindowElapsed('MORNING', today, utc(2026, 7, 15, 9, 0))).toBe(true);
    expect(isTimeWindowElapsed('AFTERNOON', today, utc(2026, 7, 15, 13, 59))).toBe(false);
    expect(isTimeWindowElapsed('AFTERNOON', today, utc(2026, 7, 15, 14, 0))).toBe(true);
  });

  it('never elapses EVENING before the midnight rollover', () => {
    expect(isTimeWindowElapsed('EVENING', today, utc(2026, 7, 15, 20, 59))).toBe(false);
  });

  it('treats every window of a past date as elapsed', () => {
    const now = utc(2026, 7, 15, 3, 0); // 06:00 on 2026-07-15
    expect(isTimeWindowElapsed('MORNING', '2026-07-14', now)).toBe(true);
    expect(isTimeWindowElapsed('EVENING', '2026-07-14', now)).toBe(true);
  });

  it('treats every window of a future date as not elapsed', () => {
    const now = utc(2026, 7, 15, 20, 0);
    expect(isTimeWindowElapsed('MORNING', '2026-07-16', now)).toBe(false);
  });
});
