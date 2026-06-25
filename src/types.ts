/** LoftBox SDK 타입.
 *
 * 응답 모델은 서버가 필드를 추가해도 깨지지 않도록 인덱스 시그니처를 둔다.
 * 필드명은 API wire(snake_case)를 그대로 따른다.
 */

export interface LoftBoxConfig {
  apiKey: string;
  baseUrl?: string;
  /** 요청 타임아웃(ms). 기본 30000. */
  timeoutMs?: number;
  /** 테스트/프록시용 커스텀 fetch. 기본 globalThis.fetch. */
  fetch?: typeof fetch;
}

interface Extensible {
  [key: string]: unknown;
}

export interface Agent extends Extensible {
  id: string;
  slug?: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
}

export interface Mailbox extends Extensible {
  id: string;
  agent_id?: string;
  address: string;
  display_name?: string | null;
  active?: boolean;
  created_at?: string | null;
}

export interface Attachment extends Extensible {
  id: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
}

export interface Message extends Extensible {
  id: string;
  public_id?: string | null;
  mailbox_id?: string;
  thread_id?: string | null;
  direction?: string;
  status?: string;
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  body_markdown?: string | null;
  /** #229 인용 제거된 수신 답장 본문. */
  extracted_text?: string | null;
  /** #369 인바운드 프롬프트-인젝션 휴리스틱 점수(0~1, 높을수록 의심). 신호 전용 — 차단 아님. */
  injection_score?: number | null;
  /** #369 발화한 인젝션 카테고리(instruction_override 등). */
  injection_categories?: string[] | null;
  /** #236 라벨. */
  labels?: string[];
  /** #241 예약발송 시각(RFC3339). */
  scheduled_at?: string | null;
  sent_at?: string | null;
  received_at?: string | null;
  created_at?: string | null;
}

export interface Thread extends Extensible {
  id: string;
  mailbox_id?: string;
  subject?: string | null;
  last_message_at?: string | null;
}

export interface Webhook extends Extensible {
  id: string;
  url: string;
  event_types?: string[];
  /** 생성 응답에서 1회만 반환되는 서명 시크릿 — 즉시 저장, 로그 금지. */
  secret?: string | null;
}

export interface Domain extends Extensible {
  id: string;
  domain?: string;
  status?: string;
}

export interface DomainStatus extends Extensible {
  domain?: string;
  status?: string;
  inbound?: unknown;
  outbound?: unknown;
  next_actions?: unknown;
}

export interface Suppression extends Extensible {
  id: string;
  address: string;
  reason?: string | null;
  created_at?: string | null;
}

/** #370 인바운드 발신자 allow/block 규칙. */
export interface InboundSenderRule extends Extensible {
  id: string;
  /** null = org 전체 메일박스. 값이 있으면 그 메일박스에만 적용. */
  mailbox_id?: string | null;
  /** "allow" 또는 "block". */
  rule_type?: string;
  /** "address"(정확 주소) 또는 "domain". */
  pattern_type?: string;
  pattern?: string;
  created_at?: string | null;
}

/** cursor 페이지네이션 응답. */
export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

/** messages.send 옵션. */
export interface SendMessageParams {
  mailboxId: string;
  to: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  bodyMarkdown?: string;
  cc?: string[];
  inReplyTo?: string;
  references?: string[];
  metadata?: Record<string, unknown>;
  attachments?: Array<Record<string, unknown>>;
  /** RFC3339 미래 시각 — 예약발송. */
  sendAt?: string;
  /** 중복 발송 방지 멱등 키. */
  idempotencyKey?: string;
}

export interface ListMessagesParams {
  mailboxId?: string;
  direction?: string;
  status?: string;
  label?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}
