import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, ChartNoAxesCombined, Landmark, ShieldCheck, Target, Wallet } from 'lucide-react';
import { PublicPage } from '@/components/public/public-page';
import { APP_NAME, SITE_URL, SUPPORT_EMAIL } from '@/lib/public/branding';

export const metadata:Metadata = {
  title: `${APP_NAME} — Personal money assistant`,
  description: 'Track personal spending, plan budgets, understand card balances and keep investment contributions in view. Optional read-only Gmail imports help keep your records current.',
  alternates: {canonical:`${SITE_URL}/about`},
};
const features = [
  {icon:Wallet,title:'See where it goes',body:'Keep income, everyday spending and linked reimbursements together, with your personal share reflected in the budget.'},
  {icon:Target,title:'Make a plan that fits',body:'Adjust category budgets and investment targets, then compare your progress with previous salary cycles.'},
  {icon:Landmark,title:'Keep commitments in view',body:'Review bank and card records, upcoming bills and recorded payments in one place.'},
  {icon:ChartNoAxesCombined,title:'Understand the pattern',body:'Explore spending trends, cash flow and the changes behind your monthly totals.'},
];
export default function AboutPage() {
  return <PublicPage>
    <section className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
      <div>
        <p className="mb-5 text-sm font-medium text-accent">Your money, with a little more clarity</p>
        <h1 className="max-w-xl text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[1.08] tracking-[-0.045em]">More clarity.<br/>Less money stress.</h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-secondary">{APP_NAME} helps you understand your spending, plan your budget and follow your investment contributions—without losing sight of everyday life.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-6 text-base font-medium text-canvas transition-colors hover:bg-ink/85">Open your app</Link>
          <Link href="/privacy" className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong px-6 text-base font-medium hover:bg-surface">Read our privacy policy</Link>
        </div>
        <p className="mt-4 text-sm text-ink-secondary">Personal app · Sign-in required for financial records</p>
      </div>
      <div className="rounded-[32px] border border-line bg-surface p-5 shadow-[var(--shadow-raised)] sm:p-8">
        <p className="text-sm text-ink-secondary">Example dashboard · illustrative figures</p>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm text-ink-secondary">Everyday spending</p><p className="mt-2 text-4xl font-semibold tracking-tight">₹18,200</p></div>
          <p className="text-sm text-ink-secondary">of ₹30,000 planned</p>
        </div>
        <div aria-hidden="true" className="mt-6 h-3 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full w-[61%] rounded-full bg-accent"/></div>
        <div className="mt-8 grid gap-3">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-sunken p-4"><Target className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.8}/><span className="text-sm">Budgets that you can adjust</span></div>
          <div className="flex items-center gap-3 rounded-2xl bg-surface-sunken p-4"><Bell className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.8}/><span className="text-sm">Timely reminders, in one inbox</span></div>
        </div>
      </div>
    </section>
    <section aria-labelledby="features" className="mt-20 sm:mt-28">
      <h2 id="features" className="text-3xl font-semibold tracking-tight">The full picture, one step at a time.</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{features.map(({icon:Icon,title,body})=><div key={title} className="rounded-3xl border border-line bg-surface p-6 sm:p-7"><Icon className="h-6 w-6 text-accent" strokeWidth={1.7}/><h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3><p className="mt-3 text-base leading-relaxed text-ink-secondary">{body}</p></div>)}</div>
    </section>
    <section aria-labelledby="gmail-access" className="mt-16 rounded-[32px] border border-line bg-accent-soft p-6 sm:p-9">
      <ShieldCheck className="h-7 w-7 text-accent" strokeWidth={1.7}/>
      <h2 id="gmail-access" className="mt-5 text-2xl font-semibold tracking-tight">Connect Gmail on your terms.</h2>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-secondary">Optional read-only Gmail access lets the app find supported bank alerts, payment confirmations, investment notices and receipts, then extract details for your finance records. Gmail permission covers the mailbox; app filters select the messages used for imports.</p>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-secondary">The integration cannot send, delete or mark your emails as read. You can disconnect it in Settings. <Link href="/privacy" className="font-medium text-accent underline underline-offset-4">Read how data is accessed, stored and used.</Link></p>
    </section>
    <section className="mt-16 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-semibold tracking-tight">Questions about the app?</h2><p className="mt-2 text-base text-ink-secondary">Get in touch for support or a privacy request.</p></div><a href={`mailto:${SUPPORT_EMAIL}`} className="break-all text-base font-medium text-accent underline underline-offset-4">{SUPPORT_EMAIL}</a></section>
  </PublicPage>;
}
