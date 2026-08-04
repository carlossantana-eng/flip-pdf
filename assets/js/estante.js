// Estante virtual: lista os catálogos do manifesto e desenha a capa
// (1ª página do PDF) de cada um, sem baixar o arquivo inteiro.
// O dono (com a chave salva neste navegador) vê um lápis de edição.
import * as pdfjs from '../vendor/pdf.min.mjs';
import { temToken, corDeTexto } from './nucleo-admin.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).toString();

const LARGURA_CAPA = Math.min(480, Math.round(240 * Math.min(window.devicePixelRatio || 1, 2)));
const CAPAS_SIMULTANEAS = 2;

const estante = document.getElementById('estante');

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Aplica a cor de destaque da identidade, recalculando o brilho (glow).
function aplicarCorDeDestaque(cor) {
  const m = cor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  const raiz = document.documentElement.style;
  raiz.setProperty('--realce', cor);
  raiz.setProperty('--cta', cor);
  raiz.setProperty('--realce-fraco', `rgba(${r}, ${g}, ${b}, 0.16)`);
  raiz.setProperty('--realce-borda', `rgba(${r}, ${g}, ${b}, 0.5)`);
  raiz.setProperty('--realce-texto', corDeTexto(cor));
  raiz.setProperty('--cta-texto', corDeTexto(cor));
  raiz.setProperty('--brilho', `0 0 22px rgba(${r}, ${g}, ${b}, 0.22)`);
}

function mostrarEstado(html) {
  estante.innerHTML = `<div class="estado-estante">${html}</div>`;
}

async function carregarManifesto() {
  const resposta = await fetch('catalogos.json', { cache: 'no-cache' });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

function criarCartao(catalogo) {
  const cartao = document.createElement('a');
  cartao.className = 'cartao';
  cartao.href = `leitor.html?c=${encodeURIComponent(catalogo.arquivo)}`;

  const capa = document.createElement('div');
  capa.className = 'capa';
  const esqueleto = document.createElement('div');
  esqueleto.className = 'esqueleto';
  capa.appendChild(esqueleto);

  const prateleira = document.createElement('div');
  prateleira.className = 'prateleira';

  const info = document.createElement('div');
  info.className = 'cartao-info';
  const titulo = document.createElement('h2');
  titulo.textContent = catalogo.titulo;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = '';
  info.append(titulo, meta);

  cartao.append(capa, prateleira, info);

  // Lápis de edição — só para o dono, sem aparecer para os clientes.
  if (temToken()) {
    const editar = document.createElement('button');
    editar.className = 'botao-editar-capa';
    editar.title = `Editar "${catalogo.titulo}"`;
    editar.setAttribute('aria-label', `Editar ${catalogo.titulo}`);
    editar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    editar.addEventListener('click', (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      location.href = `editor.html?c=${encodeURIComponent(catalogo.arquivo)}`;
    });
    cartao.appendChild(editar);
  }

  return { cartao, capa, esqueleto, meta };
}

async function desenharCapa(catalogo, elementos) {
  const { capa, esqueleto, meta } = elementos;

  if (catalogo.capa) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = catalogo.capa;
    img.onload = () => esqueleto.remove();
    capa.appendChild(img);
    return;
  }

  // Renderiza só a 1ª página; com disableAutoFetch o PDF.js baixa apenas
  // os trechos necessários do arquivo (requisições com Range).
  const tarefa = pdfjs.getDocument({
    url: `catalogos/${encodeURIComponent(catalogo.arquivo)}`,
    disableAutoFetch: true,
  });
  try {
    const pdf = await tarefa.promise;
    const pagina = await pdf.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const escala = LARGURA_CAPA / base.width;
    const viewport = pagina.getViewport({ scale: escala });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const contexto = canvas.getContext('2d');
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: contexto, viewport }).promise;

    esqueleto.remove();
    capa.appendChild(canvas);
    meta.textContent = pdf.numPages === 1 ? '1 página' : `${pdf.numPages} páginas`;
  } catch (erro) {
    console.warn(`Não foi possível gerar a capa de ${catalogo.arquivo}`, erro);
    esqueleto.remove();
    capa.insertAdjacentHTML('beforeend',
      '<svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="#a9a294" stroke-width="1.5"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/></svg>');
  } finally {
    tarefa.destroy().catch(() => {});
  }
}

function configurarBusca(itens) {
  const botao = document.getElementById('btn-busca');
  const campo = document.getElementById('campo-busca');

  botao.addEventListener('click', () => {
    campo.hidden = !campo.hidden;
    botao.setAttribute('aria-expanded', String(!campo.hidden));
    if (!campo.hidden) campo.focus();
  });
  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      campo.value = '';
      campo.dispatchEvent(new Event('input'));
      campo.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
    }
  });

  campo.addEventListener('input', () => {
    const termo = normalizar(campo.value.trim());
    let visiveis = 0;
    for (const item of itens) {
      const corresponde = !termo || normalizar(item.catalogo.titulo).includes(termo);
      item.cartao.style.display = corresponde ? '' : 'none';
      if (corresponde) visiveis += 1;
    }
    const semResultado = document.getElementById('sem-resultado');
    if (semResultado) semResultado.remove();
    if (visiveis === 0) {
      estante.insertAdjacentHTML('beforeend',
        '<div class="estado-estante" id="sem-resultado"><h2>Nenhum flipbook encontrado</h2><p>Tente buscar por outro nome.</p></div>');
    }
  });
}

