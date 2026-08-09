"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CloudUpload, Download, LogOut, RefreshCw, Trash2, Upload } from "lucide-react";
import { formatFullDate } from "@/lib/domain/dates";
import type { Database } from "@/lib/domain/types";
import { updateProfile } from "@/lib/data/actions";
import { LocalRepository } from "@/lib/data/local-adapter";
import { remapLegacyCategories } from "@/lib/data/category-migration";
import { createEmptyDatabase, createSeedDatabase } from "@/lib/data/seed";
import { replaceDatabase, resetStoreBoot } from "@/lib/data/store";
import { SupabaseRepository } from "@/lib/data/supabase-adapter";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/data/supabase-client";
import { useFinance } from "@/lib/hooks/use-finance";
import { PageHeader } from "@/components/layout/month-switcher";
import { ImportStatementSheet } from "@/components/settings/import-statement-sheet";
import { RulesPanel } from "@/components/settings/rules-panel";
import { TextField } from "@/components/ui/fields";
import { Button, Card, Chip, Section, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { pluralise } from "@/lib/utils";

/**
 * Settings (spec §43).
 *
 * Three jobs: say who you are, show what the app has learned about you, and
 * let you take your data or throw it away. Everything structural — accounts,
 * income, bills — lives on Money, because that is financial setup rather than
 * app configuration, and splitting it across two screens would mean neither
 * one was the answer to "where do I change this?".
 */

export default function SettingsPage() {
  const { status, db } = useFinance();

  if (status === "loading" || status === "idle") {
    return (
      <div className="space-y-8">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-32 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (!db) return null;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Settings"
        description="Who you are, what the app has learned, and where your data lives."
      />

      <Section title="You">
        <ProfileCard />
      </Section>

      <Section
        title="Financial setup"
        description="Accounts, income, investments, bills and goals all live on the Money screen."
      >
        <Link
          href="/money"
          className="group flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3.5 transition-all duration-200 hover:border-line-strong hover:shadow-[var(--shadow-subtle)]"
        >
          <span className="min-w-0">
            <span className="block text-[14px] font-medium text-ink">
              Manage your money setup
            </span>
            <span className="mt-0.5 block truncate text-[12.5px] text-ink-tertiary">
              {db.accounts.length} {pluralise(db.accounts.length, "account")} ·{" "}
              {db.recurring.length} {pluralise(db.recurring.length, "bill")} ·{" "}
              {db.goals.length} {pluralise(db.goals.length, "goal")}
            </span>
          </span>
          <ArrowRight
            className="h-4 w-4 shrink-0 text-ink-tertiary transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth={1.75}
          />
        </Link>
      </Section>

      <Section
        title="What the app has learned"
        description="Rules written by your own corrections."
      >
        <RulesPanel />
      </Section>

      {isSupabaseConfigured && <CloudMigrationPanel />}

      <Section title="Your data">
        <DataPanel />
      </Section>
    </div>
  );
}

function ProfileCard() {
  const { db } = useFinance();
  const router = useRouter();
  const toast = useToast();
  const profile = db?.profile;
  const [name, setName] = useState(profile?.name ?? "");

  const dirty = name.trim() !== (profile?.name ?? "") && name.trim().length > 0;

  async function handleSave() {
    if (!dirty) return;
    await updateProfile({ name: name.trim() });
    toast.show({ tone: "success", title: "Saved" });
  }

  async function handleSignOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Your name"
          hint="Only used to greet you on Home."
          value={name}
          onChange={(e) => setName(e.target.value)}
          wrapperClassName="min-w-[12rem] flex-1"
        />
        <Button
          variant={dirty ? "primary" : "secondary"}
          onClick={handleSave}
          disabled={!dirty}
          className="mb-[1.7rem]"
        >
          Save
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3.5 text-[12.5px] text-ink-tertiary">
        <span>
          Currency{" "}
          <span className="font-medium text-ink-secondary">
            {profile?.currency ?? "INR"} · ₹
          </span>
        </span>
        {profile?.createdAt && (
          <span>Using this since {formatFullDate(profile.createdAt)}</span>
        )}
        {profile?.isDemo && <Chip tone="warning">Sample data</Chip>}
        {isSupabaseConfigured && (
          <button
            type="button"
            onClick={handleSignOut}
            className="ml-auto flex items-center gap-1.5 font-medium text-ink-secondary hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            Sign out
          </button>
        )}
      </div>
    </Card>
  );
}

/**
 * One-time move from this browser's IndexedDB into the signed-in Supabase
 * account. Only appears when there's local data actually worth moving —
 * a brand-new signed-in session with nothing local has nothing to show here.
 * IndexedDB is left untouched after migrating, as an offline backup.
 */
function CloudMigrationPanel() {
  const toast = useToast();
  const [localCount, setLocalCount] = useState<number | null>(null);
  // Migrating calls replaceAll(), which overwrites the entire Supabase
  // account with whatever's in local storage — only safe when the cloud
  // account genuinely has nothing of its own yet. Once real usage has
  // happened on Supabase, blindly offering this button risks wiping out
  // real data with a stale local-only leftover from before Supabase became
  // the primary store.
  const [remoteHasData, setRemoteHasData] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      new LocalRepository().load(),
      new SupabaseRepository().load(),
    ]).then(([local, remote]) => {
      if (cancelled) return;
      if (local && local.transactions.length > 0) {
        setLocalCount(local.transactions.length);
      }
      setRemoteHasData(Boolean(remote && remote.transactions.length > 0));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (localCount === null || remoteHasData === null) return null;
  if (remoteHasData) return null;

  async function handleMigrate() {
    setWorking(true);
    try {
      const local = await new LocalRepository().load();
      if (!local) return;
      // This path bypasses initStore()'s own migration hook — run it here
      // too so cloud data never ends up carrying legacy category ids.
      const { db: migrated } = remapLegacyCategories(local);
      await new SupabaseRepository().replaceAll(migrated);
      resetStoreBoot();
      toast.show({
        tone: "success",
        title: "Moved to the cloud",
        detail: `${local.transactions.length} ${pluralise(local.transactions.length, "transaction")}`,
      });
      setConfirming(false);
      window.location.reload();
    } catch (error) {
      toast.show({
        tone: "error",
        title: "Migration failed",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <Section title="Cloud sync">
      <Card>
        <DataRow
          icon={<CloudUpload className="h-4 w-4" strokeWidth={1.75} />}
          title="Move your local data to the cloud"
          description={`Found ${localCount} ${pluralise(localCount, "transaction")} stored only in this browser. Copy them to your Supabase account so every device sees the same data.`}
          action={
            <Button size="sm" onClick={() => setConfirming(true)}>
              Migrate
            </Button>
          }
        />
      </Card>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Move local data to the cloud?"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" block onClick={handleMigrate} disabled={working}>
              {working ? "Moving…" : "Move to the cloud"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-[14px] leading-relaxed text-ink-secondary">
            Copies everything in this browser&rsquo;s local storage to your
            Supabase account, overwriting anything already there under your
            account. Your local copy is left in place as a backup.
          </p>
          <div className="rounded-xl bg-surface-sunken p-3.5 text-[13px] text-ink-secondary">
            {localCount} {pluralise(localCount, "transaction")} will be copied.
          </div>
        </div>
      </Sheet>
    </Section>
  );
}

type PendingAction = "reset" | "fresh" | null;

/**
 * Export and destructive resets.
 *
 * Both resets are irreversible and the data is local-only — there is no server
 * copy to restore from — so each one is confirmed by a sheet that says exactly
 * what disappears, and export is offered right next to them.
 */
function DataPanel() {
  const { db } = useFinance();
  const toast = useToast();
  const [pending, setPending] = useState<PendingAction>(null);
  const [confirmText, setConfirmText] = useState("");
  const [working, setWorking] = useState(false);
  const [importing, setImporting] = useState(false);

  const counts = {
    transactions: db?.transactions.length ?? 0,
    rules: db?.rules.length ?? 0,
  };
  // Both actions below replace everything through the same repository that
  // regular saves use — once Supabase is configured that's the cloud
  // account, not "this browser". With real data at stake, a single click
  // through a confirm sheet isn't enough friction for something this
  // irreversible; typing DELETE is.
  const needsTypedConfirm = counts.transactions > 0;
  const confirmSatisfied = !needsTypedConfirm || confirmText.trim().toUpperCase() === "DELETE";

  function handleExport() {
    if (!db) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `where-did-my-money-go-${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.show({
      tone: "success",
      title: "Data exported",
      detail: `${counts.transactions} ${pluralise(counts.transactions, "transaction")}`,
    });
  }

  async function handleConfirm() {
    if (!pending || !confirmSatisfied) return;
    setWorking(true);
    try {
      const next: Database =
        pending === "reset"
          ? createSeedDatabase()
          : createEmptyDatabase(db?.profile.name ?? "there");
      await replaceDatabase(next);
      toast.show({
        tone: "success",
        title: pending === "reset" ? "Sample data loaded" : "Starting fresh",
        detail:
          pending === "reset"
            ? "Four months of generated history"
            : "Your accounts and history have been cleared",
      });
      setPending(null);
      setConfirmText("");
    } catch (error) {
      toast.show({
        tone: "error",
        title: "That didn't work",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <Card className="divide-y divide-line">
        <DataRow
          icon={<Upload className="h-4 w-4" strokeWidth={1.75} />}
          title="Import a statement"
          description="HDFC, ICICI, or Axis — Excel export or HDFC PDF. Read entirely in your browser."
          action={
            <Button size="sm" onClick={() => setImporting(true)}>
              Import
            </Button>
          }
        />
        <DataRow
          icon={<Download className="h-4 w-4" strokeWidth={1.75} />}
          title="Export everything"
          description="A JSON file with every transaction, account and rule. Yours to keep."
          action={
            <Button size="sm" onClick={handleExport}>
              Export
            </Button>
          }
        />
        <DataRow
          icon={<RefreshCw className="h-4 w-4" strokeWidth={1.75} />}
          title="Load sample data"
          description={
            isSupabaseConfigured
              ? "Four months of generated history. Replaces everything currently stored — including your Supabase account, not just this browser."
              : "Four months of generated history, to see how the app behaves with a year's worth of habits in it. Replaces everything currently stored."
          }
          action={
            <Button size="sm" onClick={() => setPending("reset")}>
              Load
            </Button>
          }
        />
        <DataRow
          icon={<Trash2 className="h-4 w-4" strokeWidth={1.75} />}
          title="Start fresh"
          description={
            isSupabaseConfigured
              ? "Deletes every transaction, account, bill, goal and learned rule — in your Supabase account, permanently. This is not a local-only reset."
              : "Deletes every transaction, account, bill, goal and learned rule. There is no server copy."
          }
          action={
            <Button size="sm" variant="danger" onClick={() => setPending("fresh")}>
              Start fresh
            </Button>
          }
        />
      </Card>

      <p className="text-[12.5px] leading-relaxed text-ink-tertiary">
        {isSupabaseConfigured
          ? "Your data lives in Supabase — Load sample data and Start fresh both act on your cloud account, not just this browser."
          : "Everything is stored in this browser only. Nothing is uploaded, and clearing your browser data will remove it."}
      </p>

      <Sheet
        open={pending !== null}
        onClose={() => {
          setPending(null);
          setConfirmText("");
        }}
        title={pending === "reset" ? "Load sample data?" : "Start fresh?"}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setPending(null);
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              block
              onClick={handleConfirm}
              disabled={working || !confirmSatisfied}
            >
              {working
                ? "Working…"
                : pending === "reset"
                  ? "Replace with sample data"
                  : "Delete everything"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-[14px] leading-relaxed text-ink-secondary">
            {pending === "reset"
              ? "This throws away what's stored now and generates a fresh set of demo transactions in its place."
              : "This empties the app completely so you can start recording your own money."}
          </p>
          <div className="rounded-xl bg-surface-sunken p-3.5 text-[13px] text-ink-secondary">
            You&rsquo;ll lose {counts.transactions}{" "}
            {pluralise(counts.transactions, "transaction")} and {counts.rules}{" "}
            learned {pluralise(counts.rules, "rule")}
            {isSupabaseConfigured ? ", from your Supabase account" : ""}. This
            cannot be undone.
          </div>
          <p className="text-[12.5px] text-ink-tertiary">
            Export your data first if you want to keep a copy.
          </p>
          {needsTypedConfirm && (
            <TextField
              label={`Type DELETE to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              data-autofocus
            />
          )}
        </div>
      </Sheet>

      <ImportStatementSheet open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

function DataRow({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 shrink-0 text-ink-tertiary">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-secondary">
            {description}
          </span>
        </span>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
