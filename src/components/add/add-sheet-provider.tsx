"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Transaction, TransactionType } from "@/lib/domain/types";
import { AddTransactionSheet } from "./add-transaction-sheet";

/**
 * Global access to the add/edit sheet.
 *
 * Add is an action, not a destination — it opens over whatever you were
 * looking at and returns you there afterwards. Hosting it here means the
 * sidebar button, the mobile "+", an empty state and a transaction row can
 * all reach the same surface without prop-drilling or a route change.
 */

export interface AddSheetOptions {
  /** Pre-fills the natural-language box, e.g. from a quick action. */
  initialText?: string;
  /**
   * Opens on a chosen direction — money out, in, or moved between accounts.
   * An explicit choice, so it is treated as already-touched and the parser
   * will not override it from the typed phrase.
   */
  initialType?: Extract<TransactionType, "EXPENSE" | "INCOME" | "TRANSFER">;
  /** Opens in edit mode for an existing row. */
  transaction?: Transaction;
}

interface AddSheetContextValue {
  open: (options?: AddSheetOptions) => void;
  close: () => void;
  isOpen: boolean;
}

const AddSheetContext = createContext<AddSheetContextValue | null>(null);

export function AddSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean;
    options: AddSheetOptions;
  }>({ open: false, options: {} });

  const open = useCallback((options: AddSheetOptions = {}) => {
    setState({ open: true, options });
  }, []);

  const close = useCallback(() => {
    setState((current) => ({ ...current, open: false }));
  }, []);

  const value = useMemo(
    () => ({ open, close, isOpen: state.open }),
    [open, close, state.open],
  );

  return (
    <AddSheetContext.Provider value={value}>
      {children}
      <AddTransactionSheet
        // Remounting per invocation guarantees a clean slate every time —
        // no stale amount left over from a half-finished entry.
        key={
          state.open
            ? (state.options.transaction?.id ??
              `new:${state.options.initialType ?? "EXPENSE"}`)
            : "closed"
        }
        open={state.open}
        onClose={close}
        options={state.options}
      />
    </AddSheetContext.Provider>
  );
}

export function useAddSheet(): AddSheetContextValue {
  const value = useContext(AddSheetContext);
  if (!value) {
    throw new Error("useAddSheet must be used inside <AddSheetProvider>");
  }
  return value;
}
