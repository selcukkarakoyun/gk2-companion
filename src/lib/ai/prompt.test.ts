import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, buildMessages } from './prompt';

describe('buildMessages', () => {
  const url = 'data:image/jpeg;base64,AAAA';
  const known = [{ id: 'm1', name: 'Tahta', description: 'light plank' }];

  it('sistem mesajı düz metindir ve görsel içermez', () => {
    const [sys] = buildMessages(url, known);
    expect(sys).toEqual({ role: 'system', content: SYSTEM_PROMPT });
  });

  it('görsel yalnızca user mesajında image_url olarak gider', () => {
    const [, user] = buildMessages(url, known);
    expect(user.role).toBe('user');
    const parts = user.content as { type: string; image_url?: { url: string } }[];
    expect(parts.find((p) => p.type === 'image_url')?.image_url?.url).toBe(url);
  });

  it('bilinen malzemeleri JSON olarak metne koyar', () => {
    const [, user] = buildMessages(url, known);
    const text = (user.content as { type: string; text?: string }[]).find((p) => p.type === 'text')!.text!;
    expect(text).toContain(JSON.stringify(known));
  });

  it('bilinen malzeme yoksa boş dizi gönderir', () => {
    const [, user] = buildMessages(url, []);
    const text = (user.content as { type: string; text?: string }[]).find((p) => p.type === 'text')!.text!;
    expect(text).toContain('[]');
  });

  it('istem, sayının slash sonrasını ve boş sonucu tarif eder', () => {
    expect(SYSTEM_PROMPT).toMatch(/AFTER the slash/);
    expect(SYSTEM_PROMPT).toContain('{"buildings":[]}');
  });
});
