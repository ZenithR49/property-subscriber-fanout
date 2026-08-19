import { createServer } from "node:http";
import { z } from "zod";
import {
  planDeliveries,
  type PropertyEvent,
  type Subscriber,
} from "./fanout_policy.js";
import { InfraiError, infrai } from "./infrai_queue.js";

const eventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("maintenance_request"),
    propertyId: z.string().min(1),
    requestId: z.string().min(1),
    summary: z.string().min(1),
  }),
  z.object({
    kind: z.literal("tenant_document"),
    propertyId: z.string().min(1),
    documentId: z.string().min(1),
    summary: z.string().min(1),
  }),
  z.object({
    kind: z.literal("inspection_reminder"),
    propertyId: z.string().min(1),
    inspectionId: z.string().min(1),
    summary: z.string().min(1),
  }),
]);

const requestSchema = z.object({
  notificationId: z.string().min(1),
  event: eventSchema,
  subscribers: z.array(
    z.object({
      id: z.string().min(1),
      propertyIds: z.array(z.string().min(1)),
      topics: z.array(
        z.enum(["maintenance_request", "tenant_document", "inspection_reminder"]),
      ),
    }),
  ),
}).transform(
  (request): { notificationId: string; event: PropertyEvent; subscribers: Subscriber[] } =>
    request as { notificationId: string; event: PropertyEvent; subscribers: Subscriber[] },
);

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/notifications/fanout") {
    json(res, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const parsed = requestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      json(res, 400, { error: "Invalid notification request", issues: parsed.error.issues });
      return;
    }

    const deliveries = planDeliveries(
      parsed.data.notificationId,
      parsed.data.event,
      parsed.data.subscribers,
    );
    await Promise.all(
      deliveries.map((delivery) =>
        infrai.queue.publish(
          delivery,
          `${delivery.notificationId}:${delivery.subscriberId}`,
        ),
      ),
    );
    json(res, 202, { notificationId: parsed.data.notificationId, queued: deliveries.length });
  } catch (error) {
    if (error instanceof SyntaxError) {
      json(res, 400, { error: "Request body must be JSON" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(res, status, { error: error.message, code: error.code });
      return;
    }
    json(res, 502, { error: "Notification could not be queued" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Property notification service listening on ${port}`));
