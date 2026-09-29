import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = path.resolve('docs/samples/insa-menusu-1.png');
const BOX = { x: 0.78, y: 0.05, w: 0.07, h: 0.14 };

const req = (suggestedName: string, description: string) => (amount: number) => ({
  materialId: null,
  suggestedName,
  description,
  amount,
  box: BOX,
});
const TAHTA = req('Tahta', 'light brown plank');
const CIVI = req('Çivi', 'gold nails');
const KERESTE = req('Kereste', 'dark rough plank');
const TAS = req('Taş', 'grey stone block');

const BAHCE = {
  area: 'Bahçe',
  buildings: [
    { name: 'Basit Sandık', requirements: [TAHTA(4), CIVI(4)] },
    { name: 'Kiliseyi Geliştir I', requirements: [KERESTE(8), TAS(6)] },
    { name: 'İç Mekân Bankı I', requirements: [TAHTA(2), CIVI(6)] },
    { name: 'Günah Çıkarma Kabini I', requirements: [TAHTA(6), CIVI(8)] },
    { name: 'Kilise Sunağı I', requirements: [TAHTA(4), CIVI(6), TAS(3)] },
  ],
};
const AVLU = {
  area: 'Avlu',
  buildings: [
    { name: 'Marangoz Tezgâhı I', requirements: [TAHTA(8), CIVI(4)] },
    { name: 'Taş Ustası Tezgâhı', requirements: [TAHTA(2), CIVI(2)] },
  ],
};

let current: unknown = BAHCE;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'POST',
};

test.beforeEach(async ({ page }) => {
  current = BAHCE;
  await page.addInitScript(() => {
    if (!localStorage.getItem('gk2c.settings')) {
      localStorage.setItem('gk2c.settings', JSON.stringify({ apiKey: 'test-key', model: 'deepseek-flash' }));
    }
  });
  await page.route('https://api.deepseek.com/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(current) } }] }),
    });
  });
});

async function pickSample(page: Page) {
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'Devam' }).click();
}

async function scanSample(page: Page, buildings = 5) {
  await pickSample(page);
  await expect(page.getByTestId('review-building')).toHaveCount(buildings);
}

async function expectTotal(page: Page, name: string, total: number) {
  await expect(page.getByTestId('total-row').filter({ hasText: name })).toContainText(String(total));
}

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('gk2c.state')!));

test('tara, incele, listele, adedi artır, tekrar tara, yenile', async ({ page }) => {
  await page.goto('/');

  // 1. tarama: 5 yeni yapı, 4 yeni malzeme (Çivi tek malzeme), alan Bahçe
  await scanSample(page);
  await expect(page.getByLabel('Alan', { exact: true })).toHaveValue('Bahçe');
  await expect(page.getByTestId('review-new-material')).toHaveCount(4);
  await expect(page.getByText('Yeni', { exact: true })).toHaveCount(5);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building')).toHaveCount(5);

  await page.getByRole('button', { name: 'Toplam' }).click();
  await expect(page.getByTestId('total-row')).toHaveCount(4);
  await expectTotal(page, 'Tahta', 16);
  await expectTotal(page, 'Çivi', 24);
  await expectTotal(page, 'Kereste', 8);
  await expectTotal(page, 'Taş', 9);

  // adet artır
  await page.getByRole('button', { name: 'Yapılar' }).click();
  await page.locator('article.building', { hasText: 'Basit Sandık' }).getByRole('button', { name: 'Adedi artır' }).click();
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expectTotal(page, 'Tahta', 20);
  await expectTotal(page, 'Çivi', 28);

  // 2. tarama (aynı görsel, aynı alan): kopya açılmaz, adet korunur
  await page.getByRole('button', { name: 'Yapılar' }).click();
  await scanSample(page);
  await expect(page.getByText('Mevcut kayıt güncellenecek')).toHaveCount(5);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building')).toHaveCount(5);
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expectTotal(page, 'Tahta', 20);
  expect((await stateOf(page)).materials).toHaveLength(4);

  // yenileme: veri kalıcı
  await page.reload();
  await expect(page.locator('article.building')).toHaveCount(5);
});

