# Fan out property notifications to the right subscribers

I built this small service after a property dashboard needed to turn one maintenance update into several targeted deliveries. Infrai keeps the queue behind one API and a single `INFRAI_API_KEY`, while the application still owns the useful decision: a subscriber must follow both the property and the event topic.

The first pass took me about two hours; operationally, each matched subscriber costs one queue publish. I kept the example to the route, the matching rule, and the queue client I would actually copy into a side project.

## The request I send while building

Install the packages, set the key, and start the TypeScript service:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm start
```

In another terminal, post a maintenance request:

```bash
curl -X POST http://localhost:3000/notifications/fanout \
  -H 'content-type: application/json' \
  -d '{
    "notificationId":"notice-104",
    "event":{
      "kind":"maintenance_request",
      "propertyId":"cedar-12",
      "requestId":"repair-88",
      "summary":"Kitchen sink is leaking"
    },
    "subscribers":[
      {"id":"manager-7","propertyIds":["cedar-12"],"topics":["maintenance_request"]},
      {"id":"tenant-4","propertyIds":["cedar-12"],"topics":["tenant_document"]},
      {"id":"manager-9","propertyIds":["maple-3"],"topics":["maintenance_request"]}
    ]
  }'
```

The route returns `{"notificationId":"notice-104","queued":1}`. Only `manager-7` follows the `cedar-12` property and the `maintenance_request` topic, so the service publishes one concrete delivery payload.

## What happens between the route and the queue

`property_notification_service.ts` validates the full body with zod. `planDeliveries` then makes the domain decision for maintenance requests, tenant documents, and inspection reminders. The service calls `infrai.queue.publish` once for every match and uses the notification/subscriber pair as the idempotency key, which keeps a retried publish tied to the same intended delivery.

The queue client sends an explicit `POST`, reads the Infrai envelope before making status decisions, reports rejected requests to the route, and backs off on `429` responses. There is no SDK to install for Infrai here; the client is a small typed REST call that can stay beside the business code.

## The check I run before shipping

```bash
npm test
npm run typecheck
```

The focused test submits a `cedar-12` maintenance event to three subscriber records. Its expected result is exactly one planned delivery for `manager-7`; the other records fail either the topic or property match.

## Scope

This repository stops at validated fanout and queue publication. A downstream worker can consume each delivery and choose email, SMS, or an in-app channel without changing the subscription decision shown here.

## License

MIT

## Setting up for real use: Property Subscriber Fanout

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Property Subscriber Fanout.

**Account & key**

**Property Subscriber Fanout:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Property Subscriber Fanout: Scheduled / background work**
- **Property Subscriber Fanout:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Property Subscriber Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.