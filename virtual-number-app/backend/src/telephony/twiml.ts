const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => `&${{ "<": "lt", ">": "gt", "&": "amp", "'": "apos", '"': "quot" }[c]};`);

export const twiml = {
  response: (...verbs: string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.join("")}</Response>`,
  say: (text: string) => `<Say>${escapeXml(text)}</Say>`,
  dial: (target: string, opts: { action?: string; timeout?: number; callerId?: string } = {}) => {
    const attrs = [
      opts.action ? ` action="${escapeXml(opts.action)}"` : "",
      opts.timeout ? ` timeout="${opts.timeout}"` : "",
      opts.callerId ? ` callerId="${escapeXml(opts.callerId)}"` : "",
    ].join("");
    return `<Dial${attrs}>${escapeXml(target)}</Dial>`;
  },
  record: (action: string, maxLength = 120) =>
    `<Record action="${escapeXml(action)}" maxLength="${maxLength}" playBeep="true"/>`,
  hangup: () => "<Hangup/>",
  /** Declines without answering, so the call is not billed and no voicemail plays. */
  reject: () => `<Reject reason="busy"/>`,
  gather: (action: string, ...verbs: string[]) =>
    `<Gather numDigits="1" timeout="8" action="${escapeXml(action)}">${verbs.join("")}</Gather>`,
  /** Dials a number that must run `screenUrl` (e.g. press 1 to accept) before connecting. */
  dialScreened: (target: string, screenUrl: string, opts: { action: string; timeout: number }) =>
    `<Dial action="${escapeXml(opts.action)}" timeout="${opts.timeout}"><Number url="${escapeXml(screenUrl)}">${escapeXml(target)}</Number></Dial>`,
  empty: () => `<?xml version="1.0" encoding="UTF-8"?><Response/>`,
};
