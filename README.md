# LoftBox TypeScript SDK

AI 에이전트를 위한 이메일 인프라 SDK. 의존성 없음(Node 18+ 내장 `fetch` 사용).

## 설치

```bash
npm install @loftbox/sdk
```

## 자가 가입 — 인증 없이 즉시 키 받기

콘솔 가입 없이 **인증 없는 한 번의 호출**로 바로 쓸 수 있는 API 키를 받습니다(제한 모드).
미검증 동안은 가입 시 선언한 owner 이메일하고만 발신·수신할 수 있고(닫힌 루프 PoC), owner 가
이메일로 클레임(검증)하면 제한이 풀립니다. 미검증 계정은 30일 후 자동 폐기됩니다.

```bash
curl -X POST https://api.loftbox.net/v1/auth/agent-signup \
  -H 'content-type: application/json' \
  -d '{"owner_email":"you@example.com","referrer":"my-app"}'
# → { "org_id": "...", "mailbox_address": "bot-...@mail.loftbox.net",
#     "api_key": "lb_live_...", "signup_status": "unverified", "claim": "..." }
```

받은 `api_key` 로 바로 SDK 를 초기화합니다. 제한 모드에선 `to` 가 owner 이메일이어야 합니다:

```typescript
import { LoftBox } from "@loftbox/sdk";

const client = new LoftBox({ apiKey: "lb_live_..." }); // 자가 가입으로 받은 키
// 제한 모드: 수신자는 owner 이메일만 허용(클레임 전)
await client.messages.send({ mailboxId: "...", to: ["you@example.com"],
  subject: "hello", bodyText: "from my agent" });
```

클레임(owner 검증)은 `https://loftbox.net/claim?org=<org_id>` 또는 API
(`POST /v1/auth/claim/start` → `/v1/auth/claim/verify`)로 합니다. owner 에게는 가입 시
클레임 안내 메일이 자동 발송됩니다.

## 빠른 시작

```typescript
import { LoftBox } from '@loftbox/sdk';

const client = new LoftBox({ apiKey: 'lb_live_xxx' });

// 에이전트 + 메일박스
const agent = await client.agents.create({ name: 'Support Bot', slug: 'support-bot' });
const mailbox = await client.mailboxes.create(agent.id, { localPart: 'support' });

// 발송 (멱등 키로 중복 방지)
const msg = await client.messages.send({
  mailboxId: mailbox.id,
  to: ['recipient@example.com'],
  subject: 'Hello',
  bodyText: 'World',
  idempotencyKey: 'welcome-42',
});

// 수신 폴링 → ack
const inbox = await client.mailboxes.listInbox(mailbox.id);
await client.mailboxes.ackInbox(
  mailbox.id,
  inbox.data.map((m) => m.id),
);
```

## 기능

- **발송** `messages.send(...)` — 텍스트/HTML/Markdown, 첨부, cc, 답장 헤더
- **예약 발송** `send({ ..., sendAt: '2030-01-01T09:00:00Z' })`
- **멱등 발송** `send({ ..., idempotencyKey })`
- **수신** `mailboxes.listInbox()` + `ackInbox()`, `message.extracted_text`(인용 제거 본문)
- **라벨** `messages.addLabels()`, `removeLabel()`, `list({ label })`
- **전문검색** `messages.list({ q })`, `threads.list({ q })`
- **스레드** `threads.list()`, `listMessages()`
- **승인** `messages.approve(id, reason)`, `reject(...)`
- **웹훅** `webhooks.create(agentId, url, eventTypes)`
- **도메인 / suppression** `domains.*`, `suppressions.*`
- **인바운드 안전 (#369/#370)** `message.injection_score`/`injection_categories`(프롬프트-인젝션 신호, 차단 아님) + `inboundRules.*`(발신자 allow/block)

## 인바운드 안전 (프롬프트-인젝션 신호 + 발신자 통제)

수신 메일은 임의 외부 발신자가 보낸 untrusted 입력입니다. 두 가지 통제를 제공합니다.

```ts
// #369: 수신 메시지마다 프롬프트-인젝션 휴리스틱 점수(0~1) + 발화 카테고리.
//       신호 전용 — LoftBox 는 차단하지 않으며, 에이전트가 판단합니다.
const { data } = await client.mailboxes.listInbox("mb_xxx");
for (const msg of data) {
  if ((msg.injection_score ?? 0) >= 0.7) {
    // 예: 사람 승인 후에만 메일 내 지시를 따른다.
    await requireHumanReview(msg);
  }
}

// #370: 발신자 allow/block 리스트로 수신 자체를 통제(SMTP 550 거부).
await client.inboundRules.create({
  ruleType: "block",
  patternType: "domain",
  pattern: "evil.com",
});
await client.inboundRules.create({
  ruleType: "allow",
  patternType: "address",
  pattern: "partner@trusted.com",
  mailboxId: "mb_xxx", // 미지정 시 org 전체
});
const rules = await client.inboundRules.list({ mailboxId: "mb_xxx" });
await client.inboundRules.remove("rule_id");
```

allow 리스트가 하나라도 있으면 미매치 발신자는 거부됩니다(화이트리스트). 평가는 위조 가능한
`From` 헤더가 아니라 SMTP envelope sender 로 합니다.

## 오류 처리

```typescript
import { RateLimitError, NotFoundError } from '@loftbox/sdk';

try {
  await client.messages.send({
    /* ... */
  });
} catch (e) {
  if (e instanceof RateLimitError) {
    console.log(`${e.retryAfterSecs}s 후 재시도`);
  } else if (e instanceof NotFoundError) {
    console.log(e.statusCode, e.message);
  }
}
```

## 페이지네이션

목록 메서드는 `{ data, next_cursor }` 를 반환합니다:

```typescript
let page = await client.messages.list({ mailboxId: mailbox.id, limit: 50 });
while (true) {
  for (const m of page.data) {
    /* ... */
  }
  if (!page.next_cursor) break;
  page = await client.messages.list({
    mailboxId: mailbox.id,
    limit: 50,
    cursor: page.next_cursor,
  });
}
```

## 예제

`examples/quickstart.ts` 참고.

## 라이선스

MIT
