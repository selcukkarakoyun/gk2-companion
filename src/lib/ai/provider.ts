import type { Material, ScanResult } from '../types';

export type ScanErrorCode =
  | 'no-key'
  | 'auth'
  | 'balance'
  | 'rate-limit'
  | 'bad-request'
  | 'network'
  | 'server'
  | 'format';

const MESSAGES: Record<ScanErrorCode, string> = {
  'no-key': 'Ayarlardan API anahtarı gir.',
  auth: 'API anahtarı geçersiz.',
  balance: 'Bakiye yetersiz.',
  'rate-limit': 'Çok fazla istek, biraz bekle.',
  'bad-request': 'İstek reddedildi. Model adı veya görsel geçersiz olabilir.',
  network: 'Bağlantı kurulamadı.',
  server: 'DeepSeek sunucusu hata verdi, tekrar dene.',
  format: 'AI cevabı okunamadı.',
};

export class ScanError extends Error {
  readonly code: ScanErrorCode;
  constructor(code: ScanErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ScanError';
    this.code = code;
  }
}

export type ScanInput = {
  imageDataUrl: string;
  knownMaterials: Pick<Material, 'id' | 'name' | 'description'>[];
  signal?: AbortSignal;
};

export interface ScanProvider {
  scan(input: ScanInput): Promise<ScanResult>;
}
