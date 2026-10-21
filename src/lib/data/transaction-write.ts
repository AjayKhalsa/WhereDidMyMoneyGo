import { RepositoryError } from "./repository";

export interface WriteError { code?: string; message: string }
const MIGRATION = "The database needs migration 0020_transaction_enrichment.sql before it can save transaction times or rule evidence. Your edit is still open. Apply the migration, reload the database schema cache, then retry.";

/** Only schema-cache/undefined-column failures are safe to retry: no row was
 * written. Never discard meaningful metadata or retry a financial/RLS error. */
export async function writeTransactionCompatible(
  row: Record<string, unknown>,
  write: (payload: Record<string, unknown>) => Promise<WriteError | null>,
): Promise<void> {
  const payload = { ...row };
  for (let attempt = 0; attempt < 3; attempt++) {
    const error = await write(payload);
    if (!error) return;
    const column = ["timing", "enrichment"].find(field =>
      new RegExp(`['"]${field}['"]|column (?:transactions\\.)?${field}\\b`, "i").test(error.message));
    if (!["PGRST204", "42703"].includes(error.code ?? "") || !column || !(column in payload)) {
      throw new RepositoryError(`Supabase request failed during put:transactions: ${error.message}`, error);
    }
    const timing = payload.timing as Record<string, unknown> | null | undefined;
    const empty = column === "enrichment" ? payload.enrichment == null :
      timing == null || (timing.source === "unknown" && timing.precision === "date" && timing.timezone === "Asia/Kolkata" && Object.keys(timing).length === 3 && !/; transaction time .*; source (bank|payment)/.test(String(payload.notes ?? "")));
    if (!empty) throw new RepositoryError(MIGRATION, error);
    delete payload[column];
  }
  throw new RepositoryError(MIGRATION);
}
