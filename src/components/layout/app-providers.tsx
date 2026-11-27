"use client";

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isPublicInformationPath } from '@/lib/public/branding';

const PrivateAppProviders = dynamic(() => import('./private-app-providers').then(m => m.PrivateAppProviders));

/** Public documents render without starting a ledger load, inbox or sync. */
export function AppProviders({children}:{children:ReactNode}) {
  const pathname = usePathname();
  return isPublicInformationPath(pathname) ? children : <PrivateAppProviders>{children}</PrivateAppProviders>;
}
