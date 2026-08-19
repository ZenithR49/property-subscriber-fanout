import assert from "node:assert/strict";
import test from "node:test";
import { planDeliveries, type Subscriber } from "../src/fanout_policy.js";

test("queues only subscribers for the property and maintenance topic", () => {
  const subscribers: Subscriber[] = [
    { id: "manager-7", propertyIds: ["cedar-12"], topics: ["maintenance_request"] },
    { id: "tenant-4", propertyIds: ["cedar-12"], topics: ["tenant_document"] },
    { id: "manager-9", propertyIds: ["maple-3"], topics: ["maintenance_request"] },
  ];

  const deliveries = planDeliveries(
    "notice-104",
    {
      kind: "maintenance_request",
      propertyId: "cedar-12",
      requestId: "repair-88",
      summary: "Kitchen sink is leaking",
    },
    subscribers,
  );

  assert.deepEqual(deliveries.map((delivery) => delivery.subscriberId), ["manager-7"]);
  assert.equal(deliveries[0]?.notificationId, "notice-104");
});
