export type PropertyEvent =
  | { kind: "maintenance_request"; propertyId: string; requestId: string; summary: string }
  | { kind: "tenant_document"; propertyId: string; documentId: string; summary: string }
  | { kind: "inspection_reminder"; propertyId: string; inspectionId: string; summary: string };

export type Subscriber = {
  id: string;
  propertyIds: string[];
  topics: PropertyEvent["kind"][];
};

export type Delivery = {
  notificationId: string;
  subscriberId: string;
  event: PropertyEvent;
};

export function planDeliveries(
  notificationId: string,
  event: PropertyEvent,
  subscribers: Subscriber[],
): Delivery[] {
  return subscribers
    .filter(
      (subscriber) =>
        subscriber.propertyIds.includes(event.propertyId) && subscriber.topics.includes(event.kind),
    )
    .map((subscriber) => ({ notificationId, subscriberId: subscriber.id, event }));
}
