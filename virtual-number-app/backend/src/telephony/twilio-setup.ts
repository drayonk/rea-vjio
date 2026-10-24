import { numberWebhooks, type Config } from "../config.js";
import type { Db } from "../db.js";
import type { TwilioProvider } from "./twilio.js";
import { ProviderError } from "./types.js";

export interface SetupReport {
  ok: boolean;
  lines: string[];
}

/**
 * Checks that a Twilio account is ready for SecondLine: credentials work,
 * the public webhook URL is HTTPS and reachable, and every number this
 * server owns sends its texts and calls here. With `fix`, wrong webhooks are
 * repointed. Numbers in the account that SecondLine doesn't own are listed
 * but never changed.
 */
export async function checkTwilioSetup(
  twilio: TwilioProvider,
  db: Db,
  config: Pick<Config, "publicBaseUrl">,
  options: { fix: boolean; fetchHealth?: (url: string) => Promise<boolean> },
): Promise<SetupReport> {
  const lines: string[] = [];
  let ok = true;
  const fail = (line: string) => {
    ok = false;
    lines.push(`✗ ${line}`);
  };

  const account = await twilio.account().catch((err: Error) => err);
  if (account instanceof ProviderError && (account.status === 401 || account.status === 404)) {
    fail(`Credentials rejected: ${account.message}. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.`);
    return { ok, lines };
  }
  if (account instanceof Error) {
    fail(`Couldn't reach Twilio (${account.message}). Check this machine's internet access or firewall.`);
    return { ok, lines };
  }
  lines.push(`✓ Signed in to Twilio account "${account.friendly_name}" (${account.status})`);
  if (account.type === "Trial") {
    fail("This is a trial account: it can only call and text verified numbers. Upgrade it before launch.");
  }

  const base = config.publicBaseUrl;
  if (!base.startsWith("https://")) {
    fail(`PUBLIC_BASE_URL must be a public HTTPS address Twilio can reach (got ${base}).`);
  } else {
    const healthy = await (options.fetchHealth ?? defaultHealth)(`${base}/health`);
    if (healthy) lines.push(`✓ ${base}/health is reachable`);
    else fail(`${base}/health didn't answer. Start the server there (or your tunnel) before going live.`);
  }

  const expected = numberWebhooks(config);
  const owned = db
    .prepare("SELECT provider_sid, e164 FROM numbers WHERE released_at IS NULL")
    .all() as Array<{ provider_sid: string; e164: string }>;
  const ownedSids = new Set(owned.map((n) => n.provider_sid));
  const inAccount = await twilio.listNumbers();
  const bySid = new Map(inAccount.map((n) => [n.sid, n]));

  for (const n of owned) {
    const remote = bySid.get(n.provider_sid);
    if (!remote) {
      fail(`${n.e164} is in SecondLine but not in this Twilio account (released elsewhere, or a different account).`);
      continue;
    }
    if (remote.sms_url === expected.sms && remote.voice_url === expected.voice) {
      lines.push(`✓ ${n.e164} webhooks point here`);
    } else if (options.fix) {
      await twilio.setWebhooks(n.provider_sid, expected);
      lines.push(`✓ ${n.e164} webhooks repointed to ${base}`);
    } else {
      fail(`${n.e164} sends texts/calls to ${remote.sms_url || "(none)"}. Run with --fix to repoint it.`);
    }
  }
  for (const n of inAccount) {
    if (!ownedSids.has(n.sid)) lines.push(`• ${n.phone_number} is in the Twilio account but not used by SecondLine (left unchanged)`);
  }
  if (owned.length === 0) lines.push("• SecondLine doesn't own any numbers yet; buy one from the app.");
  return { ok, lines };
}

async function defaultHealth(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}
