"use client";

import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { ServiceWorkerRegistrar } from './service-worker-registrar';
import { AddSheetProvider } from '@/components/add/add-sheet-provider';
import { FinanceProvider } from '@/lib/hooks/use-finance';
import { PrivacyProvider } from '@/lib/hooks/use-privacy';
import { ToastProvider } from '@/components/ui/toast';
import { NotificationProvider } from '@/lib/hooks/use-notifications';

export function PrivateAppProviders({children}:{children:ReactNode}) {
  return <ToastProvider>
    <ServiceWorkerRegistrar />
    <PrivacyProvider>
      <FinanceProvider>
        <NotificationProvider>
          <AddSheetProvider><AppShell>{children}</AppShell></AddSheetProvider>
        </NotificationProvider>
      </FinanceProvider>
    </PrivacyProvider>
  </ToastProvider>;
}
