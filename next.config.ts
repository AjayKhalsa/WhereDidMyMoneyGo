import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

/**
 * The service worker is what makes this an app rather than a website that
 * happens to have an icon. Without it every launch re-fetches the code, so a
 * lift, a basement or one bar of signal means a blank screen — precisely the
 * moment you want to log the ₹150 you just paid.
 *
 * The precache manifest is generated at build time on purpose: Next emits
 * content-hashed chunk names that change every build, so a hand-written list
 * would go stale silently and serve half an old app.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // In development the code changes constantly; caching it only produces
  // confusing stale reloads.
  disable: process.env.NODE_ENV === "development",
  // We show a "Reload" toast instead of swapping code under the user's feet
  // mid-edit, so the new worker waits until they accept.
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
