import { randomUUID } from "node:crypto";
import type { AvailableNumber, SearchQuery, TelephonyProvider } from "./types.js";

const DIAL_CODES: Record<string, string> = { US: "1", CA: "1", GB: "44", AU: "61", DE: "49", FR: "33", NL: "31" };

/**
 * In-memory provider for local development and tests. Numbers are fake and
 * nothing leaves the machine. Inbound traffic can be simulated by posting to
 * the webhook endpoints directly.
 */
export class MockProvider implements TelephonyProvider {
  readonly sent: Array<{ from: string; to: string; body: string }> = [];
  readonly calls: Array<{ virtualNumber: string; userPhone: string; destination: string }> = [];
  readonly released: string[] = [];

  async searchAvailable(q: SearchQuery): Promise<AvailableNumber[]> {
    const code = DIAL_CODES[q.country] ?? "1";
    const area = q.areaCode ?? (code === "1" ? "415" : "20");
    return Array.from({ length: q.limit }, (_, i) => {
      const subscriber = String(5550100 + i * 37).padStart(7, "0");
      return {
        e164: `+${code}${area}${subscriber}`,
        friendlyName: `(${area}) ${subscriber.slice(0, 3)}-${subscriber.slice(3)}`,
        locality: "Mockville",
        region: null,
        country: q.country,
        sms: true,
        voice: true,
      };
    }).filter((n) => !q.contains || n.e164.includes(q.contains));
  }

  async purchase(e164: string) {
    return { providerSid: `PN${randomUUID().replaceAll("-", "")}`, e164 };
  }

  async release(providerSid: string) {
    this.released.push(providerSid);
  }

  async sendSms(a: { from: string; to: string; body: string }) {
    this.sent.push({ from: a.from, to: a.to, body: a.body });
    return { providerSid: `SM${randomUUID().replaceAll("-", "")}`, status: "queued" };
  }

  async bridgeCall(a: { virtualNumber: string; userPhone: string; destination: string }) {
    this.calls.push({ virtualNumber: a.virtualNumber, userPhone: a.userPhone, destination: a.destination });
    return { providerSid: `CA${randomUUID().replaceAll("-", "")}`, status: "queued" };
  }

  verifyWebhook() {
    return true;
  }

  async fetchRecording() {
    return new Response("mock voicemail audio", { headers: { "content-type": "audio/mpeg" } });
  }
}
