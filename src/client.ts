import type { LoftBoxConfig } from './types.js';

export class LoftBox {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: LoftBoxConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.loftbox.net';
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}
