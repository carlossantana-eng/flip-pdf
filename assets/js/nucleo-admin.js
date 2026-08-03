// Núcleo compartilhado das páginas de gestão (painel e arquivos):
// autenticação por chave, API do GitHub, commits via Git Data API e
// utilitários de manifesto. A chave fica só no localStorage do navegador.

export const CHAVE_TOKEN = 'estante-chave-github';
export const RAMO = 'main';

function detectarRepositorio() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (m) {
    const partes = location.pathname.split('/').filter(Boolean);
    if (partes.length > 0) return { dono: m[1], repo: partes[0] };
  }
  return { dono: 'carlossantana-eng', repo: 'flip-pdf' };
}

export const { dono, repo } = detectarRepositorio();

let token = localStorage.getItem(CHAVE_TOKEN) || '';
let shaUltimoCommit = null;

export function temToken() { return Boolean(token); }
export function ultimoCommit() { return shaUltimoCommit; }

export function definirToken(novaChave) {
  token = (novaChave || '').trim();
  if (token) localStorage.setItem(CHAVE_TOKEN, token);
  else localStorage.removeItem(CHAVE_TOKEN);
}

/* ====== Codificação ====== */

export function deBase64(b64) {
  const binario = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function textoParaBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export function arquivoParaBase64(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).split(',')[1]);
    leitor.onerror = () => rejeitar(new Error('Falha ao ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

/* ====== Nomes ====== */

export function nomeSeguro(nome) {
  const base = nome.replace(/\.pdf$/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'catalogo'}.pdf`;
}

export function tituloDoNome(nome) {
  const titulo = nome.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return titulo.charAt(0).toUpperCase() + titulo.slice(1);
}

/* ====== API do GitHub ====== */

export async function gh(caminho, { metodo = 'GET', corpo = null } = {}) {
  // Sem barra no fim quando caminho é vazio: a API rejeita ".../repo/" e a
  // resposta de erro vem sem CORS, virando "Failed to fetch" no navegador.
  const url = `https://api.github.com/repos/${dono}/${repo}${caminho ? `/${caminho}` : ''}`;
  let resposta;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('sem conexão com api.github.com — verifique a internet, '
      + 'bloqueadores de anúncio/antivírus ou a rede da empresa.');
  }
  if (!resposta.ok) {
    let detalhe = '';
    try { detalhe = (await resposta.json()).message || ''; } catch { /* sem corpo */ }
    const erro = new Error(`${resposta.status} ${detalhe}`.trim());
    erro.status = resposta.status;
    throw erro;
  }
  return resposta.status === 204 ? null : resposta.json();
}

// Grava um conjunto de mudanças como UM único commit na main.
// mudancas: [{ caminho, conteudoBase64 }] — conteudoBase64 null remove o arquivo.
export async function commitar(mudancas, mensagem) {
  let ultimoErro = null;
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    try {
      const ref = await gh(`git/ref/heads/${RAMO}`);
      const shaBase = ref.object.sha;
      const commitBase = await gh(`git/commits/${shaBase}`);
      const itens = [];
      for (const mudanca of mudancas) {
        if (mudanca.conteudoBase64 != null) {
          const blob = await gh('git/blobs', {
            metodo: 'POST',
            corpo: { content: mudanca.conteudoBase64, encoding: 'base64' },
          });
          itens.push({ path: mudanca.caminho, mode: '100644', type: 'blob', sha: blob.sha });
        } else {
          itens.push({ path: mudanca.caminho, mode: '100644', type: 'blob', sha: null });
        }
      }
      const arvore = await gh('git/trees', {
        metodo: 'POST',
        corpo: { base_tree: commitBase.tree.sha, tree: itens },
      });
      const commit = await gh('git/commits', {
        metodo: 'POST',
        corpo: { message: mensagem, tree: arvore.sha, parents: [shaBase] },
      });
      await gh(`git/refs/heads/${RAMO}`, { metodo: 'PATCH', corpo: { sha: commit.sha } });
      shaUltimoCommit = commit.sha;
      return commit.sha;
    } catch (erro) {
      ultimoErro = erro;
      // 409/422: a main andou (ex.: commit do robô) — tenta de novo do zero.
      if (erro.status !== 409 && erro.status !== 422) throw erro;
    }
  }
  throw ultimoErro;
}

/* ====== Manifesto ====== */

export async function buscarManifesto() {
  const resposta = await gh(`contents/catalogos.json?ref=${RAMO}`);
  const manifesto = JSON.parse(deBase64(resposta.content));
  manifesto.catalogos = manifesto.catalogos || [];
  return manifesto;
}

export function manifestoParaBase64(manifesto) {
  return textoParaBase64(`${JSON.stringify(manifesto, null, 2)}\n`);
}

/* ====== Identidade ====== */

export function aplicarCorDeDestaque(cor) {
  const m = (cor || '').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  const raiz = document.documentElement.style;
  raiz.setProperty('--realce', cor);
  raiz.setProperty('--cta', cor);
  raiz.setProperty('--realce-fraco', `rgba(${r}, ${g}, ${b}, 0.16)`);
  raiz.setProperty('--brilho', `0 0 22px rgba(${r}, ${g}, ${b}, 0.22)`);
}

// "2026-07-30" -> "30/07/2026" (datas do manifesto são AAAA-MM-DD).
export function dataLegivel(iso) {
  if (!iso) return '—';
  const partes = String(iso).split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : iso;
}
