"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Whether money figures are masked on screen.
 *
 * Deliberately stored per device rather than on the profile: "hide this on
 * the phone I hand to people" is a statement about *this screen*, not about
 * the account, and syncing it to a laptop you use alone would be wrong.
 *
 * Masking is presentational only — nothing here touches stored data, and the
 * figures are still in memory. It defeats a shoulder, not an attacker.
 */

const STORAGE_KEY = "wdmmg:hide-balances";

interface PrivacyContextValue {
  hidden: boolean;
  toggle: () => void;
  setHidden: (hidden: boolean) => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  // Always start visible so the server render and the first client render
  // agree; the stored preference is applied immediately after mount.
  const [hidden, setHiddenState] = useState(false);

  useEffect(() => {
    try {
      setHiddenState(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Private browsing or a blocked store — visible is the safe default.
    }
  }, []);

  const setHidden = useCallback((next: boolean) => {
    setHiddenState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Preference just won't survive a reload; not worth surfacing.
    }
  }, []);

  const toggle = useCallback(
    () => setHiddenState((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // As above.
      }
      return next;
    }),
    [],
  );

  const value = useMemo(
    () => ({ hidden, toggle, setHidden }),
    [hidden, toggle, setHidden],
  );

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error("usePrivacy must be used within a PrivacyProvider");
  }
  return context;
}

/**
 * Just the flag, and tolerant of there being no provider.
 *
 * `Amount` renders in every corner of the app, including places that may one
 * day be mounted outside the provider (a standalone preview, a test). A
 * missing provider should mean "nothing to hide", never a crash on a screen
 * full of numbers.
 */
export function useBalancesHidden(): boolean {
  return useContext(PrivacyContext)?.hidden ?? false;
}

/**
 * Replaces digits with bullets while keeping separators and length, so a
 * masked figure occupies the same space as the real one and the layout does
 * not jump when it is revealed.
 */
export function maskFigure(text: string): string {
  return text.replace(/\d/g, "•");
}
