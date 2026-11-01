import { describe, expect, it } from 'vitest';
import {
  AdjustStarsBodySchema,
  CompletedItemSchema,
  CreateProfileBodySchema,
  CreateRoutineBodySchema,
  IdParamsSchema,
  LogicalDateSchema,
  PinSchema,
  UpdatePoolChoreBodySchema,
  UpdateSettingsBodySchema,
} from '../src/contracts.js';

describe('primitive contracts', () => {
  it('accepts only real YYYY-MM-DD calendar dates', () => {
    expect(LogicalDateSchema.safeParse('2026-11-01').success).toBe(true);
    expect(LogicalDateSchema.safeParse('2026-02-30').success).toBe(false);
  });

  it('accepts only exactly 4 digit PINs', () => {
    expect(PinSchema.safeParse('0420').success).toBe(true);
    for (const bad of ['123', '12345', 'abcd', ' 1234']) expect(PinSchema.safeParse(bad).success).toBe(false);
  });

  it('coerces positive integer path ids', () => {
    expect(IdParamsSchema.parse({ id: '7' })).toEqual({ id: 7 });
    expect(IdParamsSchema.safeParse({ id: '0' }).success).toBe(false);
    expect(IdParamsSchema.safeParse({ id: '1.5' }).success).toBe(false);
  });
});

describe('admin request contracts', () => {
  const routine = { profileId: 1, title: 'לְצַחְצֵחַ שִׁנַּיִם', iconEmoji: '🪥', timeWindow: 'MORNING', daysOfWeek: [0, 1, 2] };

  it('applies create defaults for routines', () => {
    expect(CreateRoutineBodySchema.parse(routine)).toMatchObject({ sortOrder: 0, isActive: true });
  });

  it('rejects duplicate or out-of-range routine days', () => {
    expect(CreateRoutineBodySchema.safeParse({ ...routine, daysOfWeek: [1, 1] }).success).toBe(false);
    expect(CreateRoutineBodySchema.safeParse({ ...routine, daysOfWeek: [7] }).success).toBe(false);
    expect(CreateRoutineBodySchema.safeParse({ ...routine, daysOfWeek: [] }).success).toBe(false);
  });

  it('rejects empty or unknown-key settings patches', () => {
    expect(UpdateSettingsBodySchema.safeParse({}).success).toBe(false);
    expect(UpdateSettingsBodySchema.safeParse({ parentPinHash: 'x' }).success).toBe(false);
    expect(UpdateSettingsBodySchema.safeParse({ announcementEnabled: true }).success).toBe(true);
  });

  it('never injects create defaults into PATCH bodies', () => {
    expect(UpdatePoolChoreBodySchema.parse({ title: 'סִדּוּר סָלוֹן' })).toEqual({ title: 'סִדּוּר סָלוֹן' });
  });

  it('only allows http(s) avatar image URLs', () => {
    const profile = { name: 'נוֹעָה', avatarEmoji: '🦄', pastelTheme: 'SKY' };
    expect(CreateProfileBodySchema.safeParse({ ...profile, avatarImageUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(CreateProfileBodySchema.safeParse({ ...profile, avatarImageUrl: 'https://example.com/a.png' }).success).toBe(true);
    expect(CreateProfileBodySchema.parse(profile).avatarImageUrl).toBeNull();
  });

  it('rejects zero-star adjustments', () => {
    expect(AdjustStarsBodySchema.safeParse({ starsDelta: 0 }).success).toBe(false);
    expect(AdjustStarsBodySchema.safeParse({ starsDelta: -3 }).success).toBe(true);
  });
});

describe('board contracts', () => {
  it('discriminates completed drawer items by kind', () => {
    const base = { id: 1, title: 'x', iconEmoji: '🪥', completedAt: 1 };
    expect(CompletedItemSchema.safeParse({ ...base, kind: 'ROUTINE', timeWindow: 'EVENING' }).success).toBe(true);
    expect(CompletedItemSchema.safeParse({ ...base, kind: 'ROUTINE' }).success).toBe(false);
    expect(CompletedItemSchema.safeParse({ ...base, kind: 'POOL_COMPLETION', stars: 2 }).success).toBe(true);
  });
});
