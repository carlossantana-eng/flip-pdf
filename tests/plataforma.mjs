import { chromium } from 'playwright';

import { BASE, RECURSOS, CAPTURAS, OPCOES_NAVEGADOR, pdfDeTeste, concluir } from './apoio.mjs';

const browser = await chromium.launch(OPCOES_NAVEGADOR);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));

// 1. Home carrega com CTAs de visitante
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
const ctaVisitante = await page.locator('.hero a[href="cadastro.html"]').isVisible();
await page.screenshot({ path: `${CAPTURAS}/plataforma-home.png`, fullPage: true });

// 2. Cadastro: senhas diferentes → erro; depois sucesso → painel
await page.goto(`${BASE}/cadastro.html`, { waitUntil: 'networkidle' });
await page.fill('#campo-nome', 'Maria Silva');
await page.fill('#campo-email', 'maria@exemplo.com');
await page.fill('#campo-senha', 'segredo1');
await page.fill('#campo-confirmar', 'diferente');
await page.click('#btn-cadastrar');
await page.waitForTimeout(300);
const erroSenhas = (await page.locator('#erro').textContent()).trim();
await page.fill('#campo-confirmar', 'segredo1');
await page.click('#btn-cadastrar');
await page.waitForURL('**/admin.html', { timeout: 5000 });
const caiuNoPainel = page.url().includes('admin.html');

// 3. Home logada mostra "Meu painel" e o nome
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const painelVisivel = await page.locator('.barra-acoes a[href="admin.html"]').isVisible();
const nomeNav = (await page.locator('#nav-usuario').textContent()).trim();
const entrarSumiu = await page.locator('.barra-acoes a[href="login.html"]').isHidden();
await page.screenshot({ path: `${CAPTURAS}/plataforma-home-logada.png` });

// 4. Sair → volta a visitante
await page.locator('.barra-acoes [data-sair]').click();
await page.waitForTimeout(400);
const voltouVisitante = await page.locator('.barra-acoes a[href="login.html"]').isVisible();

// 5. Login: senha errada → erro; certa → painel
await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle' });
await page.fill('#campo-email', 'maria@exemplo.com');
await page.fill('#campo-senha', 'errada');
await page.click('#btn-entrar');
await page.waitForTimeout(400);
const erroLogin = (await page.locator('#erro').textContent()).trim();
await page.fill('#campo-senha', 'segredo1');
await page.click('#btn-entrar');
await page.waitForURL('**/admin.html', { timeout: 5000 });
const loginOk = page.url().includes('admin.html');

// 6. Conta demo: contexto novo (localStorage limpo) → botão demo entra direto
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => erros.push('demo: ' + e.message));
await p2.goto(`${BASE}/login.html`, { waitUntil: 'networkidle' });
const notaDemo = (await p2.locator('.autenticacao-nota').first().textContent()).replace(/\s+/g, ' ').trim();
await p2.screenshot({ path: `${CAPTURAS}/login-conta-demo.png` });
await p2.click('#btn-demo');
await p2.waitForURL('**/admin.html', { timeout: 5000 });
const demoOk = p2.url().includes('admin.html');
await p2.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await p2.waitForTimeout(300);
const nomeDemo = (await p2.locator('#nav-usuario').textContent()).trim();
await ctx2.close();

// 7. Páginas de conteúdo carregam
await page.goto(`${BASE}/como-funciona.html`, { waitUntil: 'networkidle' });
const qtdFaq = await page.locator('.faq details').count();
await page.screenshot({ path: `${CAPTURAS}/plataforma-como-funciona.png` });
await page.goto(`${BASE}/precos.html`, { waitUntil: 'networkidle' });
const qtdPlanos = await page.locator('.plano').count();
await page.screenshot({ path: `${CAPTURAS}/plataforma-precos.png` });

concluir({
  ctaVisitante, erroSenhas, caiuNoPainel, painelVisivel, nomeNav, entrarSumiu,
  voltouVisitante, erroLogin, loginOk, notaDemo, demoOk, nomeDemo, qtdFaq, qtdPlanos, erros,
}, erros);
await browser.close();
