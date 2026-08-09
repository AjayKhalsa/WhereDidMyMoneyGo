import type { Paise, Person, Split } from "@/lib/domain/types";

/**
 * Net owed-to-me / I-owe balance per person.
 *
 * Only `OUTSTANDING` splits count — a settled one has already been squared
 * away and carries no balance. Positive `netAmount` means they owe you;
 * negative means you owe them.
 */
export interface PersonBalance {
  person: Person;
  /** Sum of outstanding OWED_TO_ME splits. */
  owedToMe: Paise;
  /** Sum of outstanding I_OWE splits. */
  iOwe: Paise;
  /** owedToMe − iOwe. Positive: they owe you. Negative: you owe them. */
  netAmount: Paise;
  outstandingSplits: Split[];
}

export function personBalances(
  people: Person[],
  splits: Split[],
): PersonBalance[] {
  return people
    .filter((p) => p.isActive)
    .map((person) => {
      const outstandingSplits = splits.filter(
        (s) => s.personId === person.id && s.status === "OUTSTANDING",
      );
      const owedToMe = outstandingSplits
        .filter((s) => s.direction === "OWED_TO_ME")
        .reduce((acc, s) => acc + s.amount, 0);
      const iOwe = outstandingSplits
        .filter((s) => s.direction === "I_OWE")
        .reduce((acc, s) => acc + s.amount, 0);
      return {
        person,
        owedToMe,
        iOwe,
        netAmount: owedToMe - iOwe,
        outstandingSplits,
      };
    });
}
