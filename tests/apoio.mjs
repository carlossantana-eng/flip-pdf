// Apoio compartilhado das suítes de teste.
//
// Cada suíte é um script Node independente que sobe um navegador headless,
// simula a API do GitHub com page.route e imprime um JSON de resultados.
// O runner (rodar.mjs) sobe o servidor estático e executa as suítes.

import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

export const RAIZ = join(AQUI, '..');
export const RECURSOS = join(AQUI, 'recursos');
export const CAPTURAS = join(AQUI, 'capturas');
mkdirSync(CAPTURAS, { recursive: true });

export const BASE = process.env.BASE_TESTES || 'http://127.0.0.1:8123';

// Em CI o chromium vem de `npx playwright install`; localmente é possível
// apontar um binário próprio com CHROMIUM_BIN.
export const OPCOES_NAVEGADOR = {
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}),
  args: ['--no-sandbox'],
};

// PDFs de teste são cópias do catálogo de exemplo do repositório,
// com o nome que a suíte precisar (nada de fixtures duplicadas).
export function pdfDeTeste(nome) {
  const destino = join(CAPTURAS, nome);
  copyFileSync(join(RAIZ, 'catalogos', 'catalogo-exemplo.pdf'), destino);
  return destino;
}

// Encerra a suíte: imprime os resultados e falha o processo se algo
// deu errado no navegador (pageerror) ou nas verificações da suíte.
export function concluir(resultados, erros, falhas = []) {
  console.log(JSON.stringify(resultados, null, 1));
  if (erros.length > 0 || falhas.length > 0) {
    console.error('FALHOU:', JSON.stringify({ erros, falhas }));
    process.exitCode = 1;
  }
}
