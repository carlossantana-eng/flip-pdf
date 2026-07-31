// Leitor flipbook: renderiza o PDF com PDF.js e anima a virada de página
// com StPageFlip. As páginas são renderizadas progressivamente, priorizando
// as mais próximas da página em exibição.
import * as pdfjs from '../vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).toString();

const LARGURA_RENDER = Math.min(1440, Math.round(880 * Math.min(window.devicePixelRatio || 1, 2)));
const LARGURA_LUPA = Math.min(2400, LARGURA_RENDER * 2);
const NIVEIS_LUPA = [100, 140, 190, 260];

const el = (id) => document.getElementById(id);
const indicador = el('indicador');
const carregando = el('carregando');

let pdf = null;
let livro = null;
let numPaginas = 0;
let proporcao = 1.414; // altura / largura
let imagens = [];
let renderizadas = new Set();
let estadoLivro = 'read';
let atualizacaoPendente = false;
let ultimaAtualizacao = 0;
let paginaAtual = 0;

function mostrarErro(titulo, texto) {
  carregando.hidden = true;
  el('erro-titulo').textContent = titulo;
  el('erro-texto').textContent = texto;
  el('erro').hidden = false;
}

let temporizadorToast = null;
function avisar(texto) {
  const toast = el('toast');
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { toast.hidden = true; }, 2600);
}

