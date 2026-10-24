export interface Config {
  port: number;
  publicBaseUrl: string;
  authSecret: string;
  databasePath: string;
  telephonyProvider: "mock" | "twilio";
  billingProvider: "none" | "revenuecat";
  revenuecatSecretKey: string;
  revenuecatWebhookSecret: string;
  /** Days after a subscription lapses before its numbers are released. */
  lapsedReleaseDays: number;
  twilioAccountSid: string;
  twilioAuthToken: string;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable ${key}`);
  return value;
}

/** Where the carrier must send a number's inbound texts and calls. */
export const numberWebhooks = (config: Pick<Config, "publicBaseUrl">) => ({
  sms: `${config.publicBaseUrl}/webhooks/sms`,
  voice: `${config.publicBaseUrl}/webhooks/voice`,
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = env.TELEPHONY_PROVIDER ?? "mock";
  if (provider !== "mock" && provider !== "twilio") {
    throw new Error(`TELEPHONY_PROVIDER must be "mock" or "twilio"`);
  }
  const billing = env.BILLING_PROVIDER ?? "none";
  if (billing !== "none" && billing !== "revenuecat") {
    throw new Error(`BILLING_PROVIDER must be "none" or "revenuecat"`);
  }
  const authSecret = required(env, "AUTH_SECRET");
  if (authSecret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters");
  }
  return {
    port: Number(env.PORT ?? 4000),
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? "http://localhost:4000").replace(/\/$/, ""),
    authSecret,
    databasePath: env.DATABASE_PATH ?? "./secondline.db",
    telephonyProvider: provider,
    twilioAccountSid: provider === "twilio" ? required(env, "TWILIO_ACCOUNT_SID") : "",
    twilioAuthToken: provider === "twilio" ? required(env, "TWILIO_AUTH_TOKEN") : "",
    billingProvider: billing,
    revenuecatSecretKey: billing === "revenuecat" ? required(env, "REVENUECAT_SECRET_KEY") : "",
    revenuecatWebhookSecret: billing === "revenuecat" ? required(env, "REVENUECAT_WEBHOOK_SECRET") : "",
    lapsedReleaseDays: Number(env.LAPSED_RELEASE_DAYS ?? 7),
  };
}
