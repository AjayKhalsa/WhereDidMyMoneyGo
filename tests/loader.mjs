/**
 * Module resolution for `node --test` over the app's TypeScript sources.
 *
 * Node strips types but does not change module resolution, so two things the
 * app relies on are invisible to it: the `@/*` path alias from tsconfig, and
 * extensionless relative imports (`./analytics`). Rather than rewrite hundreds
 * of imports across src/ to suit the test runner, resolve both here.
 *
 * Synchronous hooks (Node >= 22.15) — no worker thread, no async loader chain.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url);

/** Extensions Node resolves on its own; anything else needs our help. */
const EXPLICIT = /\.(m?[jt]s|json|node)$/;

/**
 * Append the extension TypeScript let the author omit. Tries the file first,
 * then a directory index — the two forms bundler resolution allows.
 */
function withExtension(url) {
  if (EXPLICIT.test(url.pathname)) return url;
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = new URL(url.href + suffix);
    if (existsSync(candidate)) return candidate;
  }
  return url;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = withExtension(new URL(specifier.slice(2), SRC));
      return nextResolve(resolved.href, context);
    }
    if (specifier.startsWith(".") && context.parentURL) {
      const resolved = withExtension(new URL(specifier, context.parentURL));
      return nextResolve(resolved.href, context);
    }
    return nextResolve(specifier, context);
  },
});
