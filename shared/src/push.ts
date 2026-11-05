// What a push notification carries, in one place so the backend (which sends it) and the
// service worker (which shows it) can never disagree.

/** The message the backend sends to a device. Small on purpose: push messages are capped at about 4 KB. */
export type PushPayload = {
  title: string;
  body: string;
  /** The page to open when the notification is tapped, for example "/votes". */
  url: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag: string;
};

/** Response from GET /api/push/public-key: the key a browser needs to subscribe. */
export type PushPublicKeyResponse = {
  publicKey: string;
};
