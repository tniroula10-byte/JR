import { describe, expect, it } from 'vitest';
import { formatPaiseToINR, formatPointsQty, parseRupeesToPaise } from '@/lib/money';
import { formatDurationSeconds, formatIST } from '@/lib/time';
import { validateAndCreateSignedUploadUrl } from '@/lib/storage';
import {
  CreateTicketSchema,
  InviteUserSchema,
  RespondToOfferSchema,
  SubmitOfferSchema,
  UpdateCustomerProfileSchema
} from '@/lib/validation/schemas';

describe('Money & US Dollar Formatting', () => {
  it('formats integer cents into US Dollars ($)', () => {
    expect(formatPaiseToINR(15000)).toBe('$150');
    expect(formatPaiseToINR(420000)).toBe('$4,200');
    expect(formatPaiseToINR(100)).toBe('$1');
    expect(formatPaiseToINR(150050)).toBe('$1,500.50');
  });

  it('rejects non-integer paise/cents values', () => {
    expect(() => formatPaiseToINR(10.5)).toThrow();
    expect(() => formatPaiseToINR(NaN)).toThrow();
  });

  it('parses dollar strings and numbers into exact integer cents', () => {
    expect(parseRupeesToPaise('1,500')).toBe(150000);
    expect(parseRupeesToPaise(38000)).toBe(3800000);
    expect(parseRupeesToPaise('99.50')).toBe(9950);
  });

  it('rejects zero, negative, or malformed dollar inputs', () => {
    expect(() => parseRupeesToPaise('0')).toThrow();
    expect(() => parseRupeesToPaise('-500')).toThrow();
    expect(() => parseRupeesToPaise('abc')).toThrow();
    expect(() => parseRupeesToPaise('12.345')).toThrow();
  });

  it('formats game points with US digit grouping', () => {
    expect(formatPointsQty(150000)).toBe('150,000 PTS');
  });
});

describe('Time & US Pacific Time (California) Formatting', () => {
  it('formats UTC ISO timestamps in America/Los_Angeles (PT)', () => {
    const formatted = formatIST('2026-10-28T00:00:00.000Z');
    expect(formatted).toContain('PT');
    expect(formatted).toContain('2026');
  });

  it('formats durations in seconds cleanly', () => {
    expect(formatDurationSeconds(45)).toBe('45s');
    expect(formatDurationSeconds(360)).toBe('6m');
    expect(formatDurationSeconds(3660)).toBe('1h 1m');
    expect(formatDurationSeconds(null)).toBe('—');
  });
});

describe('Zod Schemas & Upload Security Validation', () => {
  it('validates E.164 phone numbers and customer profile updates', () => {
    expect(
      UpdateCustomerProfileSchema.safeParse({
        fullName: 'Aarav Mehta',
        email: 'aarav@gamer.in',
        phone: '+919876543210'
      }).success
    ).toBe(true);

    expect(
      UpdateCustomerProfileSchema.safeParse({
        fullName: 'Aarav',
        email: 'aarav@gamer.in',
        phone: '9876543210' // Missing +country code
      }).success
    ).toBe(false);
  });

  it('validates offer bounds and counter-offer requirement', () => {
    expect(
      SubmitOfferSchema.safeParse({
        productId: 'prod-1',
        offeredPricePaise: 1500000,
        clientMsgId: 'msg-12345'
      }).success
    ).toBe(true);

    // Negative or over sanity cap rejected
    expect(
      SubmitOfferSchema.safeParse({
        productId: 'prod-1',
        offeredPricePaise: -500,
        clientMsgId: 'msg-12345'
      }).success
    ).toBe(false);

    expect(
      SubmitOfferSchema.safeParse({
        productId: 'prod-1',
        offeredPricePaise: 999_000_000,
        clientMsgId: 'msg-12345'
      }).success
    ).toBe(false);

    // Counter action without counterPricePaise is rejected
    expect(
      RespondToOfferSchema.safeParse({
        offerId: 'offer-1',
        action: 'counter'
      }).success
    ).toBe(false);
  });

  it('validates invite and ticket schemas', () => {
    expect(
      InviteUserSchema.safeParse({
        email: 'new@gamer.in',
        fullName: 'New Trader',
        phone: '+919812345678',
        intendedRole: 'customer'
      }).success
    ).toBe(true);

    expect(
      CreateTicketSchema.safeParse({
        subject: 'Help with UID delivery',
        description: 'Need assistance scheduling my 25,000 VP transfer.',
        category: 'points_delivery',
        priority: 'high'
      }).success
    ).toBe(true);
  });

  it('enforces MIME type and byte size limits on private storage uploads (Architecture Rule 7)', () => {
    const valid = validateAndCreateSignedUploadUrl({
      userId: 'boss-1',
      bucket: 'product-media',
      fileName: 'valorant-pack.webp',
      mimeType: 'image/webp',
      byteSize: 1024 * 500
    });
    expect(valid.bucket).toBe('product-media');
    expect(valid.expiresInSeconds).toBe(300);

    // Reject video in product-media bucket
    expect(() =>
      validateAndCreateSignedUploadUrl({
        userId: 'boss-1',
        bucket: 'product-media',
        fileName: 'clip.mp4',
        mimeType: 'video/mp4',
        byteSize: 1024 * 1024
      })
    ).toThrow(/UPLOAD_VALIDATION_FAILED/);

    // Reject oversized image (> 5 MB)
    expect(() =>
      validateAndCreateSignedUploadUrl({
        userId: 'boss-1',
        bucket: 'product-media',
        fileName: 'huge.png',
        mimeType: 'image/png',
        byteSize: 6 * 1024 * 1024
      })
    ).toThrow(/UPLOAD_VALIDATION_FAILED/);
  });
});
