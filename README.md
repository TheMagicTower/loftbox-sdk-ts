# LoftBox TypeScript SDK

AI 에이전트를 위한 이메일 인프라 SDK. 의존성 없음(Node 18+ 내장 `fetch` 사용).

## 설치

```bash
npm install @loftbox/sdk
```

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
