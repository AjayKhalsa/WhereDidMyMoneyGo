import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_NAME, POLICY_UPDATED, SUPPORT_EMAIL } from '@/lib/public/branding';

export function PublicPage({children}:{children:ReactNode}) {
  return <div className="min-h-dvh bg-canvas">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-8">
      <Link href="/about" className="flex min-h-11 items-center gap-3 font-semibold tracking-tight">
        <Image src="/piggy.png" alt="" width={42} height={42} className="shrink-0 rounded-xl"/>
        <span className="max-w-44 text-base leading-snug sm:max-w-none">{APP_NAME}</span>
      </Link>
      <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-5 text-sm font-medium transition-colors hover:bg-surface-hover">Open app</Link>
    </header>
    <main id="main" className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-20">{children}</main>
    <footer className="mx-auto flex max-w-6xl flex-col gap-5 border-t border-line px-5 py-8 sm:px-8">
      <nav aria-label="App information" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/about" className="inline-flex min-h-11 items-center hover:underline">About</Link>
        <Link href="/privacy" className="inline-flex min-h-11 items-center hover:underline">Privacy policy</Link>
        <Link href="/terms" className="inline-flex min-h-11 items-center hover:underline">Terms of service</Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex min-h-11 items-center hover:underline">Contact support</a>
      </nav>
      <p className="text-sm leading-relaxed text-ink-secondary">{APP_NAME} · A personal money assistant.</p>
    </footer>
  </div>;
}

export function PolicyPage({title,description,children}:{title:string;description:string;children:ReactNode}) {
  return <PublicPage><article className="mx-auto max-w-3xl">
    <p className="mb-4 text-sm text-ink-secondary">Updated {POLICY_UPDATED}</p>
    <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
    <p className="mt-5 text-lg leading-relaxed text-ink-secondary">{description}</p>
    <div className="mt-12 space-y-10 text-base leading-7 text-ink-secondary [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4">{children}</div>
  </article></PublicPage>;
}
