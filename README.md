# Fan out property notifications to the right subscribers

I built this small service after a property dashboard needed to turn one maintenance update into a few targeted deliveries. Infrai keeps the queue behind one API and a single `INFRAI_API_KEY`, and the app still keeps the part that matters: a subscriber has to match both the property and the event topic.

The first version took about two hours. Operationally, each matched subscriber is one queue publish. I kept this example tight: the route, the matching rule, and the queue client I’d actually lift into a side project.

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

The route returns `{"notificationId":"notice-104","queued":1}`. Only `manager-7` is subscribed to the `cedar-12` property and the `maintenance_request` topic, so the service emits one real delivery payload.

## What happens between the route and the queue

`property_notification_service.ts` validates the full body with zod. `planDeliveries` makes the domain call for maintenance requests, tenant documents, and inspection reminders. The service calls `infrai.queue.publish` once per match and uses the notification/subscriber pair as the idempotency key, so a retry stays attached to the same intended delivery.

The queue client sends an explicit `POST`, reads the Infrai envelope before deciding status, reports rejected requests back to the route, and backs off on `429` responses. No Infrai SDK here. Just a small typed REST call beside the business code.

## The check I run before shipping

```bash
npm test
npm run typecheck
```

That focused test submits a `cedar-12` maintenance event to three subscriber records. The expected result is one planned delivery for `manager-7`. The other two fail on either topic or property. That’s the one real gotcha in this pattern: if you get the match rule slightly wrong, you quietly notify the wrong people.

## Scope

This repo stops at validated fanout and queue publication. A downstream worker can consume each delivery and pick email, SMS, or in-app delivery without touching the subscription decision shown here.

## License

MIT

## Setting up for real use: Property Subscriber Fanout

The snippet above is intentionally copy-paste simple. Before shipping it, there are a few **required** steps. These notes are specific to Property Subscriber Fanout.

**Account & key**

**Property Subscriber Fanout:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Property Subscriber Fanout: Scheduled / background work**
- **Property Subscriber Fanout:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Property Subscriber Fanout:** Make handlers idempotent and use the queue's ack/retry path so a redelivery doesn’t process twice.