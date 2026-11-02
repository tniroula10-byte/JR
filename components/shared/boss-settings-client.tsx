'use client';

/**
 * Boss Settings & Password Control Center (`components/shared/boss-settings-client.tsx`)
 * - Allows BOKA (Boss) to change his own password & username (`BOKA10`).
 * - Allows BOKA to set/change any Employee's password & username (`GUZ`, `NOX`, `BSTURN`, `ANKY`, etc.).
 * - Allows BOKA to set/change any Customer's password & username.
 * - Includes System Security & Scope Settings (`employee_inbox_scope`, `customer_can_pick_employee`, etc.).
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  KeyRound,
  Save,
  Settings,
  Shield,
  UserCheck,
  Users
} from 'lucide-react';
import {
  adminSetUserPasswordAction,
  updateAppSettingsAction
} from '@/actions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import type { AppSettings, InboxScopeMode, Profile } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function BossSettingsClient({
  settings,
  profiles = []
}: {
  settings: AppSettings;
  profiles?: Profile[];
}) {
  const router = useRouter();

  const bossProfile = profiles.find((p) => p.role === 'boss') ?? null;
  const employeeProfiles = profiles.filter((p) => p.role === 'employee');
  const customerProfiles = profiles.filter((p) => p.role === 'customer');

  // Boss own credential state
  const [bossUsername, setBossUsername] = useState(
    bossProfile?.username ?? 'BOKA10'
  );
  const [bossNewPassword, setBossNewPassword] = useState('');
  const [bossSaving, setBossSaving] = useState(false);

  // Employee credential state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employeeProfiles[0]?.id ?? ''
  );
  const selectedEmployee = employeeProfiles.find(
    (e) => e.id === selectedEmployeeId
  );
  const [employeeUsername, setEmployeeUsername] = useState(
    selectedEmployee?.username ?? selectedEmployee?.fullName ?? ''
  );
  const [employeeNewPassword, setEmployeeNewPassword] = useState('');
  const [employeeSaving, setEmployeeSaving] = useState(false);

  // Customer credential state
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    customerProfiles[0]?.id ?? ''
  );
  const selectedCustomer = customerProfiles.find(
    (c) => c.id === selectedCustomerId
  );
  const [customerUsername, setCustomerUsername] = useState(
    selectedCustomer?.username ?? selectedCustomer?.email ?? ''
  );
  const [customerNewPassword, setCustomerNewPassword] = useState('');
  const [customerSaving, setCustomerSaving] = useState(false);

  // App Settings state
  const [employeeInboxScope, setEmployeeInboxScope] = useState<InboxScopeMode>(
    settings.employeeInboxScope
  );
  const [customerCanPickEmployee, setCustomerCanPickEmployee] = useState(
    settings.customerCanPickEmployee
  );
  const [ticketAutoCloseDays, setTicketAutoCloseDays] = useState(
    String(settings.ticketAutoCloseDays)
  );
  const [offerSanityMaxDollars, setOfferSanityMaxDollars] = useState(
    String(Math.round(settings.offerSanityMaxPaise / 100))
  );
  const [businessHoursOnly, setBusinessHoursOnly] = useState(
    settings.businessHoursOnly
  );

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleUpdateBossPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!bossProfile) return;
    setBossSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await adminSetUserPasswordAction({
        targetUserId: bossProfile.id,
        newPassword: bossNewPassword,
        newUsername: bossUsername
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Failed to update BOKA password.');
      } else {
        setFeedback(
          `Updated Boss (${bossProfile.fullName}) username to "${bossUsername}" and saved new password.`
        );
        setBossNewPassword('');
        router.refresh();
      }
    } finally {
      setBossSaving(false);
    }
  }

  async function handleUpdateEmployeePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployeeId) return;
    setEmployeeSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await adminSetUserPasswordAction({
        targetUserId: selectedEmployeeId,
        newPassword: employeeNewPassword,
        newUsername: employeeUsername
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Failed to update employee password.');
      } else {
        setFeedback(
          `Updated password for employee ${
            selectedEmployee?.fullName ?? selectedEmployeeId
          } (Username: ${employeeUsername || selectedEmployee?.username}).`
        );
        setEmployeeNewPassword('');
        router.refresh();
      }
    } finally {
      setEmployeeSaving(false);
    }
  }

  async function handleUpdateCustomerPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setCustomerSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await adminSetUserPasswordAction({
        targetUserId: selectedCustomerId,
        newPassword: customerNewPassword,
        newUsername: customerUsername
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Failed to update customer password.');
      } else {
        setFeedback(
          `Updated password for customer ${
            selectedCustomer?.fullName ?? selectedCustomerId
          } (${selectedCustomer?.email}).`
        );
        setCustomerNewPassword('');
        router.refresh();
      }
    } finally {
      setCustomerSaving(false);
    }
  }

  async function handleSaveSystemSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await updateAppSettingsAction({
        employeeInboxScope,
        customerCanPickEmployee,
        ticketAutoCloseDays: Number(ticketAutoCloseDays),
        offerSanityMaxPaise: Math.round(Number(offerSanityMaxDollars) * 100),
        businessHoursOnly
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Failed to save settings.');
      } else {
        setFeedback('System settings updated and recorded in audit_log.');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>Settings & Password Management</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Manage BOKA (Boss) credentials, Employee passwords, Customer passwords, and system scope rules.
        </p>
      </div>

      {feedback ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      ) : null}

      {errorMsg ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200"
        >
          {errorMsg}
        </div>
      ) : null}

      {/* 1. BOKA (Boss) Own Password & Username */}
      {bossProfile ? (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <h2 className="text-sm font-bold text-white">
                1. Boss (BOKA) Password & Username
              </h2>
            </div>
            <Badge tone="amber">
              Current Username: {bossProfile.username ?? 'BOKA10'}
            </Badge>
          </div>

          <p className="text-xs text-slate-400">
            No compulsory password format restriction applies to BOKA (Boss).
          </p>

          <form
            onSubmit={handleUpdateBossPassword}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div>
              <label
                htmlFor="boss-username-input"
                className="block text-xs font-semibold text-slate-200 mb-1"
              >
                Boss Username
              </label>
              <Input
                id="boss-username-input"
                type="text"
                required
                value={bossUsername}
                onChange={(e) => setBossUsername(e.target.value)}
                placeholder="BOKA10"
              />
            </div>

            <div>
              <label
                htmlFor="boss-password-input"
                className="block text-xs font-semibold text-slate-200 mb-1"
              >
                New Boss Password
              </label>
              <Input
                id="boss-password-input"
                type="password"
                required
                value={bossNewPassword}
                onChange={(e) => setBossNewPassword(e.target.value)}
                placeholder="Enter new password for BOKA"
              />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={bossSaving}>
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>
                  {bossSaving ? 'Updating Boss Password...' : 'Update BOKA Password'}
                </span>
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {/* 2. Employee Passwords (Set directly by Boss) */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            <h2 className="text-sm font-bold text-white">
              2. Employee Passwords & Usernames
            </h2>
          </div>
          <Badge tone="cyan">{employeeProfiles.length} Employees</Badge>
        </div>

        <p className="text-xs text-slate-400">
          Employees do not use email OTP. Compulsory password format for new/updated employee passwords: at least 8 characters with uppercase, lowercase, number, and special character (e.g. <code>Abcd123@</code>).
        </p>

        <form
          onSubmit={handleUpdateEmployeePassword}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <div>
            <label
              htmlFor="emp-select-password"
              className="block text-xs font-semibold text-slate-200 mb-1"
            >
              Select Employee
            </label>
            <select
              id="emp-select-password"
              value={selectedEmployeeId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedEmployeeId(nextId);
                const emp = employeeProfiles.find((x) => x.id === nextId);
                setEmployeeUsername(emp?.username ?? emp?.fullName ?? '');
              }}
              className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
            >
              {employeeProfiles.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} (Username: {emp.username ?? emp.fullName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="emp-username-input"
              className="block text-xs font-semibold text-slate-200 mb-1"
            >
              Employee Username
            </label>
            <Input
              id="emp-username-input"
              type="text"
              required
              value={employeeUsername}
              onChange={(e) => setEmployeeUsername(e.target.value)}
              placeholder="e.g. GUZ, NOX, BSTURN"
            />
          </div>

          <div>
            <label
              htmlFor="emp-password-input"
              className="block text-xs font-semibold text-slate-200 mb-1"
            >
              New Employee Password
            </label>
            <Input
              id="emp-password-input"
              type="password"
              required
              value={employeeNewPassword}
              onChange={(e) => setEmployeeNewPassword(e.target.value)}
              placeholder="Set employee password"
            />
          </div>

          <div className="sm:col-span-3">
            <Button type="submit" disabled={employeeSaving || !selectedEmployeeId}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>
                {employeeSaving
                  ? 'Updating Employee Password...'
                  : 'Save Employee Password'}
              </span>
            </Button>
          </div>
        </form>
      </Card>

      {/* 3. Customer Passwords */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h2 className="text-sm font-bold text-white">
              3. Customer Passwords & Usernames
            </h2>
          </div>
          <Badge tone="emerald">{customerProfiles.length} Customers</Badge>
        </div>

        <p className="text-xs text-slate-400">
          Compulsory password format for customer passwords: at least 8 characters with uppercase, lowercase, number, and special character (e.g. <code>Abcd123@</code>).
        </p>

        <form
          onSubmit={handleUpdateCustomerPassword}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <div>
            <label
              htmlFor="cust-select-password"
              className="block text-xs font-semibold text-slate-200 mb-1"
            >
              Select Customer
            </label>
            <select
              id="cust-select-password"
              value={selectedCustomerId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedCustomerId(nextId);
                const cust = customerProfiles.find((x) => x.id === nextId);
                setCustomerUsername(cust?.username ?? cust?.email ?? '');
              }}
              className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
            >
              {customerProfiles.map((cust) => (
                <option key={cust.id} value={cust.id}>
                  {cust.fullName} ({cust.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cust-username-input"
              className="block text-xs font-semibold text-slate-200 mb-1"
            >
              Customer Username
            </label>
            <Input
              id="cust-username-input"
              type="text"
              value={customerUsername}
              onChange={(e) => setCustomerUsername(e.target.value)}
              placeholder="Customer username"
            />
          </div>

          <div>
            <label
              htmlFor="cust-password-input"
              className="block text-xs font-semibold text-slate-200 mb-1"
            >
              New Customer Password
            </label>
            <Input
              id="cust-password-input"
              type="password"
              required
              value={customerNewPassword}
              onChange={(e) => setCustomerNewPassword(e.target.value)}
              placeholder="Set customer password"
            />
          </div>

          <div className="sm:col-span-3">
            <Button type="submit" disabled={customerSaving || !selectedCustomerId}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>
                {customerSaving
                  ? 'Updating Customer Password...'
                  : 'Save Customer Password'}
              </span>
            </Button>
          </div>
        </form>
      </Card>

      {/* 4. System Security & Scope Settings */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs text-slate-400">
          <span className="font-bold text-white text-sm">
            4. System Scope & Operational Settings
          </span>
          <Badge tone="violet">Last Updated: {formatIST(settings.updatedAt)}</Badge>
        </div>

        <form onSubmit={handleSaveSystemSettings} className="space-y-4">
          <div>
            <label htmlFor="setting-inbox-scope" className="block text-xs font-semibold text-white mb-1">
              Employee Inbox Scope (<code>employee_inbox_scope</code>)
            </label>
            <select
              id="setting-inbox-scope"
              value={employeeInboxScope}
              onChange={(e) => setEmployeeInboxScope(e.target.value as InboxScopeMode)}
              className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
            >
              <option value="all">
                all (Default — Every employee can read and reply in every customer conversation)
              </option>
              <option value="assigned_only">
                assigned_only (Strict — Employee sees only conversations Assigned to them)
              </option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-800 bg-midnight-950/70 p-3.5 space-y-2">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={customerCanPickEmployee}
                onChange={(e) => setCustomerCanPickEmployee(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-midnight-950"
              />
              <span>
                Allow Customers to Request an Employee on Ticket Creation (<code>customer_can_pick_employee</code>)
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="setting-autoclose" className="block text-xs font-semibold text-white mb-1">
                Ticket Auto-Close Days (<code>ticket_auto_close_days</code>)
              </label>
              <Input
                id="setting-autoclose"
                type="number"
                min="1"
                max="90"
                required
                value={ticketAutoCloseDays}
                onChange={(e) => setTicketAutoCloseDays(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="setting-offer-cap" className="block text-xs font-semibold text-white mb-1">
                Max Transaction Cap in US Dollars ($)
              </label>
              <Input
                id="setting-offer-cap"
                type="number"
                min="100"
                required
                value={offerSanityMaxDollars}
                onChange={(e) => setOfferSanityMaxDollars(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-midnight-950/70 p-3.5">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={businessHoursOnly}
                onChange={(e) => setBusinessHoursOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-midnight-950"
              />
              <span>
                Calculate Response Time in US Business Hours (09:00–21:00 PT) Instead of 24/7 Calendar Time
              </span>
            </label>
          </div>

          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{saving ? 'Saving Settings...' : 'Save System Settings'}</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
