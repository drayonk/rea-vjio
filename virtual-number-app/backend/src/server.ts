import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { expoPush } from "./push.js";
import { createProvider } from "./telephony/index.js";

const config = loadConfig();
const app = createApp({
  config,
  db: openDb(config.databasePath),
  telephony: createProvider(config),
  push: expoPush,
});

app.listen(config.port, () => {
  console.log(`SecondLine API on :${config.port} (provider: ${config.telephonyProvider})`);
});
