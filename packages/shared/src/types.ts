export type ChargeEventType = "plug" | "unplug";

export interface ChargeEvent {
  id: number;
  type: ChargeEventType;
  occurred_at: string;
  source: string;
  created_at: string;
}