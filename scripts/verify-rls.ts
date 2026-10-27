/**
 * CI RLS Verification Gate & `supabase/apply_all.sql` Generator (`scripts/verify-rls.ts`)
 * Architecture Rule 1: Every table in `public` has RLS enabled with deny-by-default policies.
 * A CI check must fail if any table lacks RLS.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const APPLY_ALL_PATH = path.join(ROOT, 'supabase', 'apply_all.sql');

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.error('ERROR: No migration files found in supabase/migrations');
  process.exit(1);
}

const combinedSql = migrationFiles
  .map((file) => {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    return `-- >>> BEGIN MIGRATION: ${file} <<<\n${content}\n-- >>> END MIGRATION: ${file} <<<\n`;
  })
  .join('\n');

fs.writeFileSync(APPLY_ALL_PATH, combinedSql, 'utf8');

const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z0-9_]+)/gi;
const tables: string[] = [];
let match: RegExpExecArray | null;
while ((match = createTableRegex.exec(combinedSql)) !== null) {
  if (match[1]) tables.push(match[1]);
}

if (tables.length < 25) {
  console.error(`ERROR: Expected at least 25 tables in public schema, found ${tables.length}`);
  process.exit(1);
}

let missingRls = 0;

for (const table of tables) {
  const enablePattern = new RegExp(
    `ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i'
  );
  const forcePattern = new RegExp(
    `ALTER\\s+TABLE\\s+public\\.${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i'
  );
  const policyPattern = new RegExp(
    `CREATE\\s+POLICY\\s+[a-z0-9_]+\\s+ON\\s+public\\.${table}\\b`,
    'i'
  );

  if (!enablePattern.test(combinedSql)) {
    console.error(`[RLS FAILURE] Table public.${table} is missing ENABLE ROW LEVEL SECURITY`);
    missingRls++;
  }
  if (!forcePattern.test(combinedSql)) {
    console.error(`[RLS FAILURE] Table public.${table} is missing FORCE ROW LEVEL SECURITY`);
    missingRls++;
  }
  if (!policyPattern.test(combinedSql)) {
    console.error(`[RLS FAILURE] Table public.${table} has no RLS policy defined`);
    missingRls++;
  }
}

if (missingRls > 0) {
  console.error(`RLS check failed with ${missingRls} error(s).`);
  process.exit(1);
}

console.log(
  `✓ Generated supabase/apply_all.sql and verified RLS + FORCE RLS + Policies across all ${tables.length} public tables.`
);
