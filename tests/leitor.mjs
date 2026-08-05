import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, CAPTURAS, RECURSOS, OPCOES_NAVEGADOR, concluir } from './apoio.mjs';

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

// Busca por texto e links clicáveis, com um PDF de fixture que tem
// texto pesquisável e anotações de link (URI externa + GoTo interno).
async function testarBuscaELinks() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  await page.route(`${BASE}/catalogos.json*`, (rota) => rota.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      titulo: 'Testes',
      perfil: { whatsapp: '5551999990000' },
      catalogos: [{ arquivo: 'oferta-com-links.pdf', titulo: 'Oferta', adicionadoEm: '2026-08-01' }],
    }),
  }));
  await page.route(`${BASE}/catalogos/oferta-com-links.pdf`, (rota) => rota.fulfill({
    contentType: 'application/pdf',
    body: readFileSync(join(RECURSOS, 'oferta-com-links.pdf')),
  }));

  await page.goto(`${BASE}/leitor.html?c=oferta-com-links.pdf`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Links do PDF na capa: o URI externo vira <a> na camada
  const linkExterno = await page.locator('#camada-links a[href="https://example.com/oferta"]').count();
  const linksNaCapa = await page.locator('#camada-links .link-do-pdf').count();

  // Link interno (GoTo) leva à página 2
  await page.locator('#camada-links .link-do-pdf[title="Ir para outra página"]').click();
  await page.waitForTimeout(1200);
  const indicadorAposGoto = (await page.locator('#indicador').textContent()).trim();

  // Busca: "whatsapp" (sem acento, caixa baixa) deve achar a página 2
  await page.click('#btn-buscar');
  await page.fill('#busca-campo', 'whatsapp');
  await page.waitForTimeout(700);
  const resultados = await page.locator('#busca .busca-resultado').count();
  const primeiroResultado = resultados > 0
    ? (await page.locator('#busca .busca-resultado strong').first().textContent()).trim()
    : '';
  await page.screenshot({ path: `${CAPTURAS}/busca-leitor.png` });
  if (resultados > 0) {
    await page.locator('#busca .busca-resultado').first().click();
    await page.waitForTimeout(1000);
  }
  const buscaFechou = await page.locator('#busca').isHidden();

  // Sumário (outline do PDF): 2 itens; "Oferta da semana" volta à página 1
  const sumarioVisivel = await page.locator('#btn-sumario').isVisible();
  await page.click('#btn-sumario');
  const itensSumario = await page.locator('.item-sumario').allTextContents();
  await page.locator('.item-sumario', { hasText: 'Oferta da semana' }).click();
  await page.waitForTimeout(1200);
  const indicadorAposSumario = (await page.locator('#indicador').textContent()).trim();

  // WhatsApp no leitor (número vem do perfil do manifesto)
  const whatsappLeitor = await page.locator('#btn-whatsapp').getAttribute('href');
  const whatsappVisivel = await page.locator('#btn-whatsapp').isVisible();

  // WhatsApp flutuante na estante
  await page.goto(`${BASE}/estante.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const whatsappEstante = await page.locator('.botao-whatsapp').getAttribute('href');

  const resultado = {
    linkExterno, linksNaCapa, indicadorAposGoto, resultados, primeiroResultado, buscaFechou,
    sumarioVisivel, itensSumario, indicadorAposSumario, whatsappVisivel, whatsappLeitor, whatsappEstante, erros,
  };
  console.log(JSON.stringify(resultado, null, 1));
  if (linkExterno !== 1) falhas.push(`link externo: esperava 1, veio ${linkExterno}`);
  if (linksNaCapa !== 2) falhas.push(`links na capa: esperava 2, veio ${linksNaCapa}`);
  if (!indicadorAposGoto.startsWith('2')) falhas.push(`GoTo não levou à página 2 (${indicadorAposGoto})`);
  if (resultados < 1) falhas.push('busca não encontrou "whatsapp"');
  if (primeiroResultado && primeiroResultado !== 'Página 2') falhas.push(`resultado apontou ${primeiroResultado}`);
  if (!buscaFechou) falhas.push('painel de busca não fechou ao clicar no resultado');
  if (!sumarioVisivel) falhas.push('botão de sumário não apareceu');
  if (itensSumario.length !== 2) falhas.push(`sumário com ${itensSumario.length} item(ns), esperava 2`);
  if (!indicadorAposSumario.startsWith('1')) falhas.push(`sumário não voltou à página 1 (${indicadorAposSumario})`);
  if (!whatsappVisivel || !whatsappLeitor || !whatsappLeitor.includes('wa.me/5551999990000')) {
    falhas.push(`WhatsApp do leitor errado (${whatsappLeitor})`);
  }
  if (!whatsappEstante || !whatsappEstante.includes('wa.me/5551999990000')) {
    falhas.push(`WhatsApp da estante errado (${whatsappEstante})`);
  }
  errosTotais.push(...erros);
  await ctx.close();
}

await testarBuscaELinks();
await browser.close();
concluir({ suite: 'leitor', concluida: true }, errosTotais, falhas);
