#!/usr/bin/env node
/**
 * Security & Code Quality Linter (`scripts/lint-check.mjs`)
 * Enforces:
 * 1. Zero uses of `dangerouslySetInnerHTML` across `app/`, `components/`, and `lib/`
 * 2. Zero leaks of `SUPABASE_SERVICE_ROLE_KEY` outside `lib/supabase/admin.ts` and `scripts/seed-boss.ts`
 * 3. Zero `NEXT_PUBLIC_.*SERVICE_ROLE` variables anywhere
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib', 'actions'];

function walk(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

let errors = 0;

for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');

    if (content.includes('dangerouslySetInnerHTML')) {
      console.error(`[SECURITY ERROR] Forbidden dangerouslySetInnerHTML found in ${rel}`);
      errors++;
    }

    if (
      content.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      rel !== path.join('lib', 'supabase', 'admin.ts')
    ) {
      console.error(`[SECURITY ERROR] SUPABASE_SERVICE_ROLE_KEY referenced outside lib/supabase/admin.ts in ${rel}`);
      errors++;
    }

    if (/NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/i.test(content)) {
      console.error(`[SECURITY ERROR] Service role key prefixed with NEXT_PUBLIC_ in ${rel}`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\nLint check failed with ${errors} security violation(s).`);
  process.exit(1);
}

console.log('✓ Lint & security static checks passed (0 violations).');
