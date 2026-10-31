/** Fixed to an officially listed free-tier model. No paid model routing,
 * fallback, grounding, tools or billing upgrade is allowed by this feature. */
export const AI_MODEL='gemini-3.1-flash-lite';
export function aiEnabled(){return !!process.env.GEMINI_API_KEY&&process.env.AI_FREE_TIER_CONFIRMED==='gemini-no-billing';}
