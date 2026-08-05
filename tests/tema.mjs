import { chromium } from 'playwright';

import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

const manifesto = {
  titulo: 'Catálogos WE',
  pastas: ['Cervejaria'],
  estantes: [{ id: 'lupulos-2026', nome: 'Lúpulos 2026', criadaEm: '2026-07-31' }],
  catalogos: [
    { arquivo: 'catalogo-exemplo.pdf', titulo: 'Catálogo de Exemplo', adicionadoEm: '2026-07-30' },
    { arquivo: 'flyer.pdf', titulo: 'Flyer Lúpulos', adicionadoEm: '2026-07-31', pasta: 'Cervejaria' },
  ],
};
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));

await page.route('https://api.github.com/**', async (rota) => {
  const url = new URL(rota.request().url());
  const caminho = url.pathname.replace('/repos/carlossantana-eng/flip-pdf', '') || '/';
  if (url.pathname.endsWith('/')) return rota.abort('failed');
  const json = (c, s = 200) => rota.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(c) });
  if (caminho === '/contents/catalogos.json') return json({ content: b64(JSON.stringify(manifesto)) });
  if (caminho === '/actions/runs') return json({ workflow_runs: [] });
  return json({ message: `nao simulada ${caminho}` }, 500);
});
await page.route(`${BASE}/catalogos.json*`, (rota) => rota.fulfill({
  contentType: 'application/json', body: JSON.stringify(manifesto),
}));

// 1. home escuro (padrão) → alterna pelo botão → claro
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const temBotao = await page.locator('.btn-tema').count();
await page.screenshot({ path: `${CAPTURAS}/tema-home-escuro.png` });
await page.click('.btn-tema');
await page.waitForTimeout(300);
const dataTema = await page.evaluate(() => document.documentElement.dataset.tema);
const salvo = await page.evaluate(() => localStorage.getItem('plataforma-tema'));
await page.screenshot({ path: `${CAPTURAS}/tema-home-claro.png` });

// 2. preferência persiste entre páginas
await page.evaluate(() => localStorage.setItem('estante-chave-github', 'github_pat_teste_ok'));
await page.goto(`${BASE}/admin.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const persistiuAdmin = await page.evaluate(() => document.documentElement.dataset.tema);
await page.screenshot({ path: `${CAPTURAS}/tema-admin-claro.png` });

await page.goto(`${BASE}/arquivos.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${CAPTURAS}/tema-arquivos-claro.png` });

await page.goto(`${BASE}/estante.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${CAPTURAS}/tema-estante-claro.png` });

// editor claro (sem a seção de design, selects no tema)
await page.goto(`${BASE}/editor.html?c=catalogo-exemplo.pdf`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const designSumiu = await page.evaluate(() => document.getElementById('design-fundo') === null);
await page.screenshot({ path: `${CAPTURAS}/tema-editor-claro.png` });

// 3. volta ao escuro pelo botão
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.click('.btn-tema');
await page.waitForTimeout(200);
const voltouEscuro = await page.evaluate(() => document.documentElement.dataset.tema === undefined
  && localStorage.getItem('plataforma-tema') === null);

concluir({ temBotao, dataTema, salvo, persistiuAdmin, designSumiu, voltouEscuro, erros }, erros);
await browser.close();
