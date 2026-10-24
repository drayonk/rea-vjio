import { createApp, type Deps } from "./app.js";
import { createBilling } from "./billing/index.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { expoPush } from "./push.js";
import { releaseLapsedNumbers } from "./subscription.js";
import { createProvider } from "./telephony/index.js";

const config = loadConfig();
const deps: Deps = {
  config,
  db: openDb(config.databasePath),
  telephony: createProvider(config),
  push: expoPush,
  billing: createBilling(config),
};
const app = createApp(deps);

const releaseLapsed = () =>
  releaseLapsedNumbers(deps).then(
    (n) => n > 0 && console.log(`released ${n} lapsed number(s)`),
    (err) => console.error("lapsed number release failed", err),
  );
if (deps.billing) {
  void releaseLapsed();
  setInterval(releaseLapsed, 60 * 60 * 1000).unref();
}

app.listen(config.port, () => {
  console.log(`SecondLine API on :${config.port} (provider: ${config.telephonyProvider}, billing: ${config.billingProvider})`);
});
