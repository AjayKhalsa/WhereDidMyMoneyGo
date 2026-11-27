import type { Metadata } from 'next';
import { PolicyPage } from '@/components/public/public-page';
import { APP_NAME, SITE_URL, SUPPORT_EMAIL } from '@/lib/public/branding';
export const metadata:Metadata={title:`Terms of service — ${APP_NAME}`,description:'Terms for using Where Did My Money Go, a personal finance tracking and budgeting app.',alternates:{canonical:`${SITE_URL}/terms`}};
export default function TermsPage(){
  return <PolicyPage title="Terms of service" description={`These terms describe the intended use and limits of ${APP_NAME}.`}>
    <section><h2>Using the app</h2><p>The app helps authorised users record and understand personal finances. Keep your sign-in credentials and devices secure, and import only information you own or are authorised to use. Access is currently limited to accounts enabled by the app operator.</p></section>
    <section><h2>Your records and decisions</h2><p>You control the financial information you enter and the integrations you connect. Check imported entries, category suggestions, account balances, linked payments and bill reminders against your bank or provider records. Missing alerts, posting delays and incorrect source information can affect calculations.</p><p>Budgets and insights are planning tools. The app is not a bank, payment service, broker or investment adviser, and it does not execute payments or investments. AI interpretations may be inaccurate; your own records and provider statements should guide financial decisions.</p></section>
    <section><h2>Connected services</h2><p>Gmail imports and phone alerts are optional. Connecting them authorises the processing described in the <a href="/privacy">privacy policy</a>. Google, hosting, database and push services have their own terms and availability limits. You may disconnect Gmail or disable alerts at any time in Settings.</p></section>
    <section><h2>Availability and data</h2><p>The app is provided as available. Features may change, checks can be delayed and uninterrupted access or complete import coverage cannot be guaranteed. Keep exports of records you need to retain. Data is handled as described in the privacy policy; account and deletion requests can be made through the support address.</p></section>
    <section><h2>Questions and updates</h2><p>Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for support or questions about these terms. Material updates will be published on this page with a revised date.</p></section>
  </PolicyPage>;
}
