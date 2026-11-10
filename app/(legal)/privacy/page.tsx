import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — John Rambo' };

/*
 * DRAFT for the business owner to complete and have reviewed. Bracketed items are placeholders.
 * Every statement below describes what the app actually does; update it if the app changes.
 */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: November 10, 2026</p>
      <p>
        John Rambo (JR) (&ldquo;we&rdquo;, &ldquo;us&rdquo;) runs this service. This policy explains what
        information we collect when you use this invitation-only service and how we use it. Questions:
        [CONTACT EMAIL].
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address, optional phone number and username.</li>
        <li>Your password, stored only in encrypted (hashed) form by our authentication provider. We cannot see it.</li>
        <li>Messages you send in chat, support tickets and complaint rooms.</li>
        <li>
          Top-up requests: the game, your username in that game, the amount and the payment method and payment
          tag you chose. Payments themselves happen outside this service, with the payment provider you use.
        </li>
        <li>Notifications we send you, and, if you turn them on, a technical address for phone notifications.</li>
        <li>
          Security records: sign-in attempts (stored as anonymous codes, not your email or IP address) and a log
          of administrative actions such as approvals and status changes.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account, answer your messages and tickets, and process your top-up requests.</li>
        <li>To send account emails (sign-in codes and approval notices) and the notifications you ask for.</li>
        <li>To keep the service secure, prevent abuse and investigate problems.</li>
      </ul>
      <p>We do not sell your information and we do not use it for advertising.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>Our staff, to help you. Staff appear to you as &ldquo;John Rambo Support&rdquo;.</li>
        <li>
          Service providers that run the service for us: Supabase (database, sign-in and file storage), Vercel
          (hosting) and Resend (email). They process data only on our instructions.
        </li>
        <li>Authorities, if the law requires it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Messages, tickets and top-up records are kept for the life of your account so we have a complete
        history, and for at least 7 months after it is closed. Pictures and videos in stories are deleted 24
        hours after they expire.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only the cookies needed to keep you signed in. We do not use advertising or tracking cookies.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You can update your name and phone number in your profile and turn phone notifications off in your
        device settings. To request a copy of your information, a correction or deletion, email [CONTACT EMAIL].
        California residents may have additional rights under California law, including the right to
        know, correct and delete the personal information we hold about them.
      </p>

      <h2>Age</h2>
      <p>This service is for adults aged [MINIMUM AGE] and over.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above and, for important changes, tell you in the app.</p>
    </>
  );
}
