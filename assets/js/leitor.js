// Leitor flipbook: renderiza o PDF com PDF.js e anima a virada de página
// com StPageFlip. As páginas são renderizadas progressivamente, priorizando
// as mais próximas da página em exibição.
import * as pdfjs from '../vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).toString();

const LARGURA_RENDER = Math.min(1440, Math.round(880 * Math.min(window.devicePixelRatio || 1, 2)));
const LARGURA_LUPA = Math.min(2600, LARGURA_RENDER * 2);
// Escala de AMPLIAÇÃO: 0 = visão normal (a PÁGINA INTEIRA visível na
// tela); o valor é o quanto se amplia além dela, até +300 (4× o normal).
const ZOOM_MINIMO = 0;
const ZOOM_MAXIMO = 300;
const PASSO_ZOOM = 15;

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
  el('controle-progresso').value = String(atual);
}

/* ====== Som da virada de página ====== */
const CHAVE_SOM = 'estante-leitor-som';
let somLigado = localStorage.getItem(CHAVE_SOM) !== '0';
let contextoAudio = null;

// Sintetiza um "swish" curto de papel — sem arquivo de áudio.
function tocarSomDeVirada() {
  if (!somLigado) return;
  try {
    if (!contextoAudio) contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
    if (contextoAudio.state === 'suspended') contextoAudio.resume();
    const duracao = 0.16;
    const taxa = contextoAudio.sampleRate;
    const buffer = contextoAudio.createBuffer(1, Math.round(taxa * duracao), taxa);
    const dados = buffer.getChannelData(0);
    for (let i = 0; i < dados.length; i += 1) dados[i] = Math.random() * 2 - 1;

    const fonte = contextoAudio.createBufferSource();
    fonte.buffer = buffer;
    const filtro = contextoAudio.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = 0.9;
    filtro.frequency.setValueAtTime(900, contextoAudio.currentTime);
    filtro.frequency.exponentialRampToValueAtTime(2600, contextoAudio.currentTime + duracao);
    const ganho = contextoAudio.createGain();
    ganho.gain.setValueAtTime(0.0001, contextoAudio.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.16, contextoAudio.currentTime + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, contextoAudio.currentTime + duracao);
    fonte.connect(filtro).connect(ganho).connect(contextoAudio.destination);
    fonte.start();
  } catch { /* áudio bloqueado — segue sem som */ }
}

function atualizarBotaoSom() {
  const botao = el('btn-som');
  botao.setAttribute('aria-pressed', String(somLigado));
  botao.title = somLigado ? 'Silenciar virada de página' : 'Ativar som da virada';
  botao.innerHTML = somLigado
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 5M21 9l-5 5"/></svg>';
}

/* ====== Velocidade da animação ====== */
const CHAVE_VELOCIDADE = 'estante-leitor-velocidade';
const VELOCIDADES = [
  { rotulo: '0.5×', tempo: 2000 },
  { rotulo: '1×', tempo: 1000 },
  { rotulo: '1.5×', tempo: 650 },
  { rotulo: '2×', tempo: 400 },
];
let indiceVelocidade = Math.min(
  Math.max(parseInt(localStorage.getItem(CHAVE_VELOCIDADE) ?? '1', 10) || 1, 0),
  VELOCIDADES.length - 1,
);

function aplicarVelocidade() {
  el('btn-velocidade').textContent = VELOCIDADES[indiceVelocidade].rotulo;
  // O StPageFlip lê flippingTime das configurações a cada virada,
  // então dá para ajustar ao vivo.
  if (livro) livro.getSettings().flippingTime = VELOCIDADES[indiceVelocidade].tempo;
}

/* ====== Miniaturas ====== */
function abrirMiniaturas() {
  const grade = el('miniaturas-grade');
  grade.innerHTML = '';
  for (let i = 0; i < numPaginas; i += 1) {
    const botao = document.createElement('button');
    botao.className = 'miniatura';
    if (i === paginaAtual) botao.classList.add('atual');
    const img = document.createElement('img');
    img.src = imagens[i];
    img.alt = `Página ${i + 1}`;
    img.loading = 'lazy';
    const rotulo = document.createElement('span');
    rotulo.textContent = String(i + 1);
    botao.append(img, rotulo);
    botao.addEventListener('click', () => {
      fecharMiniaturas();
      if (livro) livro.flip(i);
    });
    grade.appendChild(botao);
  }
  el('miniaturas').hidden = false;
  const atual = grade.children[paginaAtual];
  if (atual) atual.scrollIntoView({ block: 'center' });
}

function fecharMiniaturas() {
  el('miniaturas').hidden = true;
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
    const estadoAnterior = estadoLivro;
    estadoLivro = evento.data;
    if (estadoLivro === 'flipping' && estadoAnterior !== 'flipping') tocarSomDeVirada();
    if (estadoLivro === 'read' && atualizacaoPendente) aplicarPaginas();
  });

  livro.on('changeOrientation', () => {
    dimensionarLivro();
    atualizarIndicador();
  });

  livro.loadFromImages(imagens);
  aplicarVelocidade();

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
let zoomLupa = ZOOM_MINIMO;
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

