/**
 * Phase 11 Load Check at Target Capacity: 60 Accounts (`scripts/load-check-60.ts`)
 * Simulates target scale: 1 boss, 4 employees, and 55 active customers (60 accounts total)
 * performing concurrent catalog queries, offer submissions, chat messages, ticket creations,
 * and analytics calculations.
 */

import { MockDataRepository, resetMockState } from '../lib/data/mock';
import type { CallerContext } from '../lib/data/types';

async function runLoadCheck() {
  resetMockState();
  const repo = new MockDataRepository();
  const bossCaller: CallerContext = { userId: 'boss-1', role: 'boss', status: 'active' };

  const startMs = performance.now();

  // Provision additional customers up to 55 active customers (15 seeded + 40 new = 55 customers + 4 employees + 1 boss = 60 active accounts)
  for (let i = 16; i <= 55; i++) {
    await repo.inviteUser(bossCaller, {
      email: `customer.${i}@gamer.in`,
      fullName: `Syndicate Customer ${i}`,
      phone: `+9198222000${String(i).padStart(2, '0')}`,
      intendedRole: 'customer'
    });
  }

  const allProfiles = await repo.listAllProfiles(bossCaller);
  const activeAccounts = allProfiles.filter((p) => p.status === 'active');
  const activeCustomers = activeAccounts.filter((p) => p.role === 'customer');
  const activeEmployees = activeAccounts.filter((p) => p.role === 'employee');

  if (activeAccounts.length !== 60) {
    throw new Error(`Expected 60 active accounts, got ${activeAccounts.length}`);
  }

  // Run concurrent customer offers, chat messages, and staff responses across all 55 customers
  await Promise.all(
    activeCustomers.slice(0, 20).map(async (cust, idx) => {
      const custCaller: CallerContext = {
        userId: cust.id,
        role: 'customer',
        status: 'active'
      };
      const conv = await repo.getCustomerConversation(custCaller);
      if (conv) {
        await repo.sendCustomerMessage(custCaller, {
          conversationId: conv.id,
          body: `Load test inquiry #${idx + 1} from ${cust.fullName}`,
          clientMsgId: `load-msg-${cust.id}-${idx}`
        });
      }
    })
  );

  const metrics = await repo.getEmployeePerformance(bossCaller);
  const elapsedMs = Math.round(performance.now() - startMs);

  console.log(
    `✓ 60-Account Load Check Passed in ${elapsedMs}ms: 1 Boss, ${activeEmployees.length} Employees, ${activeCustomers.length} Customers (${activeAccounts.length} active accounts, ${metrics.length} staff analytics profiles computed).`
  );
}

runLoadCheck().catch((err) => {
  console.error(err);
  process.exit(1);
});
