import { chromium } from 'playwright';

import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

let manifesto = { titulo: 'Catálogos', pastas: ['Material de Divulgação'], catalogos: [] };
const commits = [];
const caminhosBlobs = [];
let manifestoPendente = null;
let refSha = 'aaa111';

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const page = await browser.newPage({ viewport: { width: 1200, height: 950 }, deviceScaleFactor: 2 });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('dialog', (d) => d.accept('Lançamentos'));

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

await page.route('https://api.github.com/**', async (rota) => {
  const req = rota.request();
  const url = new URL(req.url());
  const caminho = url.pathname.replace('/repos/carlossantana-eng/flip-pdf', '') || '/';
  const metodo = req.method();
  if (url.pathname.endsWith('/')) return rota.abort('failed');
  const json = (corpo, status = 200) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });

  if (caminho === '/contents/catalogos.json') return json({ content: b64(JSON.stringify(manifesto)) });
  if (caminho === '/git/ref/heads/main') return json({ object: { sha: refSha } });
  if (caminho.startsWith('/git/commits/') && metodo === 'GET') return json({ tree: { sha: 't0' } });
  if (caminho === '/git/blobs') {
    try {
      const texto = Buffer.from(req.postDataJSON().content, 'base64').toString('utf8');
      const dados = JSON.parse(texto);
      if (dados && dados.catalogos) manifestoPendente = dados;
    } catch { /* binário */ }
    return json({ sha: `b${caminhosBlobs.length}` }, 201);
  }
  if (caminho === '/git/trees') {
    for (const item of req.postDataJSON().tree) caminhosBlobs.push(item.path);
    return json({ sha: 't1' }, 201);
  }
  if (caminho === '/git/commits' && metodo === 'POST') {
    commits.push(req.postDataJSON().message);
    return json({ sha: `commit${commits.length}` }, 201);
  }
  if (caminho === '/git/refs/heads/main' && metodo === 'PATCH') {
    refSha = req.postDataJSON().sha;
    if (manifestoPendente) { manifesto = manifestoPendente; manifestoPendente = null; }
    return json({ object: { sha: refSha } });
  }
  if (caminho === '/actions/runs') {
    return json({ workflow_runs: [{ status: 'completed', conclusion: 'success', head_sha: refSha, updated_at: '2026-07-31T18:00:00Z', html_url: 'https://x' }] });
  }
  return json({ message: `nao simulada: ${metodo} ${caminho}` }, 500);
});

await page.goto(`${BASE}/publicar.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('estante-chave-github', 'github_pat_teste_ok'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Etapa 1 visível
const dropzoneVisivel = await page.locator('#zona-gigante').isVisible();
await page.screenshot({ path: `${CAPTURAS}/publicar-etapa1.png` });

// Seleciona 2 PDFs → etapa de configuração com capas locais
await page.locator('#campo-arquivo').setInputFiles([pdfDeTeste('catalogo-exemplo.pdf'), pdfDeTeste('lote-a.pdf')]);
await page.waitForSelector('#etapa-config:not([hidden])');
await page.waitForTimeout(1800);
const qtdCartoes = await page.locator('.cartao-publicacao').count();
const capasLocais = await page.locator('.publicacao-capa canvas').count();

// Edita título, escolhe pasta existente, desmarca download no 1º
const cartao1 = page.locator('.cartao-publicacao').first();
await cartao1.locator('input[type="text"]').first().fill('Catálogo Principal 2026');
await cartao1.locator('select').selectOption('Material de Divulgação');
await cartao1.locator('input[type="checkbox"]').uncheck();

// Capa personalizada no 1º
await cartao1.locator('input[type="file"]').setInputFiles(`${RECURSOS}/capa-teste.png`);
await page.waitForTimeout(400);
const previaCapa = await cartao1.locator('.publicacao-capa img').isVisible();
await page.screenshot({ path: `${CAPTURAS}/publicar-etapa2.png`, fullPage: true });

// Publicar agora → etapa de envio → sucesso
await page.click('#btn-publicar-agora');
await page.waitForSelector('#etapa-envio:not([hidden])');
const faseInicial = (await page.locator('#envio-fase').textContent()).trim();
await page.waitForSelector('#etapa-sucesso:not([hidden])', { timeout: 30000 });
const fichasSucesso = await page.locator('#fichas-sucesso .ficha-arquivo').count();
await page.screenshot({ path: `${CAPTURAS}/publicar-sucesso.png` });

const entrada1 = manifesto.catalogos.find((c) => c.arquivo === 'catalogo-exemplo.pdf');
const entrada2 = manifesto.catalogos.find((c) => c.arquivo === 'lote-a.pdf');

concluir({
  dropzoneVisivel, qtdCartoes, capasLocais, previaCapa, faseInicial, fichasSucesso,
  commits, caminhosBlobs,
  entrada1, entrada2, erros,
}, erros);
await browser.close();
