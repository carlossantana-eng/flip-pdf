// Estante virtual: lista os catálogos do manifesto e desenha a capa
// (1ª página do PDF) de cada um, sem baixar o arquivo inteiro.
import * as pdfjs from '../vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).toString();

const LARGURA_CAPA = Math.min(480, Math.round(240 * Math.min(window.devicePixelRatio || 1, 2)));
const CAPAS_SIMULTANEAS = 2;

const estante = document.getElementById('estante');

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

  const info = document.createElement('div');
  info.className = 'cartao-info';
  const titulo = document.createElement('h2');
  titulo.textContent = catalogo.titulo;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = '';
  info.append(titulo, meta);

  cartao.append(capa, info);
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
  if (itens.length < 6) return;
  const busca = document.getElementById('busca');
  const campo = document.getElementById('campo-busca');
  busca.hidden = false;
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
        '<div class="estado-estante" id="sem-resultado"><h2>Nenhum catálogo encontrado</h2><p>Tente buscar por outro nome.</p></div>');
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
      '<h2>Não foi possível carregar os catálogos</h2>' +
      '<p>Verifique sua conexão e tente novamente.</p>' +
      '<button class="botao" onclick="location.reload()">Recarregar</button>');
    return;
  }

  if (manifesto.titulo) {
    document.getElementById('titulo-estante').textContent = manifesto.titulo;
    document.title = manifesto.titulo;
  }
  if (manifesto.descricao) {
    const descricao = document.getElementById('descricao-estante');
    descricao.textContent = manifesto.descricao;
    descricao.hidden = false;
  }
  document.getElementById('rodape-texto').textContent =
    `${document.title} · atualizado em ${new Date().toLocaleDateString('pt-BR')}`;

  const catalogos = [...(manifesto.catalogos || [])].sort((a, b) =>
    (b.adicionadoEm || '').localeCompare(a.adicionadoEm || '') ||
    a.titulo.localeCompare(b.titulo, 'pt-BR'));

  if (catalogos.length === 0) {
    mostrarEstado(
      '<h2>Nenhum catálogo publicado ainda</h2>' +
      '<p>Os catálogos enviados para a pasta <code>catalogos/</code> aparecem aqui automaticamente.</p>');
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
