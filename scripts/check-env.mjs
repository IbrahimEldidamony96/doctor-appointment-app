import nextEnv from "@next/env";
import { inspectEnvironment } from "../lib/configuration.mjs";

const production = process.argv.includes("--production");
let loadFailed = false;
nextEnv.loadEnvConfig(process.cwd(), !production, {
  info() {},
  error() { loadFailed = true; },
});
const { errors, warnings } = inspectEnvironment(process.env, { production });
if (loadFailed) errors.unshift("Environment file could not be loaded; check its syntax");
console.log(`Configuration check (${production ? "production" : "development"})`);
for (const issue of errors) console.error(`ERROR ${issue}`);
for (const issue of warnings) console.warn(`NOTE ${issue}`);
console.log("This check validates local configuration without contacting providers or printing credentials.");
if (errors.length) {
  console.error(`${errors.length} configuration issue(s) require attention.`);
  process.exitCode = 1;
} else {
  console.log("Required configuration is present. Verify provider access before deployment.");
}
