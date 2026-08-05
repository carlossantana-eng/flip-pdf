import { chromium } from 'playwright';

import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

pdfDeTeste('Novo_Catalogo-2026.pdf');

// Estado simulado do "GitHub"
const manifesto = {
  titulo: 'Catálogos',
  descricao: 'Folheie nossos catálogos.',
  catalogos: [
    { arquivo: 'catalogo-exemplo.pdf', titulo: 'Catálogo de Exemplo', adicionadoEm: '2026-07-31' },
  ],
};
const commits = [];
let refSha = 'aaa111';

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const erros = [];
const dialogos = [];
page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => { dialogos.push(d.message().split('\n')[0]); d.accept(); });

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

await page.route('https://api.github.com/**', async (rota) => {
  const req = rota.request();
  const url = new URL(req.url());
  const caminho = url.pathname.replace('/repos/carlossantana-eng/flip-pdf', '') || '/';
  const metodo = req.method();
  // Como o GitHub real: barra final é caminho inválido (e sem CORS → Failed to fetch).
  if (url.pathname.endsWith('/')) return rota.abort('failed');
  const json = (corpo, status = 200) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });

  if (caminho === '/' || caminho === '') {
    const auth = req.headers()['authorization'] || '';
    if (!auth.includes('github_pat_teste_ok')) return json({ message: 'Bad credentials' }, 401);
    return json({ permissions: { push: true } });
  }
  if (caminho === '/contents/catalogos.json') {
    return json({ content: b64(JSON.stringify(manifesto, null, 2) + '\n') });
  }
  if (caminho === '/git/ref/heads/main') return json({ object: { sha: refSha } });
  if (caminho.startsWith('/git/commits/') && metodo === 'GET') return json({ tree: { sha: 'tree000' } });
  if (caminho === '/git/blobs') return json({ sha: `blob${commits.length}` }, 201);
  if (caminho === '/git/trees') return json({ sha: 'tree111' }, 201);
  if (caminho === '/git/commits' && metodo === 'POST') {
    const corpo = req.postDataJSON();
    commits.push(corpo.message);
    return json({ sha: `commit${commits.length}` }, 201);
  }
  if (caminho === '/git/refs/heads/main' && metodo === 'PATCH') {
    refSha = req.postDataJSON().sha;
    return json({ object: { sha: refSha } });
  }
  if (caminho === '/actions/runs') {
    return json({ workflow_runs: [
      { status: 'completed', conclusion: 'success', head_sha: refSha, updated_at: '2026-07-31T13:30:00Z', html_url: 'https://github.com/x/runs/2' },
      { status: 'completed', conclusion: 'failure', head_sha: 'zzz', updated_at: '2026-07-31T13:10:00Z', html_url: 'https://github.com/x/runs/1' },
    ] });
  }
  return json({ message: `rota nao simulada: ${metodo} ${caminho}` }, 500);
});

// 1. Tela de token aparece sem chave salva
await page.goto(`${BASE}/admin.html`, { waitUntil: 'networkidle' });
const telaTokenVisivel = await page.locator('#tela-token').isVisible();
await page.screenshot({ path: `${CAPTURAS}/admin-token.png` });

// 2. Chave errada → mensagem de erro clara
await page.fill('#campo-token', 'github_pat_errada');
await page.click('#btn-conectar');
await page.waitForTimeout(500);
const erroChave = (await page.locator('#erro-token').textContent()).trim();

// 3. Chave certa → tela de gestão
await page.fill('#campo-token', 'github_pat_teste_ok');
await page.click('#btn-conectar');
await page.waitForSelector('#tela-gestao:not([hidden])');
await page.waitForTimeout(700);

// 3b. Cadastro aparece (manifesto sem perfil); concluir salva o perfil
const cadastroVisivel = await page.locator('#cartao-cadastro').isVisible();
await page.fill('#cadastro-nome', 'WE Consultoria');
await page.fill('#cadastro-email', 'comercial@weconsultoria.com.br');
await page.click('#btn-concluir-cadastro');
await page.waitForTimeout(700);
const cadastroSumiu = await page.locator('#cartao-cadastro').isHidden();
const saudacaoNome = (await page.locator('#saudacao-titulo').textContent()).trim();
const avatarIniciais = (await page.locator('#btn-conta').textContent()).trim();

// 3c. Sino de notificações: 2 não lidas; abrir zera o selo
const seloAntes = (await page.locator('#sino-selo').textContent()).trim();
await page.click('#btn-notificacoes');
await page.waitForTimeout(500);
const painelNotif = await page.locator('#painel-notificacoes').isVisible();
const qtdNotificacoes = await page.locator('#lista-notificacoes li').count();
const seloSumiu = await page.locator('#sino-selo').isHidden();
await page.screenshot({ path: `${CAPTURAS}/admin-notificacoes.png` });
await page.click('#saudacao-titulo');
await page.waitForTimeout(300);
const painelFechou = await page.locator('#painel-notificacoes').isHidden();

const resumo = (await page.locator('#resumo-catalogos').textContent()).trim();
const status = (await page.locator('#status-publicacao').textContent()).trim();
const qtdCartoesAcao = await page.locator('.cartao-acao').count();
const semLista = await page.evaluate(() => document.getElementById('lista-catalogos') === null);
const semEnvioRapido = await page.evaluate(() => document.getElementById('zona-envio') === null);
const menuVisivel = await page.locator('.admin-menu').isVisible();
const menuConfig = await page.locator('.admin-menu a[href="configuracoes.html"]').count();
await page.screenshot({ path: `${CAPTURAS}/admin-painel.png`, fullPage: true });

// 7. Recarregar com token salvo → entra direto
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const entrouDireto = await page.locator('#tela-gestao').isVisible();

// 8. Menu da conta abre; Terminar sessão limpa a chave
await page.click('#btn-conta');
await page.waitForTimeout(300);
const menuContaVisivel = await page.locator('#conta-menu').isVisible();
const contaNome = (await page.locator('#conta-nome').textContent()).trim();
await page.screenshot({ path: `${CAPTURAS}/admin-conta.png` });
await page.click('#btn-sair');
await page.waitForTimeout(300);
const voltouTelaToken = await page.locator('#tela-token').isVisible();
const chaveLimpa = await page.evaluate(() => localStorage.getItem('estante-chave-github'));

concluir({
  telaTokenVisivel, erroChave, resumo, status, qtdCartoesAcao, semLista, semEnvioRapido, menuVisivel, menuConfig,
  cadastroVisivel, cadastroSumiu, saudacaoNome, avatarIniciais, menuContaVisivel, contaNome,
  seloAntes, painelNotif, qtdNotificacoes, seloSumiu, painelFechou,
  commits, entrouDireto, voltouTelaToken, chaveLimpa, erros,
}, erros);
await browser.close();
