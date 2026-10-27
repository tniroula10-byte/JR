import React from 'react';
import { BookOpen, ShieldAlert } from 'lucide-react';
import { Badge, Card } from '@/components/ui/primitives';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';
import { formatIST } from '@/lib/time';

export default async function BossAuditLogPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();
  const auditLogs = await repo.listAuditLogs(caller);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            <span>Immutable Security Audit Log</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Append-only ledger of invites, suspensions, role/flag changes, settings updates, product price edits, ticket reassignments, and CSV exports.
          </p>
        </div>
        <Badge tone="emerald">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Append-Only Trigger Protected</span>
        </Badge>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-midnight-900/90 text-slate-400">
                <th className="p-3.5">Timestamp (IST)</th>
                <th className="p-3.5">Actor</th>
                <th className="p-3.5">Action</th>
                <th className="p-3.5">Entity</th>
                <th className="p-3.5">Before / After Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {auditLogs.map((log) => (
                <tr key={log.id} className="text-slate-200">
                  <td className="p-3.5 font-mono text-[11px] text-slate-400">
                    {formatIST(log.createdAt)}
                  </td>
                  <td className="p-3.5 font-semibold text-white">
                    {log.actorName ?? log.actorId ?? 'System'}
                  </td>
                  <td className="p-3.5">
                    <Badge tone="violet">{log.action}</Badge>
                  </td>
                  <td className="p-3.5 font-mono text-[11px]">
                    {log.entity} ({log.entityId})
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-slate-300 max-w-md truncate">
                    {JSON.stringify({ before: log.beforeMeta, after: log.afterMeta })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
