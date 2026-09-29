import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, buildMessages } from './prompt';

type Part = { type: string; text?: string; image_url?: { url: string } };
const parts = (msg: { content: unknown }) => msg.content as Part[];

describe('buildMessages', () => {
  const url = 'data:image/jpeg;base64,AAAA';
  const known = [{ id: 'm1', name: 'Tahta', description: 'light plank' }];

  it('sistem mesajı düz metindir ve görsel içermez', () => {
    const [sys] = buildMessages(url, known);
    expect(sys).toEqual({ role: 'system', content: SYSTEM_PROMPT });
  });

  it('taranacak görsel user mesajının son parçasıdır', () => {
    const [, user] = buildMessages(url, known);
    expect(user.role).toBe('user');
    const p = parts(user);
    expect(p[p.length - 1]).toEqual({ type: 'image_url', image_url: { url } });
  });

  it("bilinen malzemeleri JSON olarak metne koyar (ikon verisi JSON'a girmez)", () => {
    const withIcon = [{ id: 'm1', name: 'Tahta', description: 'light plank', icon: 'data:image/png;base64,ICON' }];
    const [, user] = buildMessages(url, withIcon);
    const text = parts(user)[0].text!;
    expect(text).toContain(JSON.stringify([{ id: 'm1', name: 'Tahta', description: 'light plank' }]));
    expect(text).not.toContain('ICON');
  });

  it('bilinen malzeme yoksa boş dizi gönderir ve referans görsel eklemez', () => {
    const [, user] = buildMessages(url, []);
    expect(parts(user)[0].text).toContain('[]');
    expect(parts(user).filter((x) => x.type === 'image_url')).toHaveLength(1);
  });

  it('ikonu olan bilinen malzemeyi etiketli referans görsel olarak ekler; ikonsuzu eklemez', () => {
    const list = [
      { id: 'm1', name: 'Tahta', description: 'plank', icon: 'data:image/png;base64,ONE' },
      { id: 'm2', name: 'Çivi', description: 'nails' },
      { id: 'm3', name: 'Taş', description: 'stone', icon: 'data:image/png;base64,THREE' },
    ];
    const p = parts(buildMessages(url, list)[1]);
    const images = p.filter((x) => x.type === 'image_url').map((x) => x.image_url!.url);
    expect(images).toEqual(['data:image/png;base64,ONE', 'data:image/png;base64,THREE', url]);
    const labels = p.filter((x) => x.type === 'text').map((x) => x.text);
    expect(labels).toContain('Reference icon for known material id="m1" name="Tahta":');
    expect(labels).toContain('Reference icon for known material id="m3" name="Taş":');
    expect(labels.join('\n')).not.toContain('id="m2"');
    const iconIdx = p.findIndex((x) => x.image_url?.url.endsWith('ONE'));
    expect(p[iconIdx - 1].text).toContain('id="m1"');
  });

  it('istem sayının slash sonrasını, alanı, kutuyu ve boş sonucu tarif eder', () => {
    expect(SYSTEM_PROMPT).toMatch(/AFTER the slash/);
    expect(SYSTEM_PROMPT).toMatch(/"area"/);
    expect(SYSTEM_PROMPT).toMatch(/"box"/);
    expect(SYSTEM_PROMPT).toMatch(/reference icon/i);
    expect(SYSTEM_PROMPT).toContain('"buildings":[]');
  });
});
