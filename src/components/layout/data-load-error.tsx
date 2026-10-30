"use client";

import { Button, EmptyState } from "@/components/ui/primitives";

export function DataLoadError({ error }: { error: string | null }) {
  return (
    <div role="alert">
      <EmptyState
        title="Couldn't load your complete financial data"
        description={error ?? "Reload to calculate your balances and insights."}
        action={
          <Button size="sm" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