// Largura (em % do contêiner) em que a página aparece INTEIRA na tela —
// essa é a "visão normal" (zoom 0). Páginas em pé ajustam pela altura.
function larguraBaseLupa() {
  const corpo = el('lupa-corpo');
  const larguraDisponivel = Math.max(corpo.clientWidth - 32, 1);
  const alturaDisponivel = Math.max(corpo.clientHeight - 32, 1);
  const larguraAjustada = Math.min(larguraDisponivel, alturaDisponivel / proporcao);
  return (larguraAjustada / larguraDisponivel) * 100;
}

// suave=true anima a transição (botões); false segue o dedo (barra).
function aplicarNivelLupa(suave = false) {
  zoomLupa = Math.min(Math.max(zoomLupa, ZOOM_MINIMO), ZOOM_MAXIMO);
  const imagem = el('lupa-imagem');
  imagem.classList.toggle('zoom-suave', suave);
  // zoom 0 → página inteira; +100 → 2× a visão normal; +300 → 4×.
  imagem.style.width = `${larguraBaseLupa() * (1 + zoomLupa / 100)}%`;
  el('lupa-zoom').textContent = zoomLupa === 0 ? '0' : `+${Math.round(zoomLupa)}`;
  el('lupa-controle').value = String(zoomLupa);
  el('lupa-menos').disabled = zoomLupa <= ZOOM_MINIMO;
  el('lupa-mais').disabled = zoomLupa >= ZOOM_MAXIMO;
}

window.addEventListener('resize', () => {
  if (!lupa.hidden) aplicarNivelLupa();
});

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

  if (entrada.permitirDownload === false) {
    el('btn-baixar').hidden = true;
  } else {
    el('btn-baixar').href = `catalogos/${encodeURIComponent(entrada.arquivo)}`;
  }
  if (entrada.estante) {
    document.querySelector('.leitor-topo .botao-icone').href = `estante.html?e=${encodeURIComponent(entrada.estante)}`;
  }

  el('btn-compartilhar').addEventListener('click', async () => {
    // Inclui o #p=N: quem recebe o link abre direto na página atual.
    const url = `${location.origin}${location.pathname}${location.search}${location.hash}`;
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

  el('btn-som').addEventListener('click', () => {
    somLigado = !somLigado;
    localStorage.setItem(CHAVE_SOM, somLigado ? '1' : '0');
    atualizarBotaoSom();
    if (somLigado) tocarSomDeVirada();
  });
  atualizarBotaoSom();

  el('btn-velocidade').addEventListener('click', () => {
    indiceVelocidade = (indiceVelocidade + 1) % VELOCIDADES.length;
    localStorage.setItem(CHAVE_VELOCIDADE, String(indiceVelocidade));
    aplicarVelocidade();
    avisar(`Velocidade da animação: ${VELOCIDADES[indiceVelocidade].rotulo}`);
  });
  aplicarVelocidade();

  el('btn-miniaturas').addEventListener('click', abrirMiniaturas);
  el('miniaturas-fechar').addEventListener('click', fecharMiniaturas);

  // Arrastar a barra vai direto à página (sem animação, bom para "varrer").
  el('controle-progresso').addEventListener('input', (evento) => {
    if (!livro) return;
    const alvo = Math.min(Math.max(parseInt(evento.target.value, 10), 1), numPaginas) - 1;
    if (alvo === paginaAtual) return;
    livro.turnToPage(alvo);
    paginaAtual = alvo;
    gravarPaginaNoEndereco(paginaAtual);
    atualizarIndicador();
  });

  el('btn-ampliar').addEventListener('click', abrirLupa);
  el('lupa-fechar').addEventListener('click', fecharLupa);
  el('lupa-anterior').addEventListener('click', () => mostrarPaginaNaLupa(paginaLupa - 1));
  el('lupa-proxima').addEventListener('click', () => mostrarPaginaNaLupa(paginaLupa + 1));
  el('lupa-mais').addEventListener('click', () => {
    zoomLupa += PASSO_ZOOM;
    aplicarNivelLupa(true);
  });
  el('lupa-menos').addEventListener('click', () => {
    zoomLupa -= PASSO_ZOOM;
    aplicarNivelLupa(true);
  });
  el('lupa-controle').addEventListener('input', (evento) => {
    zoomLupa = parseInt(evento.target.value, 10);
    aplicarNivelLupa(false);
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !el('miniaturas').hidden) { fecharMiniaturas(); return; }
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

  const entrada = (manifesto.catalogos || []).find((c) => c.arquivo === arquivo && !c.lixeira);
  if (!entrada) {
    mostrarErro('Catálogo não encontrado', 'Ele pode ter sido removido ou o link está incorreto.');
    return;
  }

  document.title = `${entrada.titulo} · ${manifesto.titulo || 'Catálogos'}`;
  el('titulo').textContent = entrada.titulo;
  if (manifesto.identidade && manifesto.identidade.logo) {
    const logo = el('leitor-logo');
    logo.src = manifesto.identidade.logo;
    logo.hidden = false;
  }
  if (manifesto.identidade && manifesto.identidade.cor) {
    const m = manifesto.identidade.cor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) {
      const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
      const raiz = document.documentElement.style;
      raiz.setProperty('--realce', manifesto.identidade.cor);
      raiz.setProperty('--realce-fraco', `rgba(${r}, ${g}, ${b}, 0.16)`);
      raiz.setProperty('--brilho', `0 0 22px rgba(${r}, ${g}, ${b}, 0.22)`);
    }
  }
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
  el('controle-progresso').max = String(numPaginas);
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
