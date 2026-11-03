import { beforeEach, describe, expect, it } from 'vitest';
import { MockDataRepository, resetMockState } from '@/lib/data/mock';
import { resetRateLimits } from '@/lib/rate-limit';
import type { CallerContext } from '@/lib/data/types';

const boss: CallerContext = { userId: 'boss-1', role: 'boss', status: 'active' };
const emp1: CallerContext = { userId: 'emp-1', role: 'employee', status: 'active' };
const custA: CallerContext = { userId: 'cust-1', role: 'customer', status: 'active' };
const custB: CallerContext = { userId: 'cust-2', role: 'customer', status: 'active' };

let n = 0;
function topup(repo: MockDataRepository, who: CallerContext, methodId = 'pm-1') {
  return repo.submitTopup(who, {
    gameId: 'game-1',
    gameUsername: 'player_one',
    amountCents: 2500,
    methodId,
    clientRequestId: `req-${++n}`
  });
}

describe('Game top-ups', () => {
  let repo: MockDataRepository;

  beforeEach(() => {
    resetMockState();
    resetRateLimits();
    repo = new MockDataRepository();
  });

  it('rotate mode: everyone sees the current tag, which moves on after every 5 deposits', async () => {
    const before = await repo.getPaymentOptions(custA);
    expect(before.find((o) => o.methodId === 'pm-1')?.tag).toBe('$JRdemo1');

    const tags: string[] = [];
    for (let i = 0; i < 6; i++) tags.push((await topup(repo, i % 2 ? custA : custB)).tag);
    expect(tags).toEqual(['$JRdemo1', '$JRdemo1', '$JRdemo1', '$JRdemo1', '$JRdemo1', '$JRdemo2']);

    // Wraps around after the last active tag
    for (let i = 0; i < 4; i++) await topup(repo, custA);
    expect((await topup(repo, custA)).tag).toBe('$JRdemo1');
  });

  it('sticky mode: each customer keeps one tag until staff change it', async () => {
    await repo.updateAppSettings(boss, { paymentTagMode: 'sticky' });
    const a1 = (await repo.getPaymentOptions(custA)).find((o) => o.methodId === 'pm-1')!.tag;
    const b1 = (await repo.getPaymentOptions(custB)).find((o) => o.methodId === 'pm-1')!.tag;
    expect(a1).not.toBe(b1); // new customers are spread across tags

    for (let i = 0; i < 7; i++) expect((await topup(repo, custA)).tag).toBe(a1);

    const otherTag = a1 === '$JRdemo1' ? 'tag-1b' : 'tag-1a';
    await repo.setCustomerPaymentTag(emp1, { customerId: 'cust-1', methodId: 'pm-1', tagId: otherTag });
    expect((await topup(repo, custA)).tag).not.toBe(a1);
  });

  it('request reaches staff as an unread message and status updates notify the customer', async () => {
    const req = await topup(repo, custA);
    expect(req.status).toBe('waiting');
    expect(req.handledBy).toBeNull();

    const conv = (await repo.listConversations(emp1)).find((c) => c.customerId === 'cust-1')!;
    expect(conv.staffUnreadCount).toBeGreaterThan(0);
    const msgs = await repo.listStaffMessages(emp1, conv.id);
    expect(msgs.at(-1)?.body).toContain(`#${req.refNo}`);
    expect(msgs.at(-1)?.body).toContain('player_one');

    const done = await repo.updateTopupStatus(emp1, { topupId: req.id, status: 'loaded' });
    expect(done.status).toBe('loaded');
    await expect(repo.updateTopupStatus(emp1, { topupId: req.id, status: 'not_received' })).rejects.toThrow(
      /already marked/
    );

    const mine = await repo.listTopups(custA);
    expect(mine[0]?.status).toBe('loaded');
    expect(mine[0]?.handledBy).toBeNull();
    expect((await repo.listNotifications(custA)).some((x) => x.type === 'topup_loaded')).toBe(true);
    expect(await repo.getMyGameUsernames(custA)).toEqual({ 'game-1': 'player_one' });
  });

  it('double-submitting the same request does not create two top-ups', async () => {
    const input = { gameId: 'game-1', gameUsername: 'p', amountCents: 1000, methodId: 'pm-1', clientRequestId: 'same-id-123' };
    const first = await repo.submitTopup(custA, input);
    const second = await repo.submitTopup(custA, input);
    expect(second.id).toBe(first.id);
    expect(await repo.listTopups(custA)).toHaveLength(1);
  });

  it('limits: max 11 active games, max 3 active payment methods, valid amounts, staff-only management', async () => {
    for (let i = 0; i < 5; i++) await repo.upsertGame(emp1, { name: `Extra ${i}`, active: true, sortOrder: 20 + i });
    await expect(repo.upsertGame(emp1, { name: 'Twelfth', active: true, sortOrder: 99 })).rejects.toThrow(/At most 11/);
    expect((await repo.listGames(custA)).length).toBe(11);

    await expect(repo.upsertPaymentMethod(boss, { name: 'PayPal', active: true, sortOrder: 4 })).rejects.toThrow(/At most 3/);
    await expect(repo.upsertGame(custA, { name: 'Hack', active: true, sortOrder: 1 })).rejects.toThrow(/FORBIDDEN/);
    await expect(repo.listPaymentMethods(custA)).rejects.toThrow(/FORBIDDEN/);

    await expect(
      repo.submitTopup(custA, { gameId: 'game-1', gameUsername: 'p', amountCents: 50, methodId: 'pm-1', clientRequestId: 'tiny-amt-1' })
    ).rejects.toThrow(/INVALID_AMOUNT/);
    await repo.upsertGame(boss, { id: 'game-2', name: 'PUBG Mobile', active: false, sortOrder: 2 });
    await expect(
      repo.submitTopup(custA, { gameId: 'game-2', gameUsername: 'p', amountCents: 500, methodId: 'pm-1', clientRequestId: 'off-game-1' })
    ).rejects.toThrow(/not available/);
  });
});
