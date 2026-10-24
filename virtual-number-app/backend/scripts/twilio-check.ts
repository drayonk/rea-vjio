// Usage: npm run twilio:check [-- --fix]
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { TwilioProvider } from "../src/telephony/twilio.js";
import { checkTwilioSetup } from "../src/telephony/twilio-setup.js";

const config = loadConfig({ ...process.env, TELEPHONY_PROVIDER: "twilio" });
const report = await checkTwilioSetup(
  new TwilioProvider(config.twilioAccountSid, config.twilioAuthToken),
  openDb(config.databasePath),
  config,
  { fix: process.argv.includes("--fix") },
);
console.log(report.lines.join("\n"));
console.log(report.ok ? "\nTwilio is connected." : "\nFix the items marked ✗ and run this again.");
process.exitCode = report.ok ? 0 : 1;
