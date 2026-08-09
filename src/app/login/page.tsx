"use client";

import { useState, type FormEvent } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
            Where did my money go
          </p>
          <p className="mt-0.5 text-[12px] text-ink-tertiary">
            Personal money assistant
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-autofocus
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            error={error ?? undefined}
          />
          <Button
            type="submit"
            variant="primary"
            block
            size="lg"
            disabled={loading || !email || !password}
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
