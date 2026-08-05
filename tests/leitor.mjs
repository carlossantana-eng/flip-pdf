import { chromium } from 'playwright';
import { BASE, CAPTURAS, OPCOES_NAVEGADOR, concluir } from './apoio.mjs';

// Estante pública + leitor, em desktop e celular, com manifesto fixo
// (independente do catalogos.json real do repositório).
const manifesto = {
  titulo: 'Catálogos de Teste',
  descricao: 'Estante da suíte de testes.',
  catalogos: [
    { arquivo: 'catalogo-exemplo.pdf', titulo: 'Catálogo de Exemplo', adicionadoEm: '2026-07-31' },
  ],
};

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const falhas = [];
const errosTotais = [];

async function testar(nome, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
  await page.route(`${BASE}/catalogos.json*`, (rota) => rota.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(manifesto),
  }));

  // Estante
  await page.goto(`${BASE}/estante.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${CAPTURAS}/estante-${nome}.png` });
  const cartoes = await page.locator('.cartao').count();
  const meta = await page.locator('.cartao .meta').first().textContent();

  // Leitor
  await page.goto(`${BASE}/leitor.html?c=catalogo-exemplo.pdf`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const indicador1 = await page.locator('#indicador').textContent();

  // Virar página
  await page.click('#btn-proximo');
  await page.waitForTimeout(1400);
  const indicador2 = await page.locator('#indicador').textContent();
  const hash = await page.evaluate(() => location.hash);

  // Lupa
  await page.click('#btn-ampliar');
  await page.waitForTimeout(900);
  const lupaVisivel = await page.locator('#lupa').isVisible();
  await page.screenshot({ path: `${CAPTURAS}/lupa-${nome}.png` });
  await page.click('#lupa-fechar');

  // Deep link #p=4 (em aba "nova": força recarga)
  await page.goto('about:blank');
  await page.goto(`${BASE}/leitor.html?c=catalogo-exemplo.pdf#p=4`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const indicador4 = await page.locator('#indicador').textContent();
  await page.screenshot({ path: `${CAPTURAS}/leitor-${nome}-p4.png` });

  // Catálogo inexistente
  await page.goto(`${BASE}/leitor.html?c=nao-existe.pdf`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const erroVisivel = await page.locator('#erro').isVisible();

  const resultados = { nome, cartoes, meta, indicador1, indicador2, hash, lupaVisivel, indicador4, erroVisivel, erros };
  console.log(JSON.stringify(resultados, null, 1));
  if (cartoes !== 1) falhas.push(`${nome}: esperava 1 cartão, veio ${cartoes}`);
  if (!hash.includes('p=')) falhas.push(`${nome}: hash sem número de página (${hash})`);
  if (!lupaVisivel) falhas.push(`${nome}: lupa não abriu`);
  if (!indicador4.trim().startsWith('4')) falhas.push(`${nome}: deep link #p=4 abriu em "${indicador4}"`);
  if (!erroVisivel) falhas.push(`${nome}: catálogo inexistente não mostrou erro`);
  errosTotais.push(...erros);
  await ctx.close();
}

await testar('desktop', { width: 1280, height: 800 });
await testar('mobile', { width: 390, height: 780 });
await browser.close();
concluir({ suite: 'leitor', concluida: true }, errosTotais, falhas);
