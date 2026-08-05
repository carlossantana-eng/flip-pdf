import { chromium } from 'playwright';

import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

let manifesto = {
  titulo: 'Catálogos',
  descricao: 'Folheie nossos catálogos.',
  perfil: { nome: 'WE Consultoria' },
  identidade: { cor: '#c05621' },
  catalogos: [{ arquivo: 'catalogo-exemplo.pdf', titulo: 'Catálogo de Exemplo', adicionadoEm: '2026-07-31' }],
};
const commits = [];
let manifestoPendente = null;
let refSha = 'aaa';

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
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

// 1. Sem chave → aviso
await page.goto(`${BASE}/configuracoes.html`, { waitUntil: 'networkidle' });
const semChave = await page.locator('#sem-chave').isVisible();

// 2. Com chave → formulário preenchido
await page.evaluate(() => localStorage.setItem('estante-chave-github', 'github_pat_teste_ok'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const titulo = await page.locator('#campo-titulo-estante').inputValue();
const nome = await page.locator('#campo-nome-painel').inputValue();
const menuAtivo = (await page.locator('.admin-menu a[aria-current="page"]').textContent()).trim();
await page.screenshot({ path: `${CAPTURAS}/configuracoes.png`, fullPage: true });

// 3. Editar e salvar
await page.fill('#campo-titulo-estante', 'Catálogos WE 2026');
await page.fill('#campo-descricao-estante', 'Nova descrição.');
await page.click('#btn-salvar-estante');
await page.waitForTimeout(900);
const tituloSalvo = manifesto.titulo;
const descricaoSalva = manifesto.descricao;
const semCoresNaConfig = await page.evaluate(() => document.getElementById('campo-cor') === null);
const identidadePreservada = manifesto.identidade;

console.log(JSON.stringify({ semChave, titulo, nome, menuAtivo, tituloSalvo, descricaoSalva, semCoresNaConfig, identidadePreservada, commits, erros }));
await browser.close();
