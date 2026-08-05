// Gera sitemap.xml e robots.txt no build de publicação.
//
// O sitemap lista as páginas públicas de conteúdo (site, estantes e
// leitores); as páginas do painel ficam de fora (todas têm noindex) e o
// robots.txt reforça isso. Ambos são artefatos de build: não são
// commitados. O sitemap exige URLs absolutas, então só é gerado quando o
// endereço público é conhecido (CNAME ou GITHUB_REPOSITORY).
//
// Sem dependências. Uso: node scripts/gerar-sitemap.mjs

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function urlBase() {
  const cname = join(raiz, 'CNAME');
  if (existsSync(cname)) {
    const dominio = readFileSync(cname, 'utf8').trim();
    if (dominio) return `https://${dominio}/`;
  }
  const [dono, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  if (dono && repo) return `https://${dono.toLowerCase()}.github.io/${repo}/`;
  return '';
}

function escaparXml(texto) {
  return String(texto)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

const PAGINAS_DO_PAINEL = [
  'admin.html', 'publicar.html', 'arquivos.html', 'estantes.html',
  'configuracoes.html', 'editor.html',
];

function gerar() {
  const manifesto = JSON.parse(readFileSync(join(raiz, 'catalogos.json'), 'utf8'));
  const base = urlBase();
  const hoje = new Date().toISOString().slice(0, 10);

  const robots = [
    'User-agent: *',
    ...PAGINAS_DO_PAINEL.map((pagina) => `Disallow: /${pagina}`),
    'Allow: /',
    ...(base ? [`Sitemap: ${base}sitemap.xml`] : []),
    '',
  ].join('\n');
  writeFileSync(join(raiz, 'robots.txt'), robots);

  if (!base) {
    console.log('robots.txt gerado; sitemap pulado (endereço público desconhecido).');
    return;
  }

  const entradas = [
    { caminho: '', lastmod: hoje },
    { caminho: 'como-funciona.html', lastmod: hoje },
    { caminho: 'precos.html', lastmod: hoje },
    { caminho: 'estante.html', lastmod: hoje },
    ...(manifesto.estantes || []).map((estante) => ({
      caminho: `estante.html?e=${encodeURIComponent(estante.id)}`,
      lastmod: estante.criadaEm || hoje,
    })),
    ...(manifesto.catalogos || []).filter((c) => !c.lixeira).map((catalogo) => ({
      caminho: `leitor.html?c=${encodeURIComponent(catalogo.arquivo)}`,
      lastmod: catalogo.adicionadoEm || hoje,
    })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entradas.map(({ caminho, lastmod }) => (
      `  <url><loc>${escaparXml(base + caminho)}</loc><lastmod>${lastmod}</lastmod></url>`
    )),
    '</urlset>',
    '',
  ].join('\n');
  writeFileSync(join(raiz, 'sitemap.xml'), xml);
  console.log(`sitemap.xml com ${entradas.length} URL(s) e robots.txt gerados (base: ${base}).`);
}

gerar();
