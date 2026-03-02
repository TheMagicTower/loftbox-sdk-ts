# LoftBox TypeScript SDK

AI 에이전트를 위한 이메일 인프라 SDK

## 설치

```bash
npm install @loftbox/sdk
```

## 사용법

```typescript
import { LoftBox } from '@loftbox/sdk';

const client = new LoftBox({ apiKey: 'lb_live_xxx' });
await client.messages.send({
  mailboxId: 'mb_xxx',
  to: 'recipient@example.com',
  subject: 'Hello',
  bodyText: 'World'
});
```

## MCP 통합

Phase 2에서 MCP 서버 지원 예정
