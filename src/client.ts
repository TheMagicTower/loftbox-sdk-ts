import { LoftBoxError, errorForStatus } from "./errors.js";
import type {
  Agent,
  Attachment,
  Domain,
  DomainStatus,
  InboundSenderRule,
  ListMessagesParams,
  LoftBoxConfig,
  Mailbox,
  Message,
  Page,
  SendMessageParams,
  Suppression,
  Thread,
  Webhook,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.loftbox.net";
const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "loftbox-ts/0.2.0";

type Query = Record<string, string | number | undefined | null>;

/** LoftBox API 클라이언트 (fetch 기반, 의존성 없음). */
export class LoftBox {
  readonly auth: AuthResource;
  readonly agents: AgentsResource;
  readonly mailboxes: MailboxesResource;
  readonly messages: MessagesResource;
  readonly threads: ThreadsResource;
  readonly webhooks: WebhooksResource;
  readonly domains: DomainsResource;
  readonly suppressions: SuppressionsResource;
  readonly inboundRules: InboundRulesResource;
  readonly attachments: AttachmentsResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LoftBoxConfig) {
    if (!config?.apiKey) throw new Error("apiKey 는 필수입니다");
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const f = config.fetch ?? globalThis.fetch;
    if (!f)
      throw new Error(
        "fetch 를 사용할 수 없습니다 (Node 18+ 또는 config.fetch 제공)",
      );
    this.fetchImpl = f;

    this.auth = new AuthResource(this);
    this.agents = new AgentsResource(this);
    this.mailboxes = new MailboxesResource(this);
    this.messages = new MessagesResource(this);
    this.threads = new ThreadsResource(this);
    this.webhooks = new WebhooksResource(this);
    this.domains = new DomainsResource(this);
    this.suppressions = new SuppressionsResource(this);
    this.inboundRules = new InboundRulesResource(this);
    this.attachments = new AttachmentsResource(this);
  }

  /** @internal */
  async request<T>(
    method: string,
    path: string,
    opts: {
      json?: unknown;
      query?: Query;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...opts.headers,
    };
    if (opts.json !== undefined) headers["Content-Type"] = "application/json";

    // 타임아웃은 fetch + 본문 읽기 전체를 덮는다 — 헤더만 보내고 body 를 멈추는
    // 서버/프록시에도 timeoutMs 가 적용되도록(codex 리뷰 Major).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let resp: Response;
    let text: string;
    try {
      resp = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
        signal: controller.signal,
      });
      text = await resp.text();
    } catch (e) {
      throw new LoftBoxError(`요청 실패: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    const requestId = resp.headers.get("x-request-id") ?? undefined;
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!resp.ok) {
      let message = `HTTP ${resp.status}`;
      let retryAfterSecs: number | undefined;
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        const err = b.error;
        if (err && typeof err === "object") {
          const eo = err as Record<string, unknown>;
          if (typeof eo.message === "string") message = eo.message;
          if (typeof eo.retry_after === "number")
            retryAfterSecs = eo.retry_after;
        } else if (typeof b.message === "string") {
          message = b.message;
        } else if (typeof err === "string") {
          message = err;
        } else if (typeof b.detail === "string") {
          message = b.detail;
        }
      } else if (typeof body === "string" && body) {
        message = body;
      }
      const headerRa = resp.headers.get("retry-after");
      if (headerRa && /^\d+$/.test(headerRa)) retryAfterSecs = Number(headerRa);
      throw errorForStatus(resp.status, message, {
        body,
        requestId,
        retryAfterSecs,
      });
    }

    return body as T;
  }
}

function page<T>(raw: unknown): Page<T> {
  if (Array.isArray(raw)) return { data: raw as T[], next_cursor: null };
  const src = (raw ?? {}) as { data?: T[]; next_cursor?: string | null };
  return { data: src.data ?? [], next_cursor: src.next_cursor ?? null };
}

class Resource {
  constructor(protected readonly c: LoftBox) {}
}

class AuthResource extends Resource {
  signup(
    email: string,
    organizationName: string,
    slug?: string,
  ): Promise<Record<string, unknown>> {
    return this.c.request("POST", "/v1/auth/signup", {
      json: { email, organization_name: organizationName, slug: slug ?? null },
    });
  }

  verifySignup(
    email: string,
    verificationToken: string,
  ): Promise<Record<string, unknown>> {
    return this.c.request("POST", "/v1/auth/signup/verify", {
      json: { email, verification_token: verificationToken },
    });
  }
}

class AgentsResource extends Resource {
  create(params: {
    name: string;
    slug: string;
    description?: string;
    purpose?: string;
    externalId?: string;
    ownerLabel?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Agent> {
    return this.c.request("POST", "/v1/agents", {
      json: {
        name: params.name,
        slug: params.slug,
        description: params.description ?? null,
        purpose: params.purpose ?? null,
        external_id: params.externalId ?? null,
        owner_label: params.ownerLabel ?? null,
        metadata: params.metadata ?? null,
      },
    });
  }

  get(agentId: string): Promise<Agent> {
    return this.c.request("GET", `/v1/agents/${encodeURIComponent(agentId)}`);
  }

  async list(
    params: { limit?: number; cursor?: string } = {},
  ): Promise<Page<Agent>> {
    return page<Agent>(
      await this.c.request("GET", "/v1/agents", {
        query: { limit: params.limit, cursor: params.cursor },
      }),
    );
  }
}

class MailboxesResource extends Resource {
  create(
    agentId: string,
    params: {
      localPart: string;
      domainId?: string;
      displayName?: string;
      webhookUrl?: string;
      retentionDays?: number;
    },
  ): Promise<Mailbox> {
    return this.c.request(
      "POST",
      `/v1/agents/${encodeURIComponent(agentId)}/mailboxes`,
      {
        json: {
          local_part: params.localPart,
          domain_id: params.domainId ?? null,
          display_name: params.displayName ?? null,
          webhook_url: params.webhookUrl ?? null,
          retention_days: params.retentionDays ?? null,
        },
      },
    );
  }

  async listByAgent(agentId: string): Promise<Page<Mailbox>> {
    return page<Mailbox>(
      await this.c.request(
        "GET",
        `/v1/agents/${encodeURIComponent(agentId)}/mailboxes`,
      ),
    );
  }

  async listInbox(
    mailboxId: string,
    params: { limit?: number; cursor?: string } = {},
  ): Promise<Page<Message>> {
    return page<Message>(
      await this.c.request(
        "GET",
        `/v1/mailboxes/${encodeURIComponent(mailboxId)}/inbox`,
        {
          query: { limit: params.limit, cursor: params.cursor },
        },
      ),
    );
  }

  ackInbox(mailboxId: string, messageIds: string[]): Promise<unknown> {
    return this.c.request(
      "POST",
      `/v1/mailboxes/${encodeURIComponent(mailboxId)}/inbox/ack`,
      {
        json: { message_ids: messageIds },
      },
    );
  }
}

class MessagesResource extends Resource {
  send(params: SendMessageParams): Promise<Message> {
    const headers = params.idempotencyKey
      ? { "Idempotency-Key": params.idempotencyKey }
      : undefined;
    return this.c.request("POST", "/v1/messages", {
      json: {
        mailbox_id: params.mailboxId,
        to: params.to,
        subject: params.subject,
        body_text: params.bodyText ?? null,
        body_html: params.bodyHtml ?? null,
        body_markdown: params.bodyMarkdown ?? null,
        cc: params.cc ?? [],
        in_reply_to: params.inReplyTo ?? null,
        references: params.references ?? [],
        metadata: params.metadata ?? null,
        attachments: params.attachments ?? [],
        send_at: params.sendAt ?? null,
      },
      headers,
    });
  }

  get(messageId: string): Promise<Message> {
    return this.c.request(
      "GET",
      `/v1/messages/${encodeURIComponent(messageId)}`,
    );
  }

  async list(params: ListMessagesParams = {}): Promise<Page<Message>> {
    return page<Message>(
      await this.c.request("GET", "/v1/messages", {
        query: {
          mailbox_id: params.mailboxId,
          direction: params.direction,
          status: params.status,
          label: params.label,
          q: params.q,
          limit: params.limit,
          cursor: params.cursor,
        },
      }),
    );
  }

  addLabels(messageId: string, labels: string[]): Promise<Message> {
    return this.c.request(
      "POST",
      `/v1/messages/${encodeURIComponent(messageId)}/labels`,
      {
        json: { labels },
      },
    );
  }

  removeLabel(messageId: string, label: string): Promise<Message> {
    return this.c.request(
      "DELETE",
      `/v1/messages/${encodeURIComponent(messageId)}/labels/${encodeURIComponent(label)}`,
    );
  }

  approve(messageId: string, reason: string): Promise<Message> {
    return this.c.request(
      "POST",
      `/v1/messages/${encodeURIComponent(messageId)}/approve`,
      {
        json: { reason },
      },
    );
  }

  reject(messageId: string, reason: string): Promise<Message> {
    return this.c.request(
      "POST",
      `/v1/messages/${encodeURIComponent(messageId)}/reject`,
      {
        json: { reason },
      },
    );
  }
}

class ThreadsResource extends Resource {
  async list(
    params: {
      mailboxId?: string;
      q?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<Page<Thread>> {
    return page<Thread>(
      await this.c.request("GET", "/v1/threads", {
        query: {
          mailbox_id: params.mailboxId,
          q: params.q,
          limit: params.limit,
          cursor: params.cursor,
        },
      }),
    );
  }

  async listMessages(threadId: string): Promise<Page<Message>> {
    return page<Message>(
      await this.c.request(
        "GET",
        `/v1/threads/${encodeURIComponent(threadId)}/messages`,
      ),
    );
  }
}

class WebhooksResource extends Resource {
  create(agentId: string, url: string, eventTypes: string[]): Promise<Webhook> {
    return this.c.request(
      "POST",
      `/v1/agents/${encodeURIComponent(agentId)}/webhooks`,
      {
        json: { url, event_types: eventTypes },
      },
    );
  }
}

class DomainsResource extends Resource {
  create(domain: string): Promise<Domain> {
    return this.c.request("POST", "/v1/domains", { json: { domain } });
  }

  async list(): Promise<Page<Domain>> {
    return page<Domain>(await this.c.request("GET", "/v1/domains"));
  }

  status(domainId: string): Promise<DomainStatus> {
    return this.c.request(
      "GET",
      `/v1/domains/${encodeURIComponent(domainId)}/status`,
    );
  }
}

class SuppressionsResource extends Resource {
  async list(
    params: { limit?: number; before?: string } = {},
  ): Promise<Page<Suppression>> {
    return page<Suppression>(
      await this.c.request("GET", "/v1/suppressions", {
        query: { limit: params.limit, before: params.before },
      }),
    );
  }

  create(address: string): Promise<Suppression> {
    return this.c.request("POST", "/v1/suppressions", { json: { address } });
  }

  async remove(suppressionId: string): Promise<void> {
    await this.c.request(
      "DELETE",
      `/v1/suppressions/${encodeURIComponent(suppressionId)}`,
    );
  }
}

/** #370 인바운드 발신자 allow/block 리스트 — 수신 통제. */
class InboundRulesResource extends Resource {
  async list(
    params: { mailboxId?: string; limit?: number; before?: string } = {},
  ): Promise<Page<InboundSenderRule>> {
    return page<InboundSenderRule>(
      await this.c.request("GET", "/v1/inbound-rules", {
        query: {
          mailbox_id: params.mailboxId,
          limit: params.limit,
          before: params.before,
        },
      }),
    );
  }

  /**
   * 규칙 생성. ruleType=allow|block, patternType=address|domain.
   * mailboxId 미지정 = org 전체. block 매치 또는 allow 리스트 미매치 발신자는 수신 거부.
   */
  create(params: {
    ruleType: string;
    patternType: string;
    pattern: string;
    mailboxId?: string;
  }): Promise<InboundSenderRule> {
    return this.c.request("POST", "/v1/inbound-rules", {
      json: {
        rule_type: params.ruleType,
        pattern_type: params.patternType,
        pattern: params.pattern,
        mailbox_id: params.mailboxId ?? null,
      },
    });
  }

  async remove(ruleId: string): Promise<void> {
    await this.c.request(
      "DELETE",
      `/v1/inbound-rules/${encodeURIComponent(ruleId)}`,
    );
  }
}

class AttachmentsResource extends Resource {
  async listForMessage(messageId: string): Promise<Page<Attachment>> {
    return page<Attachment>(
      await this.c.request(
        "GET",
        `/v1/messages/${encodeURIComponent(messageId)}/attachments`,
      ),
    );
  }

  presignedUrl(attachmentId: string): Promise<Record<string, unknown>> {
    return this.c.request(
      "GET",
      `/v1/attachments/${encodeURIComponent(attachmentId)}/url`,
    );
  }
}
