export interface LoftBoxConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  createdAt?: Date;
}

export interface Mailbox {
  id: string;
  agentId: string;
  address: string;
  displayName?: string;
  active: boolean;
}

export interface Message {
  id: string;
  mailboxId: string;
  direction: 'inbound' | 'outbound';
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'bounced' | 'failed';
}