function paginaDoEndereco() {
  const m = location.hash.match(/p=(\d+)/);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

function gravarPaginaNoEndereco(indice) {
  history.replaceState(null, '', `${location.pathname}${location.search}#p=${indice + 1}`);
}

function atualizarIndicador() {
  if (!livro) return;
  const atual = paginaAtual + 1;
  let texto;
  if (livro.getOrientation() === 'landscape' && atual > 1 && atual < numPaginas) {
    const esquerda = atual % 2 === 0 ? atual : atual - 1;
    texto = `${esquerda}–${Math.min(esquerda + 1, numPaginas)} / ${numPaginas}`;
  } else {
    texto = `${atual} / ${numPaginas}`;
  }
  indicador.textContent = texto;
  el('btn-anterior').disabled = paginaAtual <= 0;
  el('btn-proximo').disabled = paginaAtual >= numPaginas - 1;
}

async function renderizarPagina(numero, largura) {
  const pagina = await pdf.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const viewport = pagina.getViewport({ scale: largura / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const contexto = canvas.getContext('2d');
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: contexto, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.85);
}

function criarPaginaProvisoria() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = Math.round(640 * proporcao);
  const contexto = canvas.getContext('2d');
  contexto.fillStyle = '#f7f6f2';
  contexto.fillRect(0, 0, canvas.width, canvas.height);
  contexto.fillStyle = '#c8c3b8';
  contexto.font = '28px sans-serif';
  contexto.textAlign = 'center';
  contexto.fillText('Carregando…', canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/png');
}

// Aplica no livro as páginas já renderizadas, sem interromper uma virada.
function aplicarPaginas(forcar = false) {
  if (!livro) return;
  const agora = Date.now();
  if (!forcar && (estadoLivro !== 'read' || agora - ultimaAtualizacao < 600)) {
    atualizacaoPendente = true;
    return;
  }
  atualizacaoPendente = false;
  ultimaAtualizacao = agora;
  livro.updateFromImages(imagens);
  atualizarIndicador();
}

function proximaParaRenderizar() {
  let melhor = -1;
  let menorDistancia = Infinity;
  for (let i = 0; i < numPaginas; i += 1) {
    if (renderizadas.has(i)) continue;
    const distancia = Math.abs(i - paginaAtual);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = i;
    }
  }
  return melhor;
}

async function lacoDeRenderizacao() {
  const barra = el('progresso-barra');
  while (renderizadas.size < numPaginas) {
    const indice = proximaParaRenderizar();
    if (indice < 0) break;
    try {
      imagens[indice] = await renderizarPagina(indice + 1, LARGURA_RENDER);
    } catch (erro) {
      console.warn(`Falha ao renderizar a página ${indice + 1}`, erro);
    }
    renderizadas.add(indice);
    barra.style.width = `${Math.round((renderizadas.size / numPaginas) * 100)}%`;
    aplicarPaginas();
  }
  aplicarPaginas(true);
  el('progresso').style.visibility = 'hidden';
}

// O StPageFlip acompanha a largura do elemento pai, mas não limita pela
// altura disponível; calculamos aqui a largura que faz o livro caber no palco.
function dimensionarLivro() {
  const moldura = document.querySelector('.livro-moldura');
  const alturaDisponivel = moldura.clientHeight;
  const larguraDisponivel = moldura.clientWidth;
  const paginas = livro
    ? (livro.getOrientation() === 'portrait' ? 1 : 2)
    : (window.innerWidth < 640 ? 1 : 2);
  const larguraIdeal = Math.min(larguraDisponivel, Math.floor((alturaDisponivel / proporcao) * paginas));
  el('livro').style.width = `${Math.max(larguraIdeal, 200)}px`;
}

function montarLivro() {
  // Registrado antes de criar o livro para rodar antes do listener interno
  // de resize do StPageFlip (que lê a largura já ajustada).
  window.addEventListener('resize', dimensionarLivro);
  dimensionarLivro();

  const inicial = Math.min(paginaDoEndereco(), numPaginas) - 1;
  paginaAtual = inicial;

  const larguraBase = 460;
  const alturaBase = Math.round(larguraBase * proporcao);
  livro = new St.PageFlip(el('livro'), {
    width: larguraBase,
    height: alturaBase,
    startPage: inicial,
    size: 'stretch',
    minWidth: 220,
    maxWidth: 1000,
    minHeight: Math.round(220 * proporcao),
    maxHeight: Math.round(1000 * proporcao),
    showCover: true,
    usePortrait: true,
    autoSize: true,
    maxShadowOpacity: 0.35,
    mobileScrollSupport: false,
  });

  livro.on('flip', (evento) => {
    paginaAtual = evento.data;
    gravarPaginaNoEndereco(paginaAtual);
    atualizarIndicador();
  });

  livro.on('changeState', (evento) => {
    estadoLivro = evento.data;
    if (estadoLivro === 'read' && atualizacaoPendente) aplicarPaginas();
  });

  livro.on('changeOrientation', () => {
    dimensionarLivro();
    atualizarIndicador();
  });

  livro.loadFromImages(imagens);

  // Permite colar um link #p=N com o leitor já aberto.
  window.addEventListener('hashchange', () => {
    const alvo = Math.min(paginaDoEndereco(), numPaginas) - 1;
    if (livro && alvo !== paginaAtual) livro.flip(alvo);
  });

  gravarPaginaNoEndereco(paginaAtual);
  atualizarIndicador();
}

/* ====== Lupa (página ampliada) ====== */
const lupa = el('lupa');
let paginaLupa = 1;
let nivelLupa = 1;
const cacheLupa = new Map();

async function mostrarPaginaNaLupa(numero) {
  paginaLupa = Math.min(Math.max(1, numero), numPaginas);
  el('lupa-indicador').textContent = `${paginaLupa} / ${numPaginas}`;
  const imagem = el('lupa-imagem');
  imagem.src = imagens[paginaLupa - 1]; // mostra a versão atual enquanto amplia
  aplicarNivelLupa();
  if (!cacheLupa.has(paginaLupa)) {
    try {
      cacheLupa.set(paginaLupa, await renderizarPagina(paginaLupa, LARGURA_LUPA));
    } catch (erro) {
      console.warn('Falha ao ampliar a página', erro);
      return;
    }
  }
  if (!lupa.hidden) imagem.src = cacheLupa.get(paginaLupa);
}

function aplicarNivelLupa() {
  el('lupa-imagem').style.width = `${NIVEIS_LUPA[nivelLupa]}%`;
}

function abrirLupa() {
  lupa.hidden = false;
  mostrarPaginaNaLupa(paginaAtual + 1);
}

function fecharLupa() {
  lupa.hidden = true;
}

/* ====== Ações da barra ====== */
function configurarAcoes(entrada) {
  el('btn-anterior').addEventListener('click', () => livro && livro.flipPrev());
  el('btn-proximo').addEventListener('click', () => livro && livro.flipNext());

  el('btn-baixar').href = `catalogos/${encodeURIComponent(entrada.arquivo)}`;

  el('btn-compartilhar').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}${location.search}`;
    if (navigator.share) {
      try { await navigator.share({ title: entrada.titulo, url }); } catch { /* cancelado */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      avisar('Link copiado!');
    } catch {
      avisar(url);
    }
  });

  const btnTelaCheia = el('btn-tela-cheia');
  if (!document.documentElement.requestFullscreen) {
    btnTelaCheia.style.display = 'none';
  } else {
    btnTelaCheia.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    });
  }

  el('btn-ampliar').addEventListener('click', abrirLupa);
  el('lupa-fechar').addEventListener('click', fecharLupa);
  el('lupa-anterior').addEventListener('click', () => mostrarPaginaNaLupa(paginaLupa - 1));
  el('lupa-proxima').addEventListener('click', () => mostrarPaginaNaLupa(paginaLupa + 1));
  el('lupa-mais').addEventListener('click', () => {
    nivelLupa = Math.min(nivelLupa + 1, NIVEIS_LUPA.length - 1);
    aplicarNivelLupa();
  });
  el('lupa-menos').addEventListener('click', () => {
    nivelLupa = Math.max(nivelLupa - 1, 0);
    aplicarNivelLupa();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !lupa.hidden) { fecharLupa(); return; }
    if (!lupa.hidden) {
      if (evento.key === 'ArrowLeft') mostrarPaginaNaLupa(paginaLupa - 1);
      if (evento.key === 'ArrowRight') mostrarPaginaNaLupa(paginaLupa + 1);
      return;
    }
    if (!livro) return;
    if (evento.key === 'ArrowLeft') livro.flipPrev();
    if (evento.key === 'ArrowRight') livro.flipNext();
  });
}

/* ====== Início ====== */
async function iniciar() {
  const arquivo = new URLSearchParams(location.search).get('c');
  if (!arquivo) {
    mostrarErro('Catálogo não informado', 'Abra um catálogo a partir da estante.');
    return;
  }

  let manifesto;
  try {
    const resposta = await fetch('catalogos.json', { cache: 'no-cache' });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    manifesto = await resposta.json();
  } catch (erro) {
    console.error(erro);
    mostrarErro('Não foi possível carregar o catálogo', 'Verifique sua conexão e tente novamente.');
    return;
  }

  const entrada = (manifesto.catalogos || []).find((c) => c.arquivo === arquivo);
  if (!entrada) {
    mostrarErro('Catálogo não encontrado', 'Ele pode ter sido removido ou o link está incorreto.');
    return;
  }

  document.title = `${entrada.titulo} · ${manifesto.titulo || 'Catálogos'}`;
  el('titulo').textContent = entrada.titulo;
  configurarAcoes(entrada);

  el('carregando-texto').textContent = 'Baixando o catálogo…';
  try {
    pdf = await pdfjs.getDocument({ url: `catalogos/${encodeURIComponent(entrada.arquivo)}` }).promise;
  } catch (erro) {
    console.error(erro);
    mostrarErro('Não foi possível abrir o catálogo', 'Verifique sua conexão e tente novamente.');
    return;
  }

  numPaginas = pdf.numPages;
  const primeira = await pdf.getPage(1);
  const base = primeira.getViewport({ scale: 1 });
  proporcao = base.height / base.width;

  el('carregando-texto').textContent = 'Montando as páginas…';
  const provisoria = criarPaginaProvisoria();
  imagens = new Array(numPaginas).fill(provisoria);

  // Garante capa e primeira dupla nítidas antes de exibir o livro.
  const iniciais = [...new Set([1, 2, paginaDoEndereco(), paginaDoEndereco() + 1])]
    .filter((n) => n >= 1 && n <= numPaginas);
  for (const numero of iniciais) {
    imagens[numero - 1] = await renderizarPagina(numero, LARGURA_RENDER);
    renderizadas.add(numero - 1);
  }

  carregando.hidden = true;
  montarLivro();
  lacoDeRenderizacao();
}

iniciar();
