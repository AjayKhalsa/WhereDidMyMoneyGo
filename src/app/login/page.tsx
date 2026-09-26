"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-client";
import { Button } from "@/components/ui/primitives";
import { TextField } from "@/components/ui/fields";

/**
 * The only door in. No sign-up route exists anywhere in the app — the one
 * user is created by hand in the Supabase dashboard. `middleware.ts` is what
 * actually enforces the gate; this page is just the form.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [method, setMethod] = useState<"email" | "password">("email");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (params.has("error") || fragment.has("error")) {
      setError("That sign-in link could not be used. Request a new one and open it in this same browser.");
      window.history.replaceState(null, "", "/login");
    }
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading || (method === "email" && resendIn > 0)) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      if (method === "email") {
        setSentTo(null);
        const address = email.trim();
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email: address,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signInError) {
          setError(signInError.status === 429
            ? "The email service is limiting sign-in requests. Try again later, or use your existing password."
            : "Couldn't send a sign-in link. Check your email address and try again.");
          return;
        }
        setSentTo(address);
        setResendIn(60);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Couldn't connect. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5">
      <main id="main" className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
            Where did my money go
          </p>
          <p className="mt-0.5 text-[12px] text-ink-tertiary">
            Personal money assistant
          </p>
        </div>

        <p className="text-[14px] leading-relaxed text-ink-secondary">
          {method === "email"
            ? "Sign in with a one-time link sent to your email. No password needed."
            : "Sign in with your existing password."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-autofocus
            disabled={loading}
          />
          {method === "password" && <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />}
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
          {method === "email" && sentTo && (
            <div role="status" className="rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink-secondary">
              Check <strong className="font-medium text-ink">{sentTo}</strong> for your sign-in link.
              Open it in this same browser. If it does not arrive, check spam.
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            block
            size="lg"
            disabled={loading || !email.trim() || (method === "password" ? !password : resendIn > 0)}
          >
            {loading
              ? method === "email" ? "Sending link…" : "Signing in…"
              : method === "password" ? "Sign in"
              : resendIn > 0 ? `Resend in ${resendIn}s`
              : sentTo ? "Send another sign-in link" : "Email me a sign-in link"}
          </Button>
        </form>
        <button
          type="button"
          disabled={loading}
          className="text-[13px] font-medium text-ink-secondary hover:text-ink disabled:opacity-50"
          onClick={() => {
            setMethod((current) => current === "email" ? "password" : "email");
            setError(null);
            setPassword("");
          }}
        >
          {method === "email" ? "Use a password instead" : "Email me a link instead"}
        </button>
      </main>
    </div>
  );
}