test('Tüm Eşyalar: yeniden adlandırma çakışmada reddedilir, geçerli isim kalır', async ({ page }) => {
  await page.goto('/');
  await scanSample(page);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await page.getByRole('button', { name: 'Ayarlar' }).click();

  const nameInput = page.getByLabel('Tahta adı');
  await nameInput.fill('ÇİVİ');
  await nameInput.blur();
  await expect(page.getByText('başka bir malzemede kullanılıyor')).toBeVisible();

  await nameInput.fill('Kalın Tahta');
  await nameInput.blur();
  await expect(page.getByText('başka bir malzemede kullanılıyor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expectTotal(page, 'Kalın Tahta', 16);
});

test('Tüm Eşyalar: görsel yüklenir ve kaldırılır', async ({ page }) => {
  await page.goto('/');
  await scanSample(page);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await page.getByRole('button', { name: 'Ayarlar' }).click();

  // 1x1 kırmızı PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByLabel('Çivi için görsel yükle').setInputFiles({ name: 'civi.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Çivi ikonu')).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect((await stateOf(page)).materials.find((m: { name: string }) => m.name === 'Çivi').icon).toMatch(/^data:image\/png/);

  await page.getByRole('button', { name: 'Çivi görselini kaldır' }).click();
  await expect(page.getByAltText('Çivi ikonu')).toHaveCount(0);
});

test('API anahtarı yokken tarama Ayarlar yönlendirmesi gösterir', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gk2c.settings', JSON.stringify({ apiKey: '', model: 'deepseek-flash' })));
  await page.goto('/');
  await pickSample(page);
  await expect(page.getByText('Ayarlardan API anahtarı gir.')).toBeVisible();
  await page.getByRole('button', { name: 'Ayarlara git' }).click();
  await expect(page.getByLabel('DeepSeek API anahtarı')).toBeVisible();
});

test('inceleme ekranında satırı yeni malzemeye çevirmek ayrı malzeme oluşturur', async ({ page }) => {
  await page.goto('/');
  await scanSample(page);
  const card = page.getByTestId('review-building').first();
  await card.getByLabel('Malzeme', { exact: true }).first().selectOption({ label: '+ Yeni malzeme' });
  await expect(page.getByRole('alert')).toContainText('boş');
  await expect(page.getByRole('button', { name: 'Listeye ekle' })).toBeDisabled();
  await page.getByLabel('Yeni malzeme adı').last().fill('Kalın Tahta');
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  expect((await stateOf(page)).materials).toHaveLength(5);
});

test('iki alan taranınca Toplam alan kırılımı gösterir, Yapılar alanlara göre gruplanır', async ({ page }) => {
  await page.goto('/');
  await scanSample(page, 5);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();

  current = AVLU;
  await scanSample(page, 2);
  await expect(page.getByLabel('Alan', { exact: true })).toHaveValue('Avlu');
  await page.getByRole('button', { name: 'Listeye ekle' }).click();

  await expect(page.getByRole('heading', { name: 'Bahçe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Avlu' })).toBeVisible();

  await page.getByRole('button', { name: 'Toplam' }).click();
  const tahta = page.getByTestId('total-row').filter({ hasText: 'Tahta' });
  await expect(tahta).toContainText('26');
  await expect(tahta).toContainText('Bahçe = 16');
  await expect(tahta).toContainText('Avlu = 10');
  const civi = page.getByTestId('total-row').filter({ hasText: 'Çivi' });
  await expect(civi).toContainText('30');
  await expect(civi).toContainText('Bahçe = 24');
  await expect(civi).toContainText('Avlu = 6');
  expect((await stateOf(page)).materials).toHaveLength(4);
});

test('aynı yapı adı iki alanda ayrı kayıt olur', async ({ page }) => {
  await page.goto('/');
  current = { area: 'Bahçe', buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(4)] }] };
  await scanSample(page, 1);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  current = { area: 'Avlu', buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(9)] }] };
  await scanSample(page, 1);
  await expect(page.getByText('Yeni', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building', { hasText: 'Basit Sandık' })).toHaveCount(2);
});

test('ikon önizlemesi çıkar, elle kırpma ikonu değiştirir, listede ve toplamda ikon görünür', async ({ page }) => {
  await page.goto('/');
  await scanSample(page);
  const icon = page.getByAltText('Tahta ikonu');
  await expect(icon).toBeVisible();
  const before = await icon.getAttribute('src');
  expect(before).toMatch(/^data:image\/png;base64,/);

  await page.getByRole('button', { name: 'İkonu düzenle' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'İkonu kırp' });
  await expect(dialog).toBeVisible();
  const frame = dialog.getByTestId('crop-frame');
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: 'Uygula' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.getByAltText('Tahta ikonu').getAttribute('src')).not.toBe(before);

  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building .slot-icon').first()).toBeVisible();
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expect(page.getByTestId('total-row').first().locator('.slot-icon')).toBeVisible();
  const materials = (await stateOf(page)).materials as { icon?: string }[];
  expect(materials.every((m) => m.icon?.startsWith('data:image/png;base64,'))).toBe(true);
});

test('bozuk kutu ikonsuz devam ettirir; tarama çalışır', async ({ page }) => {
  await page.goto('/');
  current = {
    area: 'Bahçe',
    buildings: [
      {
        name: 'A',
        requirements: [{ materialId: null, suggestedName: 'Tahta', description: 'p', amount: 2, box: { x: 'a', y: -1, w: 0, h: 9 } }],
      },
    ],
  };
  await scanSample(page, 1);
  await expect(page.getByAltText('Tahta ikonu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building')).toHaveCount(1);
});

test('tüm yapılar malzemesizse "Yapı bulunamadı" gösterilir', async ({ page }) => {
  await page.goto('/');
  current = { area: 'Bahçe', buildings: [{ name: 'Bahçe Tarhı', requirements: [] }] };
  await pickSample(page);
  await expect(page.getByText('Yapı bulunamadı, daha net çek.')).toBeVisible();
  await expect(page.getByTestId('review-building')).toHaveCount(0);
});

