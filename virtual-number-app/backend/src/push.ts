export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type PushSender = (message: PushMessage) => Promise<void>;

/** Sends through Expo's push service; failures are logged, never fatal. */
export const expoPush: PushSender = async (message) => {
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...message, sound: "default" }),
    });
    if (!res.ok) console.warn(`push failed: ${res.status}`);
  } catch (err) {
    console.warn("push failed", err);
  }
};
