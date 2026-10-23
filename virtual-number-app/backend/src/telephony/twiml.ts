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
  empty: () => `<?xml version="1.0" encoding="UTF-8"?><Response/>`,
};
