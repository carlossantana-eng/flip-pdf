import { chromium } from 'playwright';

import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

// Estado simulado, MUTÁVEL: os commits do app atualizam o manifesto do mock.
let manifesto = {
  titulo: 'Catálogos',
  pastas: ['Material de Divulgação'],
  catalogos: [
    { arquivo: 'catalogo-exemplo.pdf', titulo: 'Catálogo de Exemplo', adicionadoEm: '2026-07-30' },
    { arquivo: 'tabela-precos.pdf', titulo: 'Tabela de Preços', adicionadoEm: '2026-07-29', pasta: 'Material de Divulgação' },
    { arquivo: 'flyer-lupulos.pdf', titulo: 'Flyer Lúpulos', adicionadoEm: '2026-07-31' },
  ],
};
const commits = [];
const exclusoes = [];
let manifestoPendente = null;
let refSha = 'aaa111';

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));

// Fila de respostas para prompt/confirm nativos
const respostas = [];
page.on('dialog', (d) => {
  const r = respostas.shift() || { aceitar: true };
  if (r.aceitar) d.accept(r.texto);
  else d.dismiss();
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
  const json = (corpo, status = 200) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });

  if (caminho === '/contents/catalogos.json') {
    return json({ content: b64(JSON.stringify(manifesto, null, 2) + '\n') });
  }
  if (caminho === '/git/ref/heads/main') return json({ object: { sha: refSha } });
  if (caminho.startsWith('/git/commits/') && metodo === 'GET') return json({ tree: { sha: 'tree000' } });
  if (caminho === '/git/blobs') {
    try {
      const texto = Buffer.from(req.postDataJSON().content, 'base64').toString('utf8');
      const dados = JSON.parse(texto);
      if (dados && dados.catalogos) manifestoPendente = dados;
    } catch { /* não é o manifesto */ }
    return json({ sha: `blob${commits.length}` }, 201);
  }
  if (caminho === '/git/trees') {
    for (const item of req.postDataJSON().tree) {
      if (item.sha === null) exclusoes.push(item.path);
    }
    return json({ sha: 'tree111' }, 201);
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
  if (caminho === '/actions/runs') return json({ workflow_runs: [] });
  return json({ message: `rota nao simulada: ${metodo} ${caminho}` }, 500);
});

await page.goto(`${BASE}/arquivos.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('estante-chave-github', 'github_pat_teste_ok'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 1. Lateral: "Todas as pastas" (3) + 1 pasta; raiz mostra TODOS (3)
const qtdPastas = await page.locator('.pasta-item').count(); // inclui "Todas"
const contagemPasta = (await page.locator('.pasta-item .pasta-conta').first().textContent()).trim();
const naRaiz = await page.locator('.cartao-arquivo').count();
await page.screenshot({ path: `${CAPTURAS}/arquivos-raiz.png` });

// 2. Abrir a pasta pela lateral → 1 arquivo, trilha visível
await page.locator('.pasta-item:has-text("Material de Divulgação")').click();
await page.waitForTimeout(300);
const naPasta = await page.locator('.cartao-arquivo').count();
const trilha = (await page.locator('#pasta-atual').textContent()).trim();
await page.locator('.pasta-item:has-text("Todas as pastas")').click();
await page.waitForTimeout(300);

// 3. Busca inclui itens dentro de pastas
await page.fill('#busca-arquivos', 'precos');
await page.waitForTimeout(300);
const buscaAchou = await page.locator('.cartao-arquivo').count();
await page.fill('#busca-arquivos', '');
await page.waitForTimeout(300);

// 4. Nova pasta via diálogo temático
await page.locator('#btn-nova-pasta').click();
await responderDialogo('Lançamentos');
await page.waitForTimeout(700);
const qtdPastas2 = await page.locator('.pasta-item').count();

// 5. Mover o 1º arquivo da raiz para "Material de Divulgação" (dialog customizado)
await page.locator('.cartao-arquivo button:has-text("Mover")').first().click();
await page.waitForTimeout(300);
await page.locator('.opcao-pasta:has-text("Material de Divulgação")').click();
await page.waitForTimeout(700);

// 6. Enviar um arquivo para a lixeira
await page.locator('.cartao-arquivo button:has-text("Lixeira")').first().click();
await page.waitForTimeout(700);
const seloLixeira = (await page.locator('#conta-lixeira').textContent()).trim();

// 7. Aba Lixeira: restaurar
await page.locator('#aba-lixeira').click();
await page.waitForTimeout(300);
const naLixeira = await page.locator('.cartao-arquivo').count();
await page.screenshot({ path: `${CAPTURAS}/arquivos-lixeira.png` });
await page.locator('.cartao-arquivo button:has-text("Restaurar")').first().click();
await page.waitForTimeout(700);
const lixeiraVaziaDepois = await page.locator('#vazio').isVisible();

// 8. Excluir definitivamente: manda de novo para a lixeira e exclui
await page.locator('#aba-arquivos').click();
await page.waitForTimeout(300);
await page.locator('.cartao-arquivo button:has-text("Lixeira")').first().click();
await page.waitForTimeout(700);
await page.locator('#aba-lixeira').click();
await page.waitForTimeout(300);
await page.locator('.cartao-arquivo button:has-text("Excluir")').first().click();
await responderDialogo();
await page.waitForTimeout(700);

concluir({
  qtdPastas, contagemPasta, naRaiz, naPasta, trilha, buscaAchou, qtdPastas2,
  seloLixeira, naLixeira, lixeiraVaziaDepois, exclusoes, commits, erros,
}, erros);
await browser.close();
