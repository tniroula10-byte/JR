import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service — John Rambo' };

/*
 * DRAFT for the business owner to complete and have reviewed by a lawyer.
 * Bracketed items are placeholders.
 */
export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: [DATE]</p>
      <p>
        These terms are an agreement between you and [COMPANY NAME] (&ldquo;we&rdquo;) for your use of John
        Rambo. By using the service you agree to them. Questions: [CONTACT EMAIL].
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>The service is by invitation only, and new accounts are approved by our staff.</li>
        <li>You must be at least [MINIMUM AGE] and give accurate details.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
        <li>We may suspend or close accounts that break these terms or put the service or others at risk.</li>
      </ul>

      <h2>Game top-ups</h2>
      <ul>
        <li>
          You send payment yourself, outside this service, using one of the payment methods shown. Check the
          payment tag before sending.
        </li>
        <li>We load your game after we confirm the payment. Loading times may vary.</li>
        <li>
          If we cannot find your payment we will tell you in the app. Refunds: [REFUND POLICY].
        </li>
        <li>
          Games and their points are provided by their own publishers and are subject to the publishers&rsquo;
          rules. You are responsible for following them and the laws where you live.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>No fraud, chargebacks made in bad faith, or payments with money that is not yours.</li>
        <li>No harassment of staff or other users, and no attempts to break or misuse the service.</li>
      </ul>

      <h2>Service availability</h2>
      <p>
        We work to keep the service running but cannot promise it will always be available or error-free.
      </p>

      <h2>Limitation of liability</h2>
      <p>[LIMITATION OF LIABILITY — to be written with legal advice.]</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of [STATE], United States.</p>

      <h2>Changes</h2>
      <p>We may update these terms. We will change the date above and tell you about important changes in the app.</p>
    </>
  );
}
