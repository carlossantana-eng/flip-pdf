import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

let manifesto = {
  titulo: 'Catálogos',
  catalogos: [{ arquivo: 'catalogo-exemplo.pdf', titulo: 'Catálogo de Exemplo', adicionadoEm: '2026-07-31' }],
};
const commits = [];
const caminhosBlobs = [];
let manifestoPendente = null;
let refSha = 'aaa';

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
await page.route('https://api.github.com/**', async (rota) => {
  const req = rota.request();
  const url = new URL(req.url());
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
    } catch { /* binário (mp3) */ }
    return json({ sha: 'b1' }, 201);
  }
  if (caminho === '/git/trees') {
    for (const item of req.postDataJSON().tree) caminhosBlobs.push(item.path);
    return json({ sha: 't1' }, 201);
  }
  if (caminho === '/git/commits' && metodo === 'POST') { commits.push(req.postDataJSON().message); return json({ sha: `c${commits.length}` }, 201); }
  if (caminho === '/git/refs/heads/main' && metodo === 'PATCH') {
    refSha = req.postDataJSON().sha;
    if (manifestoPendente) { manifesto = manifestoPendente; manifestoPendente = null; }
    return json({ object: { sha: refSha } });
  }
  if (caminho === '/actions/runs') return json({ workflow_runs: [] });
  return json({ message: `nao simulada ${metodo} ${caminho}` }, 500);
});
await page.route(`${BASE}/catalogos.json*`, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(manifesto) }));

// 1. leitor SEM música → botão oculto
await page.goto(`${BASE}/leitor.html?c=catalogo-exemplo.pdf`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const botaoOcultoSemMusica = await page.locator('#btn-musica').isHidden();

// 2. editor: envia o MP3 e salva
await page.goto(`${BASE}/editor.html?c=catalogo-exemplo.pdf`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('estante-chave-github', 'github_pat_teste_ok'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#editor:not([hidden])');
await page.locator('#campo-musica').setInputFiles(`${RECURSOS}/musica-teste.mp3`);
await page.waitForTimeout(300);
const estadoMusica = (await page.locator('#musica-estado').textContent()).trim();
await page.click('#btn-salvar');
await page.waitForTimeout(900);
const campoMusica = manifesto.catalogos[0].musica;
const blobMusica = caminhosBlobs.find((c) => c.includes('musicas/'));

// 3. leitor COM música → botão aparece (autoplay é bloqueado no headless; toca no 1º toque)
await page.route(`${BASE}/catalogos/musicas/**`, (r) => r.fulfill({ contentType: 'audio/mpeg', body: readFileSync(`${RECURSOS}/musica-teste.mp3`) }));
await page.goto(`${BASE}/leitor.html?c=catalogo-exemplo.pdf`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const botaoVisivelComMusica = await page.locator('#btn-musica').isVisible();
const somRemovido = await page.evaluate(() => document.getElementById('btn-som') === null);
await page.locator('.leitor-rodape').screenshot({ path: `${CAPTURAS}/leitor-musica.png` });

concluir({ botaoOcultoSemMusica, estadoMusica, campoMusica, blobMusica, botaoVisivelComMusica, somRemovido, commits, erros }, erros);
await browser.close();
