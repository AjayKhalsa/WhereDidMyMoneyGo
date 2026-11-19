/** Server-side text extraction only: no PDF JavaScript, external links,
 * rendering or embedded files. The password stays in server memory. */
export async function statementPdfText(bytes: Uint8Array, password?: string): Promise<{ status: "read"; text: string } | { status: "locked" | "unsupported" }> {
  if (bytes.byteLength > 5_000_000 || bytes.byteLength < 5) return { status: "unsupported" };
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { WorkerMessageHandler } = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = { WorkerMessageHandler };
  const task = pdfjs.getDocument({ data: bytes, password, disableFontFace: true, useSystemFonts: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > 30) return { status: "unsupported" };
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), content = await page.getTextContent();
      text += content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") + "\n";
      page.cleanup();
      if (text.length > 150000) return { status: "unsupported" };
    }
    return { status: "read", text };
  } catch (error) {
    return { status: error instanceof Error && error.name === "PasswordException" ? "locked" : "unsupported" };
  } finally { await task.destroy(); }
}
