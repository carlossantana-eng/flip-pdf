#!/usr/bin/env node
// Gera/atualiza o catalogos.json a partir dos PDFs da pasta catalogos/.
// - Preserva título, descrição e demais campos editados à mão.
// - Adiciona entradas para PDFs novos (título derivado do nome do arquivo).
// - Remove entradas cujo PDF não existe mais.
// - Detecta capa opcional em catalogos/capas/<mesmo-nome>.(jpg|jpeg|png|webp).
//
// Uso: node scripts/gerar-manifesto.mjs [--check]
//   --check  não grava; sai com código 1 se o manifesto estiver desatualizado.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pastaCatalogos = join(raiz, 'catalogos');
const pastaCapas = join(pastaCatalogos, 'capas');
const caminhoManifesto = join(raiz, 'catalogos.json');
const modoVerificacao = process.argv.includes('--check');

function tituloDoArquivo(nome) {
  const titulo = basename(nome, extname(nome))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return titulo.charAt(0).toUpperCase() + titulo.slice(1);
}

function dataDeAdicao(arquivo) {
  // Data do primeiro commit do arquivo; se ainda não commitado, hoje.
  try {
    const saida = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--follow', '--format=%as', '--', join('catalogos', arquivo)],
      { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const linhas = saida.split('\n').filter(Boolean);
    if (linhas.length > 0) return linhas[linhas.length - 1];
  } catch { /* sem git disponível */ }
  return new Date().toISOString().slice(0, 10);
}

function capaDoArquivo(arquivo) {
  const nomeBase = basename(arquivo, extname(arquivo));
  for (const extensao of ['jpg', 'jpeg', 'png', 'webp']) {
    const candidata = join(pastaCapas, `${nomeBase}.${extensao}`);
    if (existsSync(candidata)) return `catalogos/capas/${nomeBase}.${extensao}`;
  }
  return undefined;
}

let manifesto = { titulo: 'Catálogos', catalogos: [] };
if (existsSync(caminhoManifesto)) {
  try {
    manifesto = JSON.parse(readFileSync(caminhoManifesto, 'utf8'));
  } catch (erro) {
    console.error(`catalogos.json inválido: ${erro.message}`);
    process.exit(1);
  }
}

const existentes = new Map((manifesto.catalogos || []).map((c) => [c.arquivo, c]));

const pdfs = existsSync(pastaCatalogos)
  ? readdirSync(pastaCatalogos).filter((n) => /\.pdf$/i.test(n)).sort()
  : [];

const catalogos = pdfs.map((arquivo) => {
  const anterior = existentes.get(arquivo);
  const entrada = {
    arquivo,
    titulo: anterior?.titulo || tituloDoArquivo(arquivo),
    adicionadoEm: anterior?.adicionadoEm || dataDeAdicao(arquivo),
  };
  if (anterior?.descricao) entrada.descricao = anterior.descricao;
  const capa = capaDoArquivo(arquivo);
  if (capa) entrada.capa = capa;
  return entrada;
});

for (const arquivo of existentes.keys()) {
  if (!pdfs.includes(arquivo)) {
    console.warn(`Aviso: "${arquivo}" está no manifesto mas não existe mais em catalogos/ — removido.`);
  }
}

const novoManifesto = { ...manifesto, catalogos };
const conteudo = `${JSON.stringify(novoManifesto, null, 2)}\n`;
const conteudoAtual = existsSync(caminhoManifesto) ? readFileSync(caminhoManifesto, 'utf8') : '';

if (modoVerificacao) {
  if (conteudo !== conteudoAtual) {
    console.error('catalogos.json está desatualizado. Rode: node scripts/gerar-manifesto.mjs');
    process.exit(1);
  }
  console.log(`OK: manifesto em dia (${catalogos.length} catálogo(s)).`);
} else if (conteudo !== conteudoAtual) {
  writeFileSync(caminhoManifesto, conteudo);
  console.log(`catalogos.json atualizado (${catalogos.length} catálogo(s)).`);
} else {
  console.log(`Nada a fazer (${catalogos.length} catálogo(s)).`);
}
