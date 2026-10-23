export interface AvailableNumber {
  e164: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  country: string;
  sms: boolean;
  voice: boolean;
}

export interface SearchQuery {
  country: string;
  areaCode?: string | undefined;
  contains?: string | undefined;
  limit: number;
}

export interface WebhookUrls {
  sms: string;
  voice: string;
}

export interface ProvisionedNumber {
  providerSid: string;
  e164: string;
}

export interface TelephonyProvider {
  searchAvailable(query: SearchQuery): Promise<AvailableNumber[]>;
  purchase(e164: string, webhooks: WebhookUrls): Promise<ProvisionedNumber>;
  release(providerSid: string): Promise<void>;
  sendSms(args: { from: string; to: string; body: string; statusCallback: string }): Promise<{
    providerSid: string;
    status: string;
  }>;
  /**
   * Places an outbound call that first rings the user's own phone, then
   * bridges to the destination showing the virtual number as caller ID.
   */
  bridgeCall(args: {
    virtualNumber: string;
    userPhone: string;
    destination: string;
    statusCallback: string;
  }): Promise<{ providerSid: string; status: string }>;
  /** Verifies a webhook request really came from the provider. */
  verifyWebhook(url: string, params: Record<string, string>, signature: string | undefined): boolean;
  /** Streams a stored recording (voicemail) for proxying to the app. */
  fetchRecording(url: string): Promise<Response>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
