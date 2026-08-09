import type { TextItem } from "pdfjs-dist/types/src/display/api";

/**
 * PDF -> positioned text, entirely client-side.
 *
 * The PDF file and its password never leave the browser — nothing here ever
 * makes a network request or hits a server. `pdfjs-dist` is dynamically
 * imported (see `loadPdfjs` below) so this module has zero footprint on any
 * server-rendered page; it only ever runs from a "use client" component.
 *
 * PDF has no concept of a table — a statement's rows and columns are just
 * text positioned on a page. Reconstructing structure from that is the job
 * of the caller (see `hdfc-parser.ts`); this module's only job is turning a
 * PDF into positioned text, one row-cluster at a time.
 */

export interface PositionedText {
  text: string;
  /** Left edge, PDF user-space units. */
  x: number;
  /** Right edge — more reliable than `x` for right-aligned numeric columns,
   *  since a short number's left edge drifts with its digit count while its
   *  right edge stays put against the column boundary. */
  xEnd: number;
  y: number;
}

export type Row = PositionedText[];

export interface ExtractedPage {
  pageNumber: number;
  rows: Row[];
}

export class ScannedPdfError extends Error {
  constructor() {
    super(
      "This looks like a scanned copy rather than a real PDF — there's no text to read from it.",
    );
    this.name = "ScannedPdfError";
  }
}

export class PdfCancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "PdfCancelledError";
  }
}

/** Rows within this many PDF units of each other are the same visual line. */
const Y_TOLERANCE = 3;

/** Below this many total extracted text items across the whole document, treat it as scanned/image-only. */
const MIN_TEXT_ITEMS = 10;

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }
  return pdfjs;
}

function isTextItem(item: unknown): item is TextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str: unknown }).str === "string"
  );
}

function clusterIntoRows(items: PositionedText[]): Row[] {
  // PDF's y-axis grows upward from the bottom of the page, so descending y
  // is top-to-bottom reading order.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && last.length > 0 && Math.abs(last[0]!.y - item.y) <= Y_TOLERANCE) {
      last.push(item);
    } else {
      rows.push([item]);
    }
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * Extracts positioned text from every page of `file`.
 *
 * `getPassword(isRetry)` is called only if the PDF is actually
 * password-protected — `isRetry` is true once a previously-supplied password
 * was rejected, so the caller can show "wrong password, try again" instead
 * of a plain prompt. Rejecting the returned promise (e.g. the user cancels)
 * aborts loading with `PdfCancelledError`.
 */
export async function extractPdfRows(
  file: File,
  getPassword: (isRetry: boolean) => Promise<string>,
): Promise<ExtractedPage[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  const loadingTask = pdfjs.getDocument({ data });
  let cancelled = false;

  loadingTask.onPassword = (
    updatePassword: (password: string) => void,
    reason: number,
  ) => {
    const isRetry = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    getPassword(isRetry)
      .then(updatePassword)
      .catch(() => {
        cancelled = true;
        void loadingTask.destroy();
      });
  };

  let pdf: Awaited<typeof loadingTask.promise>;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    if (cancelled) throw new PdfCancelledError();
    throw error;
  }

  const pages: ExtractedPage[] = [];
  let totalItems = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const items: PositionedText[] = content.items
      .filter(isTextItem)
      .filter((item) => item.str.trim().length > 0)
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        xEnd: item.transform[4] + item.width,
        y: item.transform[5],
      }));

    totalItems += items.length;
    pages.push({ pageNumber, rows: clusterIntoRows(items) });
  }

  if (totalItems < MIN_TEXT_ITEMS) {
    throw new ScannedPdfError();
  }

  return pages;
}
