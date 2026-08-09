import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { AddSheetProvider } from "@/components/add/add-sheet-provider";
import { FinanceProvider } from "@/lib/hooks/use-finance";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Where did my money go?",
  description:
    "A personal money assistant that understands the context behind your spending.",
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
  width: "device-width",
  initialScale: 1,
  // Allows pinch-zoom; locking it out is an accessibility failure.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-canvas"
        >
          Skip to content
        </a>
        <ToastProvider>
          <FinanceProvider>
            <AddSheetProvider>
              <AppShell>{children}</AppShell>
            </AddSheetProvider>
          </FinanceProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
