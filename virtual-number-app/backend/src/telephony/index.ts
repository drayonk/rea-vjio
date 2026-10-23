import type { Config } from "../config.js";
import { MockProvider } from "./mock.js";
import { TwilioProvider } from "./twilio.js";
import type { TelephonyProvider } from "./types.js";

export function createProvider(config: Config): TelephonyProvider {
  return config.telephonyProvider === "twilio"
    ? new TwilioProvider(config.twilioAccountSid, config.twilioAuthToken)
    : new MockProvider();
}
