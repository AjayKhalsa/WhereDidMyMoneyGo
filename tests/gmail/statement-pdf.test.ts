import test from "node:test";
import assert from "node:assert/strict";
import { statementPdfText } from "@/lib/gmail/statement-pdf";
import { readFile } from "node:fs/promises";

test("server PDF extraction reads text without fetching links or rendering pages", async () => {
  const stream = "BT /F1 12 Tf 20 750 Td (Total Amount Due INR 1959.00) Tj ET";
  const pdf = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF`;
  const result = await statementPdfText(new TextEncoder().encode(pdf));
  assert.equal(result.status, "read"); if (result.status === "read") assert.match(result.text, /Total Amount Due INR 1959.00/);
  assert.equal((await statementPdfText(new Uint8Array(5_000_001))).status, "unsupported");
});

test("encrypted statements require the correct password and then yield only their text", async () => {
  const bytes = await readFile(new URL("../fixtures/synthetic-encrypted-statement.pdf", import.meta.url));
  assert.equal((await statementPdfText(Uint8Array.from(bytes))).status, "locked");
  assert.equal((await statementPdfText(Uint8Array.from(bytes), "wrong-password")).status, "locked");
  const result = await statementPdfText(Uint8Array.from(bytes), "synthetic-pdf-password");
  assert.equal(result.status, "read"); if (result.status === "read") assert.match(result.text, /Total Payment Due: INR 123.45/);
});
