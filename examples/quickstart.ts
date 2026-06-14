/**
 * LoftBox TS SDK 퀵스타트.
 *
 * 실행:
 *   export LOFTBOX_API_KEY=lb_live_xxx
 *   npx tsx examples/quickstart.ts
 */
import { LoftBox, RateLimitError } from '../src/index.js';

async function main(): Promise<void> {
  const apiKey = process.env.LOFTBOX_API_KEY;
  if (!apiKey) throw new Error('LOFTBOX_API_KEY 환경변수가 필요합니다');

  const client = new LoftBox({ apiKey });

  // 1. 에이전트 + 메일박스
  const agent = await client.agents.create({ name: 'Support Bot', slug: 'support-bot' });
  const mailbox = await client.mailboxes.create(agent.id, { localPart: 'support' });
  console.log(`mailbox: ${mailbox.address}`);

  // 2. 발송 (멱등 키)
  try {
    const msg = await client.messages.send({
      mailboxId: mailbox.id,
      to: ['customer@example.com'],
      subject: '안녕하세요',
      bodyText: 'LoftBox 에서 보냅니다.',
      idempotencyKey: 'welcome-customer-42',
    });
    console.log(`sent: ${msg.id} status=${msg.status}`);
  } catch (e) {
    if (e instanceof RateLimitError) {
      console.log(`rate limited, retry after ${e.retryAfterSecs}s`);
    } else {
      throw e;
    }
  }

  // 3. 예약 발송 (1시간 뒤)
  const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await client.messages.send({
    mailboxId: mailbox.id,
    to: ['customer@example.com'],
    subject: '리마인더',
    bodyText: '예약 발송 메시지',
    sendAt,
  });

  // 4. 수신 폴링 → ack
  const inbox = await client.mailboxes.listInbox(mailbox.id, { limit: 20 });
  for (const incoming of inbox.data) {
    console.log(`received: ${incoming.subject}`);
  }
  if (inbox.data.length > 0) {
    await client.mailboxes.ackInbox(
      mailbox.id,
      inbox.data.map((m) => m.id),
    );
  }

  // 5. 라벨 + 전문검색
  if (inbox.data.length > 0) {
    await client.messages.addLabels(inbox.data[0].id, ['needs-reply', 'vip']);
  }
  const results = await client.messages.list({ q: 'invoice', label: 'vip', limit: 10 });
  console.log(`search hits: ${results.data.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