async function iniciar() {
  let manifesto;
  try {
    manifesto = await carregarManifesto();
  } catch (erro) {
    console.error(erro);
    mostrarEstado(
      '<h2>Não foi possível carregar os flipbooks</h2>' +
      '<p>Verifique sua conexão e tente novamente.</p>' +
      '<button class="botao" onclick="location.reload()">Recarregar</button>');
    return;
  }

  // Estantes múltiplas: ?e=<id> abre uma estante específica; sem o
  // parâmetro, abre a principal (título/descrição do manifesto).
  const idEstante = new URLSearchParams(location.search).get('e') || 'principal';
  const infoEstante = idEstante === 'principal'
    ? { id: 'principal', nome: manifesto.titulo || 'Catálogos', descricao: manifesto.descricao }
    : (manifesto.estantes || []).find((e) => e.id === idEstante);

  if (manifesto.titulo) document.getElementById('marca-texto').textContent = manifesto.titulo;
  const identidade = manifesto.identidade || {};
  if (identidade.logo) {
    const logo = document.createElement('img');
    logo.className = 'marca-logo';
    logo.src = identidade.logo;
    logo.alt = '';
    document.querySelector('.marca').prepend(logo);
  }

  if (!infoEstante) {
    mostrarEstado(
      '<h2>Estante não encontrada</h2>' +
      '<p>Ela pode ter sido removida.</p>' +
      '<a class="botao" href="estante.html">Ir para a estante principal</a>');
    return;
  }

  // Cores da estante: a principal guarda as dela na identidade.
  const proprio = infoEstante.id === 'principal' ? identidade : infoEstante;
  const corPrimaria = proprio.cor;
  const corSecundaria = proprio.corSecundaria;
  const corFundo = proprio.corFundo;
  if (corPrimaria) aplicarCorDeDestaque(corPrimaria);
  const raiz = document.documentElement.style;
  if (corFundo) {
    raiz.setProperty('--fundo', corFundo);
    // Contraste automático: os textos da página seguem a luminância do fundo.
    const texto = corDeTexto(corFundo);
    const paginaClara = texto !== '#ffffff';
    raiz.setProperty('--texto-forte', texto);
    raiz.setProperty('--tinta', paginaClara ? '#262b20' : '#ededed');
    raiz.setProperty('--tinta-suave', paginaClara ? 'rgba(30, 35, 22, 0.68)' : 'rgba(237, 237, 237, 0.68)');
    raiz.setProperty('--borda', paginaClara ? 'rgba(20, 25, 12, 0.16)' : 'rgba(255, 255, 255, 0.14)');
    raiz.setProperty('--barra-fundo', paginaClara ? 'rgba(255, 255, 255, 0.78)' : 'rgba(8, 10, 5, 0.72)');
    raiz.setProperty('--campo-fundo', paginaClara ? '#ffffff' : '#0d0d0d');
    raiz.setProperty('--hover-fundo', paginaClara ? 'rgba(0, 0, 0, 0.06)' : '#111111');
    raiz.setProperty('--linha-suave', paginaClara ? 'rgba(25, 32, 12, 0.08)' : 'rgba(255, 255, 255, 0.08)');
    raiz.setProperty('--superficie-suave', paginaClara ? 'rgba(0, 0, 0, 0.05)' : '#101010');
    raiz.setProperty('--sombra-barra', paginaClara
      ? '0 10px 30px rgba(35, 45, 15, 0.12)'
      : '0 10px 34px rgba(0, 0, 0, 0.55)');
  }
  if (corSecundaria) {
    raiz.setProperty('--estante-fundo', corSecundaria);
    raiz.setProperty('--prateleira-fundo', corSecundaria);
    // Textos dentro dos painéis seguem a luminância do painel.
    const textoPainel = corDeTexto(corSecundaria);
    raiz.setProperty('--texto-painel', textoPainel);
    raiz.setProperty('--texto-painel-suave', textoPainel === '#ffffff'
      ? 'rgba(255, 255, 255, 0.68)'
      : 'rgba(16, 19, 12, 0.68)');
  }

  document.getElementById('titulo-estante').textContent = infoEstante.nome;
  document.title = infoEstante.nome;
  if (infoEstante.descricao) {
    document.getElementById('descricao-estante').textContent = infoEstante.descricao;
  }
  document.getElementById('rodape-texto').textContent =
    `${document.title} · atualizado em ${new Date().toLocaleDateString('pt-BR')}`;

  const catalogos = (manifesto.catalogos || [])
    .filter((c) => !c.lixeira && (c.estante || 'principal') === infoEstante.id)
    .sort((a, b) =>
    (b.adicionadoEm || '').localeCompare(a.adicionadoEm || '') ||
    a.titulo.localeCompare(b.titulo, 'pt-BR'));

  if (catalogos.length === 0) {
    mostrarEstado(
      '<h2>Nenhum flipbook publicado ainda</h2>' +
      '<p>Os flipbooks publicados aparecem aqui automaticamente.</p>');
    return;
  }

  estante.innerHTML = '';
  const itens = [];
  for (const catalogo of catalogos) {
    const elementos = criarCartao(catalogo);
    estante.appendChild(elementos.cartao);
    itens.push({ catalogo, ...elementos });
  }

  configurarBusca(itens);

  // Desenha as capas em fila, poucas por vez, para não travar o celular.
  const fila = [...itens];
  await Promise.all(Array.from({ length: CAPAS_SIMULTANEAS }, async () => {
    while (fila.length > 0) {
      const item = fila.shift();
      await desenharCapa(item.catalogo, item);
    }
  }));
}

iniciar();
