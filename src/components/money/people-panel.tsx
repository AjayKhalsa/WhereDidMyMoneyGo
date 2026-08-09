"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatDayMonth } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import type { Person, Split } from "@/lib/domain/types";
import { savePerson, settleSplit } from "@/lib/data/actions";
import type { PersonBalance } from "@/lib/engine/splits";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { TextField } from "@/components/ui/fields";
import { Button, Chip } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { createId } from "@/lib/utils";
import { MoneyRow } from "./disclosure-panel";

/**
 * Who you split expenses with (spec-adjacent: added for shared-expense
 * tracking). The transaction behind each split already recorded only your
 * real share — this panel is purely the "who owes what" side-ledger, so
 * settling one here never touches spend totals anywhere else in the app.
 */

export function PeoplePanel() {
  const { peopleBalances } = useFinance();
  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="-mx-3">
        {peopleBalances.map((balance) => (
          <MoneyRow
            key={balance.person.id}
            label={balance.person.name}
            sublabel={
              balance.netAmount === 0
                ? "Settled up"
                : balance.netAmount > 0
                  ? "Owes you"
                  : "You owe"
            }
            onClick={() => setEditing(balance.person)}
            value={
              <Amount
                value={balance.netAmount}
                size="sm"
                signed
                className={
                  balance.netAmount > 0
                    ? "text-positive"
                    : balance.netAmount < 0
                      ? "text-warning"
                      : undefined
                }
              />
            }
          />
        ))}
        {peopleBalances.length === 0 && (
          <p className="px-3 py-2 text-[13px] text-ink-tertiary">
            Add someone to start tracking bills you split with them.
          </p>
        )}
      </div>

      <Button size="sm" onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add a person
      </Button>

      <PersonSheet
        person={editing}
        open={Boolean(editing) || creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </>
  );
}

function PersonSheet({
  person,
  open,
  onClose,
}: {
  person: Person | null;
  open: boolean;
  onClose: () => void;
}) {
  const { db, peopleBalances } = useFinance();
  const toast = useToast();

  const [name, setName] = useState(person?.name ?? "");

  // Re-seed local state whenever a different person is opened.
  const [lastId, setLastId] = useState(person?.id);
  if (person?.id !== lastId) {
    setLastId(person?.id);
    setName(person?.name ?? "");
  }

  const balance: PersonBalance | undefined = peopleBalances.find(
    (b) => b.person.id === person?.id,
  );
  const outstanding = balance?.outstandingSplits ?? [];
  const transactions = db?.transactions ?? [];

  async function handleSave() {
    if (!name.trim()) return;
    await savePerson({
      id: person?.id ?? createId("person"),
      name: name.trim(),
      isActive: person?.isActive ?? true,
      createdAt: person?.createdAt ?? new Date().toISOString(),
    });
    toast.show({ tone: "success", title: person ? "Person updated" : "Person added" });
    onClose();
  }

  async function handleDelete() {
    if (!person) return;
    await savePerson({ ...person, isActive: false });
    toast.show({ tone: "info", title: "Person removed" });
    onClose();
  }

  async function handleSettle(split: Split) {
    await settleSplit(split.id);
    toast.show({
      tone: "success",
      title: `${formatMoney(split.amount)} settled`,
      detail: person?.name,
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={person ? person.name : "New person"}
      size="sm"
      footer={
        <div className="flex gap-2">
          {person && outstanding.length === 0 && (
            <Button variant="danger" onClick={handleDelete}>
              Remove
            </Button>
          )}
          <Button variant="primary" block onClick={handleSave} disabled={!name.trim()}>
            {person ? "Save changes" : "Add person"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rohan"
          data-autofocus
        />

        {person && outstanding.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-ink-secondary">
              Outstanding
            </p>
            <div className="space-y-1">
              {outstanding.map((split) => {
                const transaction = transactions.find(
                  (t) => t.id === split.transactionId,
                );
                return (
                  <div
                    key={split.id}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-surface-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {transaction?.description ?? "Split expense"}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-tertiary">
                        {transaction ? formatDayMonth(transaction.date) : ""}
                        {split.direction === "I_OWE" ? " · you owe" : " · owed to you"}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => handleSettle(split)}
                        className="h-7 px-2.5 text-[12px]"
                      >
                        Settle
                      </Button>
                      <Amount value={split.amount} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {person && outstanding.length === 0 && (
          <p className="text-[12.5px] text-ink-tertiary">
            Nothing outstanding{balance ? " — settled up" : ""}.
          </p>
        )}

        {person && outstanding.length > 0 && (
          <p className="text-[12.5px] text-ink-tertiary">
            <Chip tone="neutral">Can&apos;t remove</Chip> while something is
            still owed — settle it first.
          </p>
        )}
      </div>
    </Sheet>
  );
}
