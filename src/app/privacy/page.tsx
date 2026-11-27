import type { Metadata } from 'next';
import { PolicyPage } from '@/components/public/public-page';
import { APP_NAME, SITE_URL, SUPPORT_EMAIL } from '@/lib/public/branding';

export const metadata:Metadata={title:`Privacy policy — ${APP_NAME}`,description:'How Where Did My Money Go accesses, uses, stores and shares financial information and optional Gmail data.',alternates:{canonical:`${SITE_URL}/privacy`}};
export default function PrivacyPage(){
  return <PolicyPage title="Privacy policy" description={`${APP_NAME} is a personal finance app. This policy explains what information it handles, why it is needed and how you can control it.`}>
    <section><h2>Information the app handles</h2><ul>
      <li>Account information, such as your sign-in email, profile name and preferences.</li>
      <li>Financial records you enter or import: amounts, dates, payees, categories, notes, account labels, balances, budgets, investments and linked payments.</li>
      <li>If you connect Gmail, relevant message metadata and extracted details from supported financial alerts, confirmations and receipts.</li>
      <li>If you enable phone alerts, a browser push subscription and delivery status. Essential browser storage keeps preferences, sign-in state and app data available on your device.</li>
    </ul></section>
    <section><h2>Gmail access and its purpose</h2>
      <p>Connecting Gmail is optional and requires your consent through Google. The app requests the read-only Gmail permission, <code className="break-all text-sm">gmail.readonly</code>. This permission can read your mailbox; application filters select supported bank alerts, card payment confirmations, investment messages and receipts for processing.</p>
      <p>Message contents are read to extract relevant amounts, dates, transaction references and receipt details. The app stores selected extracted information, message identifiers, subjects and processing decisions, rather than keeping a complete archive of email bodies.</p>
      <p>These details support transaction imports, matching emails to existing payments, duplicate checks, receipt enrichment and the financial reports you see. Uncertain matches may need your review. The integration does not send, delete, archive or mark messages as read, and it cannot make bank transfers or card payments.</p>
    </section>
    <section><h2>How information is used and shared</h2>
      <p>Information is used to provide your ledger, budgets, balances, investment tracking, insights and notifications, and to operate and troubleshoot those features. We do not sell your personal or Google user data, share it with data brokers, or use it for advertising or lending decisions.</p>
      <p>Service providers process information needed to run the app: Supabase provides authentication and cloud storage; Vercel hosts the application and its server functions; Google provides Gmail authorization and API access. Browser push providers deliver alerts to devices you enable. Phone alert details are hidden by default and can be enabled in your notification preferences.</p>
      <p>Access may also be needed to investigate a support or security issue you report, or to comply with a legal obligation. This app is not an official bank or Google product.</p>
    </section>
    <section><h2>Optional AI features</h2>
      <p>When enhanced insights are configured, analysis runs automatically on your financial insight screens. Aggregate financial figures, standard category labels and recognised merchant brands are sent to Google’s Gemini service to produce an interpretation. This feature does not send raw emails, OAuth credentials, account names or account numbers. Optional AI category suggestions send the short expense description you enter to Gemini.</p>
      <p>External AI processing is disabled unless the operator confirms a provider configuration under Gemini Paid Services terms that does not use submitted data to train or improve general models. The previous free-tier confirmation does not enable this processing. No billing or paid provider is enabled automatically. Category suggestions require you to request them before your entered description is sent. Hiding balances on screen does not change the summary data used when enhanced insights run.</p>
      <p>Core tracking, budget calculations and Gmail parsing work without AI generation. See <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google’s Gemini API terms</a> and <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a> for the provider requirements that apply.</p>
    </section>
    <section><h2>Storage, security and retention</h2>
      <p>Records are stored in your configured cloud account and may be cached in browser storage for app operation. Cloud access is restricted to the authenticated owner. Gmail refresh credentials are encrypted before storage and kept on the server; they are not returned to the browser. Connections to production services use HTTPS.</p>
      <p>Saved financial records, extracted email and receipt details, import decisions and preferences remain until you delete them or request their deletion. Some processing metadata is retained to prevent duplicate imports. Operational logs and backups may remain under the service providers’ retention processes. No security measure can guarantee that information will never be accessed without authorization.</p>
    </section>
    <section><h2>Your choices and deletion requests</h2>
      <p>Disconnect Gmail from Settings to revoke its authorization and remove the app’s saved Gmail credential. You can also remove access through <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">your Google Account connections</a>. Disconnecting stops future mailbox access; it does not erase financial records already imported.</p>
      <p>You can export your ledger from Settings, edit or delete entries, and disable phone alerts. For deletion of your cloud account, imported Gmail information or other stored personal data, contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from your account email so ownership can be checked. Clearing browser storage alone does not delete cloud records.</p>
    </section>
    <section><h2>Contact and policy changes</h2>
      <p>For support and privacy requests, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Material changes to data use will be reflected in this policy and, where needed, explained in the app before requesting further consent.</p>
    </section>
  </PolicyPage>;
}
