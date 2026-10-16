export type ChargeEventType = "plug" | "unplug";

export interface ChargeEvent {
  id: number;
  type: ChargeEventType;
  occurred_at: string;
  source: string;
  created_at: string;
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
  created_at: string;
}