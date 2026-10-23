export interface Config {
  port: number;
  publicBaseUrl: string;
  authSecret: string;
  databasePath: string;
  maxNumbersPerUser: number;
  telephonyProvider: "mock" | "twilio";
  twilioAccountSid: string;
  twilioAuthToken: string;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable ${key}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = env.TELEPHONY_PROVIDER ?? "mock";
  if (provider !== "mock" && provider !== "twilio") {
    throw new Error(`TELEPHONY_PROVIDER must be "mock" or "twilio"`);
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
    maxNumbersPerUser: Number(env.MAX_NUMBERS_PER_USER ?? 3),
    telephonyProvider: provider,
    twilioAccountSid: provider === "twilio" ? required(env, "TWILIO_ACCOUNT_SID") : "",
    twilioAuthToken: provider === "twilio" ? required(env, "TWILIO_AUTH_TOKEN") : "",
  };
}
