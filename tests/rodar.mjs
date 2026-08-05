// Runner das suítes: sobe um servidor estático na raiz do repositório e
// executa cada suíte como processo separado. Falha (exit 1) se qualquer
// suíte falhar. Uso: node tests/rodar.mjs [nomes…]

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const PORTA = Number(process.env.PORTA_TESTES || 8123);

const SUITES = [
  'plataforma', 'leitor', 'admin', 'publicar', 'arquivos',
  'estantes', 'editor', 'configuracoes', 'musica', 'tema',
];

const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

const servidor = createServer((req, res) => {
  const caminhoUrl = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let caminho = normalize(join(RAIZ, caminhoUrl));
  if (!caminho.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
  if (existsSync(caminho) && statSync(caminho).isDirectory()) caminho = join(caminho, 'index.html');
  if (!existsSync(caminho)) { res.writeHead(404); res.end('nao encontrado'); return; }
  res.writeHead(200, { 'content-type': MIMES[extname(caminho)] || 'application/octet-stream' });
  createReadStream(caminho).pipe(res);
});

function rodarSuite(nome) {
  return new Promise((resolver) => {
    const inicio = Date.now();
    const processo = spawn(process.execPath, [join(AQUI, `${nome}.mjs`)], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, BASE_TESTES: `http://127.0.0.1:${PORTA}` },
    });
    processo.on('close', (codigo) => {
      const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
      resolver({ nome, ok: codigo === 0, segundos });
    });
  });
}

const pedidas = process.argv.slice(2);
const fila = pedidas.length > 0 ? pedidas : SUITES;

servidor.listen(PORTA, '127.0.0.1', async () => {
  const resultados = [];
  for (const nome of fila) {
    console.log(`\n=== ${nome} ===`);
    resultados.push(await rodarSuite(nome));
  }
  servidor.close();
  console.log('\n===== RESUMO =====');
  for (const r of resultados) {
    console.log(`${r.ok ? 'PASSOU' : 'FALHOU'}  ${r.nome} (${r.segundos}s)`);
  }
  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length > 0) {
    console.error(`\n${falhas.length} suíte(s) falharam.`);
    process.exit(1);
  }
  console.log('\nTodas as suítes passaram.');
});
