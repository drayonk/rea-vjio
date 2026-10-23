/** Formats E.164 for display; NANP numbers get (AAA) BBB-CCCC. */
export function formatPhone(e164: string): string {
  const nanp = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (nanp) return `+1 (${nanp[1]}) ${nanp[2]}-${nanp[3]}`;
  const m = /^\+(\d{1,3})(\d+)$/.exec(e164);
  return m ? `+${m[1]} ${m[2]!.replace(/(\d{3,4})(?=\d{3})/g, "$1 ")}` : e164;
}

/** Normalizes user input to E.164 using the given default dial code. */
export function toE164(input: string, defaultDialCode: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  const candidate = trimmed.startsWith("+")
    ? `+${digits}`
    : digits.startsWith("00")
      ? `+${digits.slice(2)}`
      : `+${defaultDialCode}${digits.replace(/^0/, "")}`;
  return /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : null;
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function duration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}
