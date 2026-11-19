// Verify the deployment artifact, not the development node_modules tree.
// Native PDF dependencies can be installed locally but omitted by tracing.
const fs = require("node:fs");
const path = require("node:path");
for (const route of ["api/cron/gmail", "api/gmail/sync", "api/gmail/statements"]) {
  const trace = path.resolve(`.next/server/app/${route}/route.js.nft.json`);
  const files = JSON.parse(fs.readFileSync(trace, "utf8")).files;
  if (!files.some(file => /@napi-rs\/canvas\/index\.js$/.test(file)) ||
      !files.some(file => /@napi-rs\/canvas-linux-x64-gnu\/.*\.node$/.test(file)) ||
      !files.some(file => /pdfjs-dist\/legacy\/build\/pdf\.mjs$/.test(file)) ||
      !files.some(file => /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs$/.test(file))) {
    throw new Error(`Server PDF runtime is incomplete in the deployment trace for ${route}`);
  }
}
console.log("Server PDF runtime dependencies verified in all statement-processing deployment traces.");
