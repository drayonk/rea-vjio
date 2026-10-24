import { createHmac, timingSafeEqual } from "node:crypto";
import { ProviderError, type TelephonyProvider } from "./types.js";

const API = "https://api.twilio.com/2010-04-01";

interface TwilioAvailable {
  phone_number: string;
  friendly_name: string;
  locality: string | null;
  region: string | null;
  iso_country: string;
  capabilities: { voice?: boolean; SMS?: boolean; sms?: boolean };
}

export class TwilioProvider implements TelephonyProvider {
  private readonly auth: string;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
  ) {
    this.auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
  }

  private async request<T>(method: string, path: string, form?: Record<string, string>): Promise<T> {
    const res = await fetch(`${API}/Accounts/${this.accountSid}${path}`, {
      method,
      headers: {
        authorization: this.auth,
        ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(form ? { body: new URLSearchParams(form).toString() } : {}),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { message?: string };
      throw new ProviderError(detail.message ?? `Twilio ${method} ${path} failed`, res.status);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async searchAvailable(q: Parameters<TelephonyProvider["searchAvailable"]>[0]) {
    const params = new URLSearchParams({ SmsEnabled: "true", VoiceEnabled: "true", PageSize: String(q.limit) });
    if (q.areaCode) params.set("AreaCode", q.areaCode);
    if (q.contains) params.set("Contains", q.contains);
    const country = encodeURIComponent(q.country);
    const data = await this.request<{ available_phone_numbers: TwilioAvailable[] }>(
      "GET",
      `/AvailablePhoneNumbers/${country}/Local.json?${params}`,
    );
    return data.available_phone_numbers.map((n) => ({
      e164: n.phone_number,
      friendlyName: n.friendly_name,
      locality: n.locality || null,
      region: n.region || null,
      country: n.iso_country,
      sms: Boolean(n.capabilities.SMS ?? n.capabilities.sms),
      voice: Boolean(n.capabilities.voice),
    }));
  }

  async purchase(e164: string, webhooks: { sms: string; voice: string }) {
    const n = await this.request<{ sid: string; phone_number: string }>("POST", "/IncomingPhoneNumbers.json", {
      PhoneNumber: e164,
      SmsUrl: webhooks.sms,
      SmsMethod: "POST",
      VoiceUrl: webhooks.voice,
      VoiceMethod: "POST",
    });
    return { providerSid: n.sid, e164: n.phone_number };
  }

  async release(providerSid: string) {
    await this.request("DELETE", `/IncomingPhoneNumbers/${encodeURIComponent(providerSid)}.json`);
  }

  async sendSms(a: { from: string; to: string; body: string; statusCallback: string }) {
    const m = await this.request<{ sid: string; status: string }>("POST", "/Messages.json", {
      From: a.from,
      To: a.to,
      Body: a.body,
      StatusCallback: a.statusCallback,
    });
    return { providerSid: m.sid, status: m.status };
  }

  async bridgeCall(a: { virtualNumber: string; userPhone: string; answerUrl: string; statusCallback: string }) {
    const c = await this.request<{ sid: string; status: string }>("POST", "/Calls.json", {
      To: a.userPhone,
      From: a.virtualNumber,
      Url: a.answerUrl,
      StatusCallback: a.statusCallback,
      StatusCallbackEvent: "completed",
    });
    return { providerSid: c.sid, status: c.status };
  }

  /** https://www.twilio.com/docs/usage/security#validating-requests */
  verifyWebhook(url: string, params: Record<string, string>, signature: string | undefined) {
    if (!signature) return false;
    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);
    const expected = Buffer.from(createHmac("sha1", this.authToken).update(data).digest("base64"));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async fetchRecording(url: string) {
    if (!url.startsWith(API)) throw new ProviderError("Unexpected recording host", 400);
    return fetch(`${url}.mp3`, { headers: { authorization: this.auth } });
  }
}
