import { ScanFormatError, parseScanResponse } from './parse';
import { buildMessages, type ChatMessage } from './prompt';
import { ScanError, type ScanInput, type ScanProvider } from './provider';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

export type DeepSeekConfig = { apiKey: string; model: string; fetchImpl?: typeof fetch };

function statusError(status: number): ScanError {
  if (status === 401) return new ScanError('auth');
  if (status === 402) return new ScanError('balance');
  if (status === 429) return new ScanError('rate-limit');
  if (status >= 500) return new ScanError('server');
  return new ScanError('bad-request');
}

export function createDeepSeekProvider(cfg: DeepSeekConfig): ScanProvider {
  const doFetch: typeof fetch = cfg.fetchImpl ?? ((...args) => fetch(...args));

  async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    try {
      return await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey.trim()}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ScanError('network');
    }
  }

  async function complete(messages: ChatMessage[], signal?: AbortSignal, fallback?: ChatMessage[]): Promise<string> {
    const base = { model: cfg.model, messages, temperature: 0, stream: false };
    let res = await post({ ...base, response_format: { type: 'json_object' } }, signal);
    if (res.status === 400) res = await post(base, signal);
    // Reddedilirse (ör. görsel sayısı sınırı) referans ikonlar olmadan son bir kez dene.
    if (res.status === 400 && fallback) res = await post({ ...base, messages: fallback }, signal);
    if (!res.ok) throw statusError(res.status);
    let data: { choices?: { message?: { content?: unknown } }[] };
    try {
      data = await res.json();
    } catch {
      throw new ScanError('format');
    }
    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }

  return {
    async scan({ imageDataUrl, knownMaterials, signal }: ScanInput) {
      if (!cfg.apiKey.trim()) throw new ScanError('no-key');
      const messages = buildMessages(imageDataUrl, knownMaterials);
      const hasReferences = knownMaterials.some((m) => m.icon);
      const fallback = hasReferences
        ? buildMessages(imageDataUrl, knownMaterials.map(({ id, name, description }) => ({ id, name, description })))
        : undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const content = await complete(messages, signal, fallback);
        try {
          return parseScanResponse(content);
        } catch (e) {
          if (!(e instanceof ScanFormatError)) throw e;
        }
      }
      throw new ScanError('format');
    },
  };
}
