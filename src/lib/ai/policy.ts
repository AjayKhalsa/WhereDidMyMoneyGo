/** No provider routing, billing upgrades, training-data permission or model
 * fallback can be enabled by a browser request. Configuration stays server-side. */
export const AI_MODEL='gemini-3.5-flash-lite';
export function aiEnabled(){return !!process.env.GEMINI_API_KEY&&process.env.AI_PRIVATE_PROCESSING_CONFIRMED==='gemini-paid-services-no-training';}
