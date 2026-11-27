"use client";

import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { ServiceWorkerRegistrar } from './service-worker-registrar';
import { AddSheetProvider } from '@/components/add/add-sheet-provider';
import { FinanceProvider } from '@/lib/hooks/use-finance';
import { PrivacyProvider } from '@/lib/hooks/use-privacy';
import { ToastProvider } from '@/components/ui/toast';
import { NotificationProvider } from '@/lib/hooks/use-notifications';
import {InsightAnalysisProvider} from '@/components/insights/insight-analysis-provider';

export function PrivateAppProviders({children}:{children:ReactNode}) {
  return <ToastProvider>
    <ServiceWorkerRegistrar />
    <PrivacyProvider>
      <FinanceProvider>
        <NotificationProvider>
          <InsightAnalysisProvider><AddSheetProvider><AppShell>{children}</AppShell></AddSheetProvider></InsightAnalysisProvider>
        </NotificationProvider>
      </FinanceProvider>
    </PrivacyProvider>
  </ToastProvider>;
}
