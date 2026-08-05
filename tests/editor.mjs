import { chromium } from 'playwright';

import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

let manifesto = {
  titulo: 'Catálogos',
  pastas: ['Material de Divulgação'],
  catalogos: [
    { arquivo: 'catalogo-exemplo.pdf', titulo: 'Catálogo de Exemplo', adicionadoEm: '2026-07-31', descricao: 'Demo' },
  ],
};
const commits = [];
let manifestoPendente = null;
let refSha = 'aaa';

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('dialog', (d) => d.accept());

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
await page.route('https://api.github.com/**', async (rota) => {
  const req = rota.request();
  const url = new URL(rota.request().url());
  const caminho = url.pathname.replace('/repos/carlossantana-eng/flip-pdf', '') || '/';
  const metodo = req.method();
  if (url.pathname.endsWith('/')) return rota.abort('failed');
  const json = (c, s = 200) => rota.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(c) });
  if (caminho === '/contents/catalogos.json') return json({ content: b64(JSON.stringify(manifesto)) });
  if (caminho === '/git/ref/heads/main') return json({ object: { sha: refSha } });
  if (caminho.startsWith('/git/commits/') && metodo === 'GET') return json({ tree: { sha: 't0' } });
  if (caminho === '/git/blobs') {
    try {
      const dados = JSON.parse(Buffer.from(req.postDataJSON().content, 'base64').toString('utf8'));
      if (dados && dados.catalogos) manifestoPendente = dados;
    } catch { /* binário */ }
    return json({ sha: 'b1' }, 201);
  }
  if (caminho === '/git/trees') return json({ sha: 't1' }, 201);
  if (caminho === '/git/commits' && metodo === 'POST') { commits.push(req.postDataJSON().message); return json({ sha: `c${commits.length}` }, 201); }
  if (caminho === '/git/refs/heads/main' && metodo === 'PATCH') {
    refSha = req.postDataJSON().sha;
    if (manifestoPendente) { manifesto = manifestoPendente; manifestoPendente = null; }
    return json({ object: { sha: refSha } });
  }
  if (caminho === '/actions/runs') return json({ workflow_runs: [] });
  return json({ message: `nao simulada ${metodo} ${caminho}` }, 500);
});

// intercepta também o catalogos.json público (estante.html usa fetch relativo)
await page.route(`${BASE}/catalogos.json*`, (rota) => rota.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(manifesto),
}));

// 1. Estante SEM chave → sem lápis
await page.goto(`${BASE}/estante.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const lapisSemChave = await page.locator('.botao-editar-capa').count();

// 2. Com chave → lápis aparece e leva ao editor
await page.evaluate(() => localStorage.setItem('estante-chave-github', 'github_pat_teste_ok'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const lapisComChave = await page.locator('.botao-editar-capa').count();
await page.screenshot({ path: `${CAPTURAS}/estante-lapis.png` });
await page.locator('.botao-editar-capa').first().click();
await page.waitForURL('**/editor.html?c=catalogo-exemplo.pdf**');
await page.waitForSelector('#editor:not([hidden])');
await page.waitForTimeout(2500);

// 3. Campos preenchidos + prévia carregada
const tituloPreenchido = await page.locator('#campo-titulo').inputValue();
const previaCarregada = await page.locator('#previa').evaluate((f) => Boolean(f.contentDocument && f.contentDocument.getElementById('livro')));
await page.screenshot({ path: `${CAPTURAS}/editor.png`, fullPage: false });

// 4. Edita e salva (a personalização do leitor foi removida do produto)
await page.fill('#campo-titulo', 'Catálogo Editado 2026');
await page.uncheck('#campo-download');
const semCampoPasta = await page.evaluate(() => document.getElementById('campo-pasta') === null);
const semDesign = await page.evaluate(() => document.getElementById('design-fundo') === null);
await page.click('#btn-salvar');
await page.waitForTimeout(900);
const entrada = manifesto.catalogos[0];

// 5. Copiar link
await page.click('#btn-copiar-link');
await page.waitForTimeout(300);

// 6. Lixeira (diálogo temático) → redireciona para arquivos
await page.click('#btn-lixeira');
await page.waitForSelector('#dialogo-app[open]');
await page.click('#dialogo-app-confirmar');
await page.waitForURL('**/arquivos.html', { timeout: 8000 });
const naLixeira = manifesto.catalogos[0].lixeira === true;


concluir({ lapisSemChave, lapisComChave, tituloPreenchido, previaCarregada, semDesign, semCampoPasta, entrada, naLixeira, commits, erros }, erros);
await browser.close();
