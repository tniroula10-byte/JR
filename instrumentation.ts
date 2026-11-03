/**
 * Next.js Instrumentation (`instrumentation.ts`)
 * Forwards server-side request errors to the alert email (see lib/alerts.ts).
 * The Node-only import must sit inside the NEXT_RUNTIME check so it is removed from the
 * Edge (middleware) bundle; otherwise the Edge bundle fails and every request returns 500.
 */
import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Expected control flow (redirects, 404s) is not an error worth alerting on
    const digest = (error as { digest?: string })?.digest ?? '';
    if (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND')) return;

    const { reportServerError } = await import('./lib/alerts');
    await reportServerError(error, {
      path: request.path,
      method: request.method,
      routeType: context.routeType
    });
  }
};
