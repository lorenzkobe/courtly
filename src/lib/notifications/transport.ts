export type NotificationSubscription = {
  unsubscribe: () => void;
};

export interface NotificationTransport {
  subscribe(userId: string, onEvent: () => void): NotificationSubscription;
}
