export interface Page<T> {
    data: T[] | null;
    count: number | null;
    error: unknown;
}
/** Never return a truncated collection as a successful financial load.
 * Advance by returned rows: deployments can cap responses below our page size. */
export async function completeLoad<T>(fetchPage: (from: number, to: number) => PromiseLike<Page<T>>, key: (row: T) => string): Promise<{
    data: T[];
    error: null;
}> {
    const rows: T[] = [];
    const seen = new Set<string>();
    let expected: number | undefined;
    while (true) {
        const page = await fetchPage(rows.length, rows.length + 499);
        if (page.error)
            throw new Error('Financial data could not be loaded completely. Retry before using balances.');
        if (page.count === null || !Number.isSafeInteger(page.count) || page.count < 0)
            throw new Error('Could not verify financial data completeness. Retry.');
        expected ??= page.count;
        if (expected !== page.count)
            throw new Error('Your ledger changed while loading. Reload to calculate complete balances.');
        for (const row of page.data ?? []) {
            const id = key(row);
            if (seen.has(id))
                throw new Error('Your ledger changed while loading. Reload to calculate complete balances.');
            seen.add(id);
            rows.push(row);
        }
        if (rows.length === expected)
            return { data: rows, error: null };
        if (rows.length > expected || !page.data?.length)
            throw new Error('Financial data is incomplete. Reload before using balances.');
        if (rows.length >= 100000)
            throw new Error('This history exceeds the supported load size. Balances have not been recalculated.');
    }
}
