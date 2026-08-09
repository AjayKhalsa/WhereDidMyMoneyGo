/**
 * XLS/XLSX -> raw sheet rows, entirely client-side.
 *
 * Indian bank "Excel" statement exports are structured spreadsheets, not
 * scanned documents — no coordinate reconstruction needed like the PDF path
 * (`pdf-text.ts`). `xlsx` (SheetJS) is dynamically imported so it never
 * ships in a server bundle; this module only ever runs from a "use client"
 * component. None of these exports have been password-protected in
 * practice, so unlike the PDF path there's no password/retry flow here.
 */

export interface ExtractedSheet {
  sheetName: string;
  /** Every cell as its displayed string — dates and amounts as the bank formatted them, not parsed values. */
  rows: string[][];
}

export async function extractXlsRows(file: File): Promise<ExtractedSheet[]> {
  const XLSX = await import("xlsx");
  const data = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(data, { type: "array" });

  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]!;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    return { sheetName, rows };
  });
}
