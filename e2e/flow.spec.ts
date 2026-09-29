import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = path.resolve('docs/samples/insa-menusu-1.png');

const req = (suggestedName: string, description: string) => (amount: number) => ({
  materialId: null,
  suggestedName,
  description,
  amount,
});
const TAHTA = req('Tahta', 'light brown plank');
const CIVI = req('Çivi', 'gold nails');
const KERESTE = req('Kereste', 'dark rough plank');
const TAS = req('Taş', 'grey stone block');

const SCAN = {
  buildings: [
    { name: 'Basit Sandık', requirements: [TAHTA(4), CIVI(4)] },
    { name: 'Kiliseyi Geliştir I', requirements: [KERESTE(8), TAS(6)] },
    { name: 'İç Mekân Bankı I', requirements: [TAHTA(2), CIVI(6)] },
    { name: 'Günah Çıkarma Kabini I', requirements: [TAHTA(6), CIVI(8)] },
    { name: 'Kilise Sunağı I', requirements: [TAHTA(4), CIVI(6), TAS(3)] },
  ],
};

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'POST',
};

test.beforeEach(async ({ page }) => {
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
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(SCAN) } }] }),
    });
  });
});

async function scanSample(page: Page) {
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'Devam' }).click();
  await expect(page.getByTestId('review-building')).toHaveCount(5);
}

async function expectTotal(page: Page, name: string, total: number) {
  await expect(page.getByTestId('total-row').filter({ hasText: name })).toContainText(String(total));
}

test('tara, incele, listele, adedi artır, tekrar tara, yenile', async ({ page }) => {
  await page.goto('/');

  // 1. tarama: 5 yeni yapı, 4 yeni malzeme (Çivi tek malzeme)
  await scanSample(page);
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

  // 2. tarama (aynı görsel): kopya açılmaz, adet korunur
  await page.getByRole('button', { name: 'Yapılar' }).click();
  await scanSample(page);
  await expect(page.getByText('Mevcut kayıt güncellenecek')).toHaveCount(5);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building')).toHaveCount(5);
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expectTotal(page, 'Tahta', 20);
  const materialCount = await page.evaluate(() => JSON.parse(localStorage.getItem('gk2c.state')!).materials.length);
  expect(materialCount).toBe(4);

  // yenileme: veri kalıcı
  await page.reload();
  await expect(page.locator('article.building')).toHaveCount(5);
});

test('malzemeyi yeniden adlandırma çakışmada reddedilir, geçerli isim kalır', async ({ page }) => {
  await page.goto('/');
  await scanSample(page);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await page.getByRole('button', { name: 'Toplam' }).click();

  await page.getByRole('button', { name: 'Tahta adını düzenle' }).click();
  await page.getByLabel('Malzeme adı').fill('ÇİVİ');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('başka bir malzemede kullanılıyor')).toBeVisible();

  await page.getByLabel('Malzeme adı').fill('Kalın Tahta');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expectTotal(page, 'Kalın Tahta', 16);
});

test('API anahtarı yokken tarama Ayarlar yönlendirmesi gösterir', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gk2c.settings', JSON.stringify({ apiKey: '', model: 'deepseek-flash' })));
  await page.goto('/');
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'Devam' }).click();
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
  const materialCount = await page.evaluate(() => JSON.parse(localStorage.getItem('gk2c.state')!).materials.length);
  expect(materialCount).toBe(5);
});
