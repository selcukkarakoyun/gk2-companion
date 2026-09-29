import { describe, expect, it, vi } from 'vitest';
import { createDeepSeekProvider } from './deepseek';
import { ScanError } from './provider';

const GOOD = { area: null, buildings: [{ name: 'A', requirements: [{ materialId: 'm1', suggestedName: null, description: null, amount: 2, box: null }] }] };
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const ok = (content: string) => respond(200, { choices: [{ message: { content } }] });
const input = { imageDataUrl: 'data:image/jpeg;base64,AAAA', knownMaterials: [{ id: 'm1', name: 'Tahta', description: 'plank' }] };
const make = (fetchImpl: typeof fetch, apiKey = 'k') => createDeepSeekProvider({ apiKey, model: 'deepseek-flash', fetchImpl });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ScanError ? e.code : `other:${String(e)}`;
  }
  return 'no-error';
};

describe('createDeepSeekProvider', () => {
  it('doğru uç noktaya, başlıklarla ve doğru gövdeyle istek atar', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(JSON.stringify(GOOD)));
    const result = await make(fetchImpl as unknown as typeof fetch).scan(input);
    expect(result).toEqual(GOOD);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('deepseek-flash');
    expect(body.messages[0].role).toBe('system');
    expect(typeof body.messages[0].content).toBe('string');
    expect(body.messages[1].content.some((p: { type: string }) => p.type === 'image_url')).toBe(true);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('API anahtarı yoksa istek atmadan no-key verir', async () => {
    const fetchImpl = vi.fn();
    expect(await code(make(fetchImpl as unknown as typeof fetch, '  ').scan(input))).toBe('no-key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'auth'],
    [402, 'balance'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
    [404, 'bad-request'],
  ])('%s durumunu %s koduna çevirir', async (status, expected) => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(status, { error: {} }));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe(expected);
  });

  it('ağ hatasını network koduna çevirir', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('network');
  });

  it('iptali (AbortError) olduğu gibi yukarı fırlatır', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const fetchImpl = vi.fn().mockRejectedValue(abort);
    await expect(make(fetchImpl as unknown as typeof fetch).scan(input)).rejects.toBe(abort);
  });

  it('400 gelirse response_format olmadan bir kez daha dener', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(400, { error: { message: 'response_format unsupported' } }))
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    expect(await make(fetchImpl as unknown as typeof fetch).scan(input)).toEqual(GOOD);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).response_format).toBeUndefined();
  });

  it('iki 400 üst üste gelirse bad-request verir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(400, { error: {} }));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('bad-request');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('geçersiz JSON gelirse bir kez otomatik tekrar dener', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok('bu JSON değil'))
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    expect(await make(fetchImpl as unknown as typeof fetch).scan(input)).toEqual(GOOD);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('iki kez geçersiz JSON gelirse format hatası verir', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok('yine JSON değil'));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('format');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('boş içerik ve eksik choices alanını format hatası sayar', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => respond(200, { choices: [] }));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('format');
  });

  it('gövde JSON değilse format hatası verir', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('<html>', { status: 200 }));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('format');
  });
});
