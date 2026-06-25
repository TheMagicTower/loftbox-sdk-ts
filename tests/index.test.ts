import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LoftBox,
  RateLimitError,
  NotFoundError,
  ValidationError,
} from "../src/index.js";

type Handler = (req: Request) => Response | Promise<Response>;

function makeClient(handler: Handler): { client: LoftBox; calls: Request[] } {
  const calls: Request[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const req = new Request(
      typeof input === "string" ? input : input.toString(),
      init,
    );
    calls.push(req);
    return handler(req);
  }) as unknown as typeof fetch;
  const client = new LoftBox({
    apiKey: "lb_test",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
  });
  return { client, calls };
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("LoftBox TS SDK", () => {
  it("requires apiKey", () => {
    assert.throws(() => new LoftBox({ apiKey: "" }));
  });

  it("send shapes request and parses message", async () => {
    const { client, calls } = makeClient(async (req) => {
      assert.equal(req.method, "POST");
      assert.ok(req.url.endsWith("/v1/messages"));
      assert.equal(req.headers.get("authorization"), "Bearer lb_test");
      assert.equal(req.headers.get("idempotency-key"), "key-1");
      const body = await req.json();
      assert.equal(body.mailbox_id, "mb_1");
      assert.deepEqual(body.to, ["a@example.com"]);
      assert.equal(body.send_at, "2030-01-01T00:00:00Z");
      return json({ id: "msg_1", status: "queued", labels: [] }, 201);
    });
    const msg = await client.messages.send({
      mailboxId: "mb_1",
      to: ["a@example.com"],
      subject: "hi",
      bodyText: "b",
      sendAt: "2030-01-01T00:00:00Z",
      idempotencyKey: "key-1",
    });
    assert.equal(msg.id, "msg_1");
    assert.equal(msg.status, "queued");
    assert.equal(calls.length, 1);
  });

  it("list applies filters and drops undefined query", async () => {
    const { client } = makeClient(async (req) => {
      const u = new URL(req.url);
      assert.equal(u.searchParams.get("label"), "vip");
      assert.equal(u.searchParams.get("q"), "invoice");
      assert.equal(u.searchParams.has("status"), false);
      return json({ data: [{ id: "m1", labels: ["vip"] }], next_cursor: "c2" });
    });
    const pageRes = await client.messages.list({
      label: "vip",
      q: "invoice",
      limit: 10,
    });
    assert.equal(pageRes.data.length, 1);
    assert.equal(pageRes.next_cursor, "c2");
  });

  it("list handles bare array response", async () => {
    const { client } = makeClient(async () =>
      json([{ id: "d1", domain: "x.com" }]),
    );
    const pageRes = await client.domains.list();
    assert.equal(pageRes.data.length, 1);
    assert.equal(pageRes.next_cursor, null);
  });

  it("removeLabel encodes special chars", async () => {
    const { client } = makeClient(async (req) => {
      const u = new URL(req.url);
      assert.ok(u.pathname.endsWith("/labels/needs%20review%2Furgent"));
      return json({ id: "msg_1", labels: [] });
    });
    await client.messages.removeLabel("msg_1", "needs review/urgent");
  });

  it("verifySignup sends email and verification_token", async () => {
    const { client } = makeClient(async (req) => {
      const body = await req.json();
      assert.deepEqual(body, { email: "a@b.com", verification_token: "tok-1" });
      return json({ ok: true });
    });
    await client.auth.verifySignup("a@b.com", "tok-1");
  });

  it("maps nested error shape with retry_after", async () => {
    const { client } = makeClient(async () =>
      json(
        { error: { message: "rate limited", code: 429, retry_after: 7 } },
        429,
      ),
    );
    await assert.rejects(
      () =>
        client.messages.send({
          mailboxId: "mb_1",
          to: ["a@b.com"],
          subject: "s",
          bodyText: "b",
        }),
      (e: unknown) => {
        assert.ok(e instanceof RateLimitError);
        assert.equal(e.message, "rate limited");
        assert.equal(e.retryAfterSecs, 7);
        return true;
      },
    );
  });

  it("maps status codes to error types", async () => {
    for (const [code, ctor] of [
      [404, NotFoundError],
      [400, ValidationError],
      [422, ValidationError],
    ] as const) {
      const { client } = makeClient(async () =>
        json({ error: { message: `e${code}` } }, code),
      );
      await assert.rejects(
        () => client.messages.get("x"),
        (e: unknown) =>
          e instanceof ctor && (e as RateLimitError).statusCode === code,
      );
    }
  });

  it("falls back to top-level detail message", async () => {
    const { client } = makeClient(async () =>
      json({ detail: "bad input" }, 400),
    );
    await assert.rejects(
      () => client.messages.get("x"),
      (e: unknown) => e instanceof ValidationError && e.message === "bad input",
    );
  });

  it("ackInbox posts message ids", async () => {
    const { client } = makeClient(async (req) => {
      assert.ok(req.url.endsWith("/v1/mailboxes/mb_1/inbox/ack"));
      const body = await req.json();
      assert.deepEqual(body.message_ids, ["m1", "m2"]);
      return json({ acked: 2 });
    });
    await client.mailboxes.ackInbox("mb_1", ["m1", "m2"]);
  });

  it("parses inbound injection signal (#369)", async () => {
    const { client } = makeClient(async () =>
      json({
        id: "msg_1",
        direction: "incoming",
        injection_score: 0.78,
        injection_categories: ["instruction_override"],
      }),
    );
    const msg = await client.messages.get("msg_1");
    assert.equal(msg.injection_score, 0.78);
    assert.deepEqual(msg.injection_categories, ["instruction_override"]);
  });

  it("inboundRules.create shapes request (#370)", async () => {
    const { client } = makeClient(async (req) => {
      assert.equal(req.method, "POST");
      assert.ok(req.url.endsWith("/v1/inbound-rules"));
      const body = await req.json();
      assert.equal(body.rule_type, "block");
      assert.equal(body.pattern_type, "domain");
      assert.equal(body.pattern, "evil.com");
      assert.equal(body.mailbox_id, null);
      return json(
        {
          id: "rule_1",
          rule_type: "block",
          pattern_type: "domain",
          pattern: "evil.com",
        },
        201,
      );
    });
    const rule = await client.inboundRules.create({
      ruleType: "block",
      patternType: "domain",
      pattern: "evil.com",
    });
    assert.equal(rule.id, "rule_1");
  });

  it("inboundRules.list filters by mailbox (#370)", async () => {
    const { client } = makeClient(async (req) => {
      assert.ok(req.url.includes("/v1/inbound-rules"));
      assert.equal(new URL(req.url).searchParams.get("mailbox_id"), "mb_9");
      return json({ data: [{ id: "r1" }], next_cursor: null });
    });
    const pageRes = await client.inboundRules.list({ mailboxId: "mb_9" });
    assert.equal(pageRes.data[0].id, "r1");
  });

  it("inboundRules.remove uses DELETE path (#370)", async () => {
    const { client, calls } = makeClient(
      async () => new Response(null, { status: 204 }),
    );
    await client.inboundRules.remove("rule_42");
    assert.equal(calls[0].method, "DELETE");
    assert.ok(calls[0].url.endsWith("/v1/inbound-rules/rule_42"));
  });
});
