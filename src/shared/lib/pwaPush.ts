export type PwaPushRouteMode = 'history' | 'hash';

export const isPwaPushRouteMode = (value: unknown): value is PwaPushRouteMode =>
  value === 'history' || value === 'hash';

export type PwaPushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PwaPushConfigResponse = {
  enabled: boolean;
  publicKey: string | null;
  reason?: 'missing_public_key' | 'missing_private_key' | 'missing_subject';
};

export type SavePwaPushSubscriptionPayload = {
  subscription: PwaPushSubscriptionPayload;
  routeMode: PwaPushRouteMode;
  userAgent?: string | null;
};

export type SavePwaPushSubscriptionResponse = {
  status: 'ok';
  endpoint: string;
};

export type DeletePwaPushSubscriptionPayload = {
  endpoint: string;
};

export type DeletePwaPushSubscriptionResponse = {
  status: 'ok';
  endpoint: string;
};

export type SendPwaPushTestResponse = {
  status: 'sent' | 'skipped' | 'failed';
  reason?: 'not_configured' | 'no_subscription';
  error?: string;
};

export type WebPushNotificationPayload = {
  title: string;
  body?: string;
  path?: string;
  tag?: string;
  iconPath?: string;
  badgePath?: string;
};