test('malzemesiz yapı atlanır ve not gösterilir', async ({ page }) => {
  await page.goto('/');
  current = {
    area: 'Bahçe',
    buildings: [{ name: 'Bahçe Tarhı', requirements: [] }, { name: 'Basit Sandık', requirements: [TAHTA(4)] }],
  };
  await scanSample(page, 1);
  await expect(page.getByText('1 malzemesiz yapı atlandı.')).toBeVisible();
});

test('alan okunamazsa onay kapalı, doldurunca açılır', async ({ page }) => {
  await page.goto('/');
  current = { area: null, buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(4)] }] };
  await scanSample(page, 1);
  await expect(page.getByRole('button', { name: 'Listeye ekle' })).toBeDisabled();
  await page.getByLabel('Alan', { exact: true }).fill('Avlu');
  await expect(page.getByRole('button', { name: 'Listeye ekle' })).toBeEnabled();
});

test('v1 verisi Genel alanına taşınır; ikonsuz malzeme için ikon önerisi kabul edilir', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('gk2c.state')) {
      localStorage.setItem(
        'gk2c.state',
        JSON.stringify({
          version: 1,
          materials: [{ id: 'm1', name: 'Tahta', description: 'plank' }],
          buildings: [{ id: 'b1', name: 'Eski Yapı', qty: 1, built: false, requirements: [{ materialId: 'm1', amount: 3 }] }],
        }),
      );
    }
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Genel' })).toBeVisible();
  await expect(page.locator('article.building', { hasText: 'Eski Yapı' })).toHaveCount(1);

  current = { area: 'Bahçe', buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(4)] }] };
  await scanSample(page, 1);
  const fills = page.getByTestId('icon-fills');
  await expect(fills).toBeVisible();
  await expect(fills.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Listeye ekle' }).click();

  const state = await stateOf(page);
  expect(state.version).toBe(2);
  expect(state.materials).toHaveLength(1);
  expect(state.materials[0].icon).toMatch(/^data:image\/png;base64,/);
  expect(state.buildings.find((b: { name: string }) => b.name === 'Eski Yapı').area).toBe('Genel');
  expect(state.buildings.find((b: { name: string }) => b.name === 'Basit Sandık').area).toBe('Bahçe');
});

test('geçersiz ikonlu kayıt bozuk sayılır ve uygulama açılır', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'gk2c.state',
      JSON.stringify({ version: 2, materials: [{ id: 'm1', name: 'T', description: '', icon: 'javascript:alert(1)' }], buildings: [] }),
    );
  });
  await page.goto('/');
  await expect(page.getByText('Kayıtlı veri okunamadı')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'GK2 Companion' })).toBeVisible();
});

test('v1 göçünden kalan Genel yapısı, aynı adlı yapı taranınca alana taşınır (toplam iki katına çıkmaz)', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('gk2c.state')) {
      localStorage.setItem(
        'gk2c.state',
        JSON.stringify({
          version: 1,
          materials: [{ id: 'm1', name: 'Tahta', description: 'plank' }],
          buildings: [{ id: 'b1', name: 'Basit Sandık', qty: 2, built: false, requirements: [{ materialId: 'm1', amount: 4 }] }],
        }),
      );
    }
  });
  await page.goto('/');
  current = { area: 'Bahçe', buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(4)] }] };
  await scanSample(page, 1);
  await expect(page.getByText('Mevcut kayıt güncellenecek')).toHaveCount(1);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();

  await expect(page.locator('article.building')).toHaveCount(1);
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expectTotal(page, 'Tahta', 8);
  const state = await stateOf(page);
  expect(state.buildings).toHaveLength(1);
  expect(state.buildings[0]).toMatchObject({ id: 'b1', area: 'Bahçe', qty: 2 });
});

test('satırı başka malzemeye çevirince eski malzemeye yanlış ikon yazılmaz', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('gk2c.state')) {
      localStorage.setItem(
        'gk2c.state',
        JSON.stringify({
          version: 2,
          materials: [
            { id: 'm1', name: 'Tahta', description: 'plank' },
            { id: 'm2', name: 'Kereste', description: 'log' },
          ],
          buildings: [],
        }),
      );
    }
  });
  await page.goto('/');
  current = { area: 'Bahçe', buildings: [{ name: 'A', requirements: [{ materialId: 'm1', suggestedName: null, description: null, amount: 2, box: BOX }] }] };
  await scanSample(page, 1);
  await expect(page.getByTestId('icon-fills')).toBeVisible();
  await page.getByTestId('review-building').first().getByLabel('Malzeme', { exact: true }).selectOption({ label: 'Kereste' });
  await expect(page.getByTestId('icon-fills')).toHaveCount(0);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  const materials = (await stateOf(page)).materials as { id: string; icon?: string }[];
  expect(materials.every((m) => m.icon === undefined)).toBe(true);
});
