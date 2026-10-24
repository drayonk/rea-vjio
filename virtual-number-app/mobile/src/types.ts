export interface User {
  id: string;
  email: string;
  forwardTo: string | null;
  forwardingEnabled: boolean;
  doNotDisturb: boolean;
}

export interface VirtualNumber {
  id: string;
  e164: string;
  country: string;
  locality: string | null;
  label: string | null;
  sms: boolean;
  voice: boolean;
  /** Off = texts only: incoming calls are declined and outgoing calls are blocked. */
  callsEnabled: boolean;
  createdAt: string;
}

export interface AvailableNumber {
  e164: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  country: string;
  sms: boolean;
  voice: boolean;
}

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  counterpart: string;
  body: string;
  status: string;
  read: boolean;
  createdAt: string;
}

export interface Conversation {
  counterpart: string;
  unread: number;
  last: Message;
}

export type PlanId = "free" | "premium" | "pro";

export interface PlanLimits {
  numbers: number;
  smsPerMonth: number;
  minutesPerMonth: number;
}

export interface Subscription {
  paywallEnabled: boolean;
  plan: PlanId;
  expiresAt: string | null;
  /** Set when the subscription lapsed: the numbers are released at this time. */
  releaseAt: string | null;
  limits: PlanLimits;
  usage: { numbers: number; sms: number; minutes: number };
  plans: { premium: PlanLimits; pro: PlanLimits };
}

export interface Call {
  id: string;
  direction: "inbound" | "outbound";
  counterpart: string;
  status: string;
  durationSeconds: number | null;
  hasVoicemail: boolean;
  voicemailSeconds: number | null;
  createdAt: string;
}
