import { NextResponse } from "next/server";
import { CATEGORY_TREE } from "@/lib/domain/categories";
import { CONTEXT_DEFINITIONS } from "@/lib/domain/contexts";

/**
 * The classifier fallback (spec §14, extension).
 *
 * The deterministic parser handles the overwhelming majority of entries and is
 * the only thing in the entry path that runs synchronously. This route exists
 * for the tail it cannot reach — "settled up with Rohan for the Goa thing" —
 * where no keyword matches and the honest guess is Uncategorised.
 *
 * Three deliberate constraints:
 *
 * 1. It lives on the server because the API key must never reach the browser.
 * 2. It is only allowed to *choose from* the app's own taxonomy. The model
 *    returns an id from a fixed list, never free text, so it cannot invent a
 *    category that the analytics engine has no bucket for.
 * 3. Only the phrase the user typed is sent. No amounts, no history, no
 *    account names, no profile — the model gets the minimum needed to name a
 *    category, and nothing that would let it profile the user's finances.
 */

const MODEL = "gemini-2.0-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Ids the model is permitted to return, built from the app's own taxonomy —
 * both the top-level categories and their Type children, so the model can
 * name something specific ("transport.cab") when the text supports it, and
 * fall back to the parent category when it doesn't.
 */
const LEAF_IDS = CATEGORY_TREE.flatMap((cat) => [
  `${cat.id} — ${cat.name}`,
  ...cat.children.map((child) => `${cat.id}.${child.id} — ${cat.name} › ${child.name}`),
]);
const VALID_LEAF_IDS = new Set(
  CATEGORY_TREE.flatMap((cat) => [
    cat.id,
    ...cat.children.map((child) => `${cat.id}.${child.id}`),
  ]),
);

const CONTEXT_VALUES = CONTEXT_DEFINITIONS.filter(
  // Weekend and late-night come from the timestamp, never from the text.
  (c) => c.value !== "weekend" && c.value !== "late-night",
);
const VALID_CONTEXTS = new Set(CONTEXT_VALUES.map((c) => c.value));

const SYSTEM_PROMPT = `You categorise personal expense descriptions for an Indian personal-finance app.

Choose exactly one category id from this list:
${LEAF_IDS.join("\n")}

Then choose zero or more context tags from this list:
${CONTEXT_VALUES.map((c) => `${c.value} — ${c.description}`).join("\n")}

Rules:
- The category (and, where one is listed, the more specific type after the
  "." — e.g. "transport.cab") is *what* was bought — it never changes based
  on who the money was spent with. "With her"/"date"/a partner's name, or
  "with friends"/"with the gang", never changes the category or type — they
  only add the "dating" or "friends" context tag.
- Prefer the specific "category.type" id over the bare category id whenever
  the text actually supports it (e.g. "cab to work" → "transport.cab", not
  "transport"). Fall back to the bare category id when it's genuinely
  ambiguous which type applies.
- Anything involving drinks or a bar gets the "alcohol" tag as well as its category.
- If the description genuinely does not indicate what was bought, return "other".
- Never invent an id. Only use ids from the list above.

Respond with JSON only: {"categoryId": string, "contexts": string[], "merchant": string | null, "reason": string}
"reason" must be under 12 words and explain the choice in plain language.`;

interface ClassifyResponse {
  categoryId: string;
  contexts: string[];
  merchant?: string;
  reason: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Not an error state: the app is designed to work without this. The client
    // treats 501 as "stay with the deterministic guess" and says nothing.
    return NextResponse.json(
      { error: "Classifier not configured" },
      { status: 501 },
    );
  }

  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Nothing to classify" }, { status: 400 });
  }
  if (text.length > 200) {
    return NextResponse.json({ error: "Description too long" }, { status: 400 });
  }

  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: text.trim() }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 200,
          responseMimeType: "application/json",
        },
      }),
      // The entry path already has a good answer on screen; a slow model is
      // worse than no model, so we give up rather than make anyone wait.
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Classifier unavailable" },
        { status: 502 },
      );
    }

    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "Empty response" }, { status: 502 });
    }

    const parsed = JSON.parse(raw) as Partial<ClassifyResponse>;

    // Validate against our own taxonomy. A hallucinated id must never reach
    // the store, where it would silently vanish from every breakdown.
    if (
      typeof parsed.categoryId !== "string" ||
      !VALID_LEAF_IDS.has(parsed.categoryId)
    ) {
      return NextResponse.json(
        { error: "Model returned an unknown category" },
        { status: 502 },
      );
    }

    const contexts = Array.isArray(parsed.contexts)
      ? parsed.contexts.filter(
          (c): c is string => typeof c === "string" && VALID_CONTEXTS.has(c),
        )
      : [];

    const result: ClassifyResponse = {
      categoryId: parsed.categoryId,
      contexts,
      merchant:
        typeof parsed.merchant === "string" && parsed.merchant.trim()
          ? parsed.merchant.trim().slice(0, 40)
          : undefined,
      reason:
        typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim().slice(0, 90)
          : "Suggested by the assistant",
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Classifier failed" }, { status: 502 });
  }
}
