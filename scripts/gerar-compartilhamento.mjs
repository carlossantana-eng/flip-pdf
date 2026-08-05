// Gera as páginas de compartilhamento (f/ por flipbook, e/ por estante).
//
// O WhatsApp e as redes sociais não executam JavaScript: para o link
// compartilhado mostrar um cartão com capa e título, a URL precisa servir
// HTML estático com as meta tags Open Graph. Este script roda no workflow
// de publicação e emite, para cada flipbook e estante, uma página mínima
// com as tags certas e um redirecionamento imediato para o leitor/estante.
//
// As pastas f/ e e/ são artefatos de build: não são commitadas.
//
// Sem dependências. Uso: node scripts/gerar-compartilhamento.mjs

import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Endereço público do site: domínio próprio (CNAME) > GitHub Pages do repositório.
function urlBase() {
  const cname = join(raiz, 'CNAME');
  if (existsSync(cname)) {
    const dominio = readFileSync(cname, 'utf8').trim();
    if (dominio) return `https://${dominio}/`;
  }
  const repositorio = process.env.GITHUB_REPOSITORY || '';
  const [dono, repo] = repositorio.split('/');
  if (dono && repo) return `https://${dono.toLowerCase()}.github.io/${repo}/`;
  return '';
}

function escaparHtml(texto) {
  return String(texto)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// destinoRelativo é sempre um caminho dentro do site (ex.: ../leitor.html?c=x).
function paginaDeCompartilhamento({ titulo, descricao, imagem, urlPropria, destinoRelativo }) {
  const tags = [
    `<meta property="og:title" content="${escaparHtml(titulo)}">`,
    `<meta property="og:description" content="${escaparHtml(descricao)}">`,
    '<meta property="og:type" content="website">',
  ];
  if (urlPropria) tags.push(`<meta property="og:url" content="${escaparHtml(urlPropria)}">`);
  if (imagem) {
    tags.push(`<meta property="og:image" content="${escaparHtml(imagem)}">`);
    tags.push('<meta name="twitter:card" content="summary_large_image">');
  } else {
    tags.push('<meta name="twitter:card" content="summary">');
  }
  const destino = escaparHtml(destinoRelativo);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escaparHtml(titulo)}</title>
  ${tags.join('\n  ')}
  <meta http-equiv="refresh" content="0; url=${destino}">
  <script>location.replace(${JSON.stringify(destinoRelativo)} + location.hash);</script>
</head>
<body>
  <p><a href="${destino}">Abrir ${escaparHtml(titulo)}</a></p>
</body>
</html>
`;
}

function gerar() {
  const manifesto = JSON.parse(readFileSync(join(raiz, 'catalogos.json'), 'utf8'));
  const base = urlBase();
  const absoluta = (caminho) => (base && caminho ? base + caminho : '');
  const logo = (manifesto.identidade || {}).logo || '';
  const descricaoPadrao = manifesto.descricao || 'Folheie online, direto no navegador.';

  for (const pasta of ['f', 'e']) {
    rmSync(join(raiz, pasta), { recursive: true, force: true });
    mkdirSync(join(raiz, pasta));
  }

  let quantosF = 0;
  for (const catalogo of manifesto.catalogos || []) {
    if (catalogo.lixeira) continue;
    const slug = catalogo.arquivo.replace(/\.pdf$/i, '');
    writeFileSync(join(raiz, 'f', `${slug}.html`), paginaDeCompartilhamento({
      titulo: catalogo.titulo || slug,
      descricao: catalogo.descricao || descricaoPadrao,
      imagem: absoluta(catalogo.capa || logo),
      urlPropria: base ? `${base}f/${slug}.html` : '',
      destinoRelativo: `../leitor.html?c=${encodeURIComponent(catalogo.arquivo)}`,
    }));
    quantosF += 1;
  }

  const estantes = [
    {
      id: 'principal',
      nome: manifesto.titulo || 'Catálogos',
      descricao: manifesto.descricao,
      capa: (manifesto.identidade || {}).capa,
      destino: '../estante.html',
    },
    ...(manifesto.estantes || []).map((estante) => ({
      ...estante,
      destino: `../estante.html?e=${encodeURIComponent(estante.id)}`,
    })),
  ];
  for (const estante of estantes) {
    writeFileSync(join(raiz, 'e', `${estante.id}.html`), paginaDeCompartilhamento({
      titulo: estante.nome,
      descricao: estante.descricao || descricaoPadrao,
      imagem: absoluta(estante.capa || logo),
      urlPropria: base ? `${base}e/${estante.id}.html` : '',
      destinoRelativo: estante.destino,
    }));
  }

  console.log(`Páginas de compartilhamento: ${quantosF} flipbook(s) em f/, ${estantes.length} estante(s) em e/ (base: ${base || 'relativa'}).`);
}

gerar();
