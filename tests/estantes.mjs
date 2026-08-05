import { chromium } from 'playwright';

import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

let manifesto = {
  titulo: 'Catálogos WE',
  catalogos: [
    { arquivo: 'catalogo-exemplo.pdf', titulo: 'Catálogo de Exemplo', adicionadoEm: '2026-07-30' },
    { arquivo: 'flyer-lupulos.pdf', titulo: 'Flyer Lúpulos', adicionadoEm: '2026-07-31' },
  ],
};
const commits = [];
let manifestoPendente = null;
let refSha = 'aaa';

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
const respostas = [];
page.on('dialog', (d) => {
  const r = respostas.shift() || { aceitar: true };
  if (r.aceitar) d.accept(r.texto); else d.dismiss();
});

// diálogo temático: preenche o campo (se houver) e confirma
async function responderDialogo(texto) {
  await page.waitForSelector('#dialogo-app[open]');
  if (texto !== undefined) await page.fill('#dialogo-app-campo-0', texto);
  await page.click('#dialogo-app-confirmar');
}

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

await page.goto(`${BASE}/estantes.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('estante-chave-github', 'github_pat_teste_ok'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// 1. Lista com a principal
const linhasInicio = await page.locator('.linha-estante').count();
const seloPrincipal = await page.locator('.linha-estante .selo-plano').first().textContent();

// 2. Nova estante via diálogo temático
await page.click('#btn-nova-estante');
await responderDialogo('Lúpulos 2026');
await page.waitForTimeout(800);
const linhasDepois = await page.locator('.linha-estante').count();
const idCriado = (manifesto.estantes || [])[0]?.id;
await page.screenshot({ path: `${CAPTURAS}/estantes-dashboard.png` });

// 3. Adicionar flipbooks à nova estante (dialog checklist)
await page.locator('.linha-estante').nth(1).locator('button:has-text("Adicionar flipbooks")').click();
await page.waitForTimeout(300);
await page.locator('#opcoes-catalogos input[data-arquivo="flyer-lupulos.pdf"]').check();
await page.click('#catalogos-salvar');
await page.waitForTimeout(800);
const flyerNaEstante = manifesto.catalogos.find((c) => c.arquivo === 'flyer-lupulos.pdf').estante;

// 3b. Personalizar: cores próprias da estante
await page.locator('.linha-estante').nth(1).locator('button:has-text("Personalizar")').click();
await page.waitForSelector('#dialogo-personalizar[open]');
await page.fill('#personalizar-descricao', 'Safra 2026');
await page.fill('#personalizar-cor-hex', '#f59e0b');
await page.locator('#personalizar-cor-hex').dispatchEvent('input');
await page.fill('#personalizar-cor-fundo', '#1c1005');
await page.locator('#personalizar-capa-arquivo').setInputFiles(`${RECURSOS}/capa-estante.png`);
await page.waitForTimeout(300);
await page.click('#personalizar-salvar');
await page.waitForTimeout(800);
const estantePersonalizada = (manifesto.estantes || [])[0];

// 4. Estante pública filtrada (?e=) — e a principal sem o flyer
await page.goto(`${BASE}/estante.html?e=${idCriado}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const tituloEstanteNova = (await page.locator('#titulo-estante').textContent()).trim();
const cartoesNaNova = await page.locator('.cartao').count();
const prateleiras = await page.locator('.prateleira').count();
const fundoAplicado = await page.evaluate(() => document.documentElement.style.getPropertyValue('--fundo').trim());
await page.screenshot({ path: `${CAPTURAS}/estante-prateleiras.png` });

await page.goto(`${BASE}/estante.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const cartoesNaPrincipal = await page.locator('.cartao').count();

// 5. Excluir a estante → catálogo volta à principal
await page.goto(`${BASE}/estantes.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.locator('.linha-estante').nth(1).locator('button:has-text("Excluir")').click();
await responderDialogo();
await page.waitForTimeout(800);
const linhasFinal = await page.locator('.linha-estante').count();
const flyerVoltou = manifesto.catalogos.find((c) => c.arquivo === 'flyer-lupulos.pdf').estante === undefined;

// 6. Organizar: a principal (2 flipbooks) ganha o botão; setas reordenam
await page.locator('.linha-estante').first().locator('button:has-text("Organizar")').click();
await page.waitForSelector('#dialogo-ordenar[open]');
const ordemInicial = await page.locator('#lista-ordenar strong').allTextContents();
const setaCimaPrimeiro = await page.locator('#lista-ordenar .item-ordenar').first().locator('.setas-ordenar button').first().isDisabled();
await page.screenshot({ path: `${CAPTURAS}/dialogo-ordenar.png` });
// sobe o segundo item (Catálogo de Exemplo) para o topo
await page.locator('#lista-ordenar .item-ordenar').nth(1).locator('button[title="Mover para cima"]').click();
const ordemDepois = await page.locator('#lista-ordenar strong').allTextContents();
await page.click('#ordenar-salvar');
await page.waitForTimeout(800);
const ordensSalvas = manifesto.catalogos.map((c) => [c.arquivo, c.ordem]);

// 7. Estante pública segue a nova sequência
await page.goto(`${BASE}/estante.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const titulosPublicos = await page.locator('.cartao').allInnerTexts();

concluir({
  linhasInicio, seloPrincipal, linhasDepois, idCriado, flyerNaEstante,
  tituloEstanteNova, cartoesNaNova, prateleiras, fundoAplicado, estantePersonalizada, cartoesNaPrincipal,
  linhasFinal, flyerVoltou, ordemInicial, setaCimaPrimeiro, ordemDepois, ordensSalvas,
  titulosPublicos: titulosPublicos.map((t) => t.split('\n')[0]),
  commits, erros,
}, erros);
await browser.close();
