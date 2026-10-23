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
