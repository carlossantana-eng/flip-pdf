// Estúdio de publicação: escolher PDFs → revisar título/pasta/descrição
// (com capa pré-visualizada localmente) → publicar num único commit →
// acompanhar o envio e a publicação do site até o fim.
import {
  temToken, buscarManifesto, manifestoParaBase64, commitar, gh, RAMO,
  arquivoParaBase64, nomeSeguro, tituloDoNome, aplicarCorDeDestaque, ultimoCommit,
} from './nucleo-admin.js';
import { pedirTexto } from './dialogo.js';
import * as pdfjs from '../vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).toString();

const LIMITE_TAMANHO = 60 * 1024 * 1024;
const LIMITE_CAPA = 2 * 1024 * 1024;
const EXTENSOES_CAPA = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const el = (id) => document.getElementById(id);

let publicando = false;

// Fechar ou sair no meio do envio abortaria a publicação — avisa antes.
window.addEventListener('beforeunload', (evento) => {
  if (!publicando) return;
  evento.preventDefault();
  evento.returnValue = '';
});

let manifesto = null;
let selecionados = [];   // [{ arquivo: File, nome, titulo, pasta, descricao, substitui }]

let temporizadorToast = null;
function avisar(texto, demorado = false) {
  const toast = el('toast');
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { toast.hidden = true; }, demorado ? 6000 : 3000);
}

function mostrarEtapa(id) {
  for (const etapa of ['etapa-escolha', 'etapa-config', 'etapa-envio', 'etapa-sucesso']) {
    el(etapa).hidden = etapa !== id;
  }
}

/* ====== Etapa 1 → 2: seleção e configuração ====== */

async function capaLocal(arquivo, alvo) {
  try {
    const dados = await arquivo.arrayBuffer();
    const tarefa = pdfjs.getDocument({ data: dados });
    const pdf = await tarefa.promise;
    const pagina = await pdf.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: 260 / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const contexto = canvas.getContext('2d');
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: contexto, viewport }).promise;
    alvo.replaceChildren(canvas);
    const paginas = document.createElement('span');
    paginas.className = 'publicacao-paginas';
    paginas.textContent = pdf.numPages === 1 ? '1 página' : `${pdf.numPages} páginas`;
    alvo.appendChild(paginas);
    tarefa.destroy().catch(() => {});
  } catch (erro) {
    console.warn('Sem prévia da capa', erro);
    alvo.querySelector('.esqueleto')?.remove();
  }
}

function opcoesDePasta(selecionada) {
  const select = document.createElement('select');
  const nenhuma = new Option('Sem pasta', '');
  select.appendChild(nenhuma);
  for (const nome of [...(manifesto.pastas || [])].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
    select.appendChild(new Option(nome, nome));
  }
  select.appendChild(new Option('+ Nova pasta…', '__nova__'));
  select.value = selecionada || '';
  select.addEventListener('change', async () => {
    if (select.value !== '__nova__') return;
    const nome = await pedirTexto({
      titulo: 'Nova pasta',
      rotulo: 'Nome da pasta',
      confirmarRotulo: 'Criar pasta',
    });
    if (nome) {
      if (!(manifesto.pastas || []).includes(nome)) {
        manifesto.pastas = [...(manifesto.pastas || []), nome];
      }
      select.add(new Option(nome, nome), select.options.length - 1);
      select.value = nome;
    } else {
      select.value = '';
    }
  });
  return select;
}

function desenharConfiguracao() {
  const lista = el('lista-publicacoes');
  lista.innerHTML = '';
  for (const item of selecionados) {
    const cartao = document.createElement('div');
    cartao.className = 'cartao-publicacao';

    const capa = document.createElement('div');
    capa.className = 'publicacao-capa';
    capa.innerHTML = '<div class="esqueleto"></div>';
    capaLocal(item.arquivo, capa);

    const campos = document.createElement('div');
    campos.className = 'publicacao-campos';

    const rotuloTitulo = document.createElement('label');
    rotuloTitulo.className = 'campo';
    rotuloTitulo.innerHTML = '<span>Título da publicação</span>';
    const campoTitulo = document.createElement('input');
    campoTitulo.type = 'text';
    campoTitulo.maxLength = 90;
    campoTitulo.value = item.titulo;
    campoTitulo.addEventListener('input', () => { item.titulo = campoTitulo.value; });
    rotuloTitulo.appendChild(campoTitulo);

    const rotuloPasta = document.createElement('label');
    rotuloPasta.className = 'campo';
    rotuloPasta.innerHTML = '<span>Pasta</span>';
    const seletorPasta = opcoesDePasta(item.pasta);
    seletorPasta.addEventListener('change', () => {
      if (seletorPasta.value !== '__nova__') item.pasta = seletorPasta.value;
    });
    rotuloPasta.appendChild(seletorPasta);

    const rotuloDescricao = document.createElement('label');
    rotuloDescricao.className = 'campo';
    rotuloDescricao.innerHTML = '<span>Descrição (opcional)</span>';
    const campoDescricao = document.createElement('input');
    campoDescricao.type = 'text';
    campoDescricao.maxLength = 160;
    campoDescricao.value = item.descricao || '';
    campoDescricao.addEventListener('input', () => { item.descricao = campoDescricao.value; });
    rotuloDescricao.appendChild(campoDescricao);

    // Capa personalizada (opcional): substitui a 1ª página do PDF na estante.
    const linhaCapa = document.createElement('div');
    linhaCapa.className = 'campo publicacao-linha-capa';
    linhaCapa.innerHTML = '<span>Capa personalizada (opcional)</span>';
    const controlesCapa = document.createElement('div');
    controlesCapa.className = 'publicacao-controles-capa';
    const campoCapa = document.createElement('input');
    campoCapa.type = 'file';
    campoCapa.accept = 'image/png,image/jpeg,image/webp';
    campoCapa.hidden = true;
    const btnCapa = document.createElement('button');
    btnCapa.type = 'button';
    btnCapa.className = 'botao botao-suave';
    btnCapa.textContent = 'Escolher imagem…';
    btnCapa.addEventListener('click', () => campoCapa.click());
    const btnCapaRemover = document.createElement('button');
    btnCapaRemover.type = 'button';
    btnCapaRemover.className = 'botao botao-suave';
    btnCapaRemover.textContent = 'Usar a 1ª página';
    btnCapaRemover.hidden = true;
    campoCapa.addEventListener('change', () => {
      const imagem = campoCapa.files[0];
      campoCapa.value = '';
      if (!imagem) return;
      if (!EXTENSOES_CAPA[imagem.type]) { avisar('Use uma imagem PNG, JPG ou WebP.'); return; }
      if (imagem.size > LIMITE_CAPA) { avisar('A capa deve ter até 2 MB.'); return; }
      item.capaArquivo = imagem;
      const previa = document.createElement('img');
      previa.src = URL.createObjectURL(imagem);
      previa.alt = '';
      capa.replaceChildren(previa);
      btnCapaRemover.hidden = false;
    });
    btnCapaRemover.addEventListener('click', () => {
      delete item.capaArquivo;
      btnCapaRemover.hidden = true;
      capa.innerHTML = '<div class="esqueleto"></div>';
      capaLocal(item.arquivo, capa);
    });
    controlesCapa.append(btnCapa, btnCapaRemover, campoCapa);
    linhaCapa.appendChild(controlesCapa);

    // Permissão de download do PDF no leitor.
    const linhaDownload = document.createElement('label');
    linhaDownload.className = 'campo-check';
    const caixaDownload = document.createElement('input');
    caixaDownload.type = 'checkbox';
    caixaDownload.checked = item.permitirDownload !== false;
    caixaDownload.addEventListener('change', () => { item.permitirDownload = caixaDownload.checked; });
    linhaDownload.append(caixaDownload, document.createTextNode(' Permitir que os clientes baixem o PDF'));

    const nota = document.createElement('p');
    nota.className = 'publicacao-nota';
    nota.textContent = `Arquivo: ${item.nome}`;
    if (item.substitui) {
      nota.textContent += ' · substituirá o catálogo existente com este nome';
      nota.classList.add('publicacao-substitui');
    }

    campos.append(rotuloTitulo, rotuloPasta, rotuloDescricao, linhaCapa, linhaDownload, nota);

    const remover = document.createElement('button');
    remover.className = 'botao botao-perigo publicacao-remover';
    remover.textContent = 'Remover';
    remover.addEventListener('click', () => {
      selecionados = selecionados.filter((s) => s !== item);
      if (selecionados.length === 0) mostrarEtapa('etapa-escolha');
      else desenharConfiguracao();
    });

    cartao.append(capa, campos, remover);
    lista.appendChild(cartao);
  }
}

function receberArquivos(listaDeArquivos) {
  const pdfs = [...listaDeArquivos].filter((a) => /\.pdf$/i.test(a.name));
  if (pdfs.length === 0) { avisar('Envie arquivos PDF.'); return; }
  const grandes = pdfs.filter((a) => a.size > LIMITE_TAMANHO);
  if (grandes.length > 0) {
    avisar(`Acima de 60 MB (comprima antes): ${grandes.map((a) => a.name).join(', ')}`, true);
    return;
  }
  const nomesNoLote = new Set(selecionados.map((s) => s.nome));
  for (const arquivo of pdfs) {
    const nome = nomeSeguro(arquivo.name);
    if (nomesNoLote.has(nome)) continue;
    nomesNoLote.add(nome);
    selecionados.push({
      arquivo,
      nome,
      titulo: tituloDoNome(arquivo.name),
      pasta: '',
      descricao: '',
      substitui: manifesto.catalogos.some((c) => c.arquivo === nome),
    });
  }
  el('campo-arquivo').value = '';
  if (selecionados.length > 0) {
    desenharConfiguracao();
    mostrarEtapa('etapa-config');
  }
}

/* ====== Etapa 3: envio com progresso ====== */

const CIRCUNFERENCIA = 2 * Math.PI * 52;

function definirProgresso(percentual) {
  const barra = el('anel-barra');
  barra.style.strokeDasharray = String(CIRCUNFERENCIA);
  barra.style.strokeDashoffset = String(CIRCUNFERENCIA * (1 - percentual / 100));
  el('anel-percentual').textContent = `${Math.round(percentual)}%`;
}

function fichas(alvo, textoPorItem) {
  const caixa = el(alvo);
  caixa.innerHTML = '';
  for (const item of selecionados) {
    const ficha = document.createElement('div');
    ficha.className = 'ficha-arquivo';
    ficha.innerHTML = `<span class="ficha-icone" aria-hidden="true">📄</span><span>${item.titulo}</span>`;
    const extra = textoPorItem ? textoPorItem(item) : null;
    if (extra) ficha.appendChild(extra);
    caixa.appendChild(ficha);
  }
}

async function publicarAgora() {
  for (const item of selecionados) {
    if (!item.titulo.trim()) { avisar('Todo catálogo precisa de um título.'); return; }
  }
  mostrarEtapa('etapa-envio');
  publicando = true;
  el('envio-fase').textContent = 'ENVIANDO';
  el('envio-nota').hidden = true;
  fichas('fichas-arquivos');
  definirProgresso(2);

  try {
    manifesto = await buscarManifesto();
    definirProgresso(8);

    const mudancas = [];
    const hoje = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < selecionados.length; i += 1) {
      const item = selecionados[i];
      el('envio-detalhe').textContent = selecionados.length === 1
        ? `Enviando ${item.nome}…`
        : `Enviando ${i + 1} de ${selecionados.length} (${item.nome})…`;
      mudancas.push({ caminho: `catalogos/${item.nome}`, conteudoBase64: await arquivoParaBase64(item.arquivo) });

      let entrada = manifesto.catalogos.find((c) => c.arquivo === item.nome);
      if (!entrada) {
        entrada = { arquivo: item.nome, titulo: item.titulo.trim(), adicionadoEm: hoje };
        manifesto.catalogos.push(entrada);
      }
      entrada.titulo = item.titulo.trim();
      if (item.descricao.trim()) entrada.descricao = item.descricao.trim();
      else delete entrada.descricao;
      if (item.pasta) {
        entrada.pasta = item.pasta;
        if (!(manifesto.pastas || []).includes(item.pasta)) {
          manifesto.pastas = [...(manifesto.pastas || []), item.pasta];
        }
      } else {
        delete entrada.pasta;
      }
      if (item.permitirDownload === false) entrada.permitirDownload = false;
      else delete entrada.permitirDownload;
      if (item.capaArquivo) {
        const nomeBase = item.nome.replace(/\.pdf$/i, '');
        const caminhoCapa = `catalogos/capas/${nomeBase}.${EXTENSOES_CAPA[item.capaArquivo.type]}`;
        mudancas.push({ caminho: caminhoCapa, conteudoBase64: await arquivoParaBase64(item.capaArquivo) });
        if (entrada.capa && entrada.capa !== caminhoCapa) {
          mudancas.push({ caminho: entrada.capa, conteudoBase64: null });
        }
        entrada.capa = caminhoCapa;
      }
      delete entrada.lixeira;
      delete entrada.lixeiraEm;
      definirProgresso(8 + ((i + 1) / selecionados.length) * 52);
    }
    mudancas.push({ caminho: 'catalogos.json', conteudoBase64: manifestoParaBase64(manifesto) });

    el('envio-detalhe').textContent = 'Gravando no repositório…';
    await commitar(mudancas, selecionados.length === 1
      ? `Publica o catálogo ${selecionados[0].nome}`
      : `Publica ${selecionados.length} catálogos`);
    publicando = false; // gravado: o site republica sozinho a partir daqui
    definirProgresso(72);

    // Acompanha a publicação do site (workflow) até concluir.
    el('envio-fase').textContent = 'PUBLICANDO';
    el('envio-detalhe').textContent = 'O site está sendo republicado (1–2 minutos)…';
    el('envio-nota').hidden = false;
    let percentual = 72;
    for (let tentativa = 0; tentativa < 40; tentativa += 1) {
      await new Promise((continuar) => { setTimeout(continuar, 6000); });
      percentual = Math.min(percentual + 1.5, 97);
      definirProgresso(percentual);
      try {
        const dados = await gh(`actions/runs?branch=${RAMO}&per_page=1`);
        const run = dados.workflow_runs && dados.workflow_runs[0];
        if (run && run.head_sha === ultimoCommit() && run.status === 'completed') {
          if (run.conclusion === 'success') break;
          throw new Error('a republicação do site falhou — veja a aba Actions.');
        }
      } catch (erro) {
        if (String(erro).includes('falhou')) throw erro;
        // instabilidade de rede no meio do poll: segue tentando
      }
    }

    definirProgresso(100);
    fichas('fichas-sucesso', (item) => {
      const acoes = document.createElement('span');
      acoes.className = 'ficha-acoes';
      const abrir = document.createElement('a');
      abrir.className = 'botao botao-suave';
      abrir.textContent = 'Abrir';
      abrir.target = '_blank';
      abrir.rel = 'noopener';
      abrir.href = `leitor.html?c=${encodeURIComponent(item.nome)}`;
      const copiar = document.createElement('button');
      copiar.className = 'botao botao-suave';
      copiar.textContent = 'Copiar link';
      copiar.addEventListener('click', async () => {
        const url = new URL(`leitor.html?c=${encodeURIComponent(item.nome)}`, location.href).toString();
        try { await navigator.clipboard.writeText(url); avisar('Link copiado!'); } catch { avisar(url, true); }
      });
      acoes.append(abrir, copiar);
      return acoes;
    });
    mostrarEtapa('etapa-sucesso');
  } catch (erro) {
    console.error(erro);
    publicando = false;
    avisar(`Falha na publicação: ${erro.message}`, true);
    mostrarEtapa('etapa-config');
  }
}

/* ====== Início ====== */

function configurarEventos() {
  const zona = el('zona-gigante');
  const campo = el('campo-arquivo');
  el('btn-selecionar').addEventListener('click', (evento) => { evento.stopPropagation(); campo.click(); });
  zona.addEventListener('click', () => campo.click());
  zona.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); campo.click(); }
  });
  campo.addEventListener('change', () => { if (campo.files.length > 0) receberArquivos(campo.files); });
  zona.addEventListener('dragover', (evento) => { evento.preventDefault(); zona.classList.add('arrastando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
  zona.addEventListener('drop', (evento) => {
    evento.preventDefault();
    zona.classList.remove('arrastando');
    if (evento.dataTransfer.files.length > 0) receberArquivos(evento.dataTransfer.files);
  });

  el('btn-voltar-escolha').addEventListener('click', () => mostrarEtapa('etapa-escolha'));
  el('btn-publicar-agora').addEventListener('click', publicarAgora);
  el('btn-enviar-mais').addEventListener('click', () => {
    selecionados = [];
    mostrarEtapa('etapa-escolha');
  });
}

async function iniciar() {
  if (!temToken()) {
    el('sem-chave').hidden = false;
    return;
  }
  document.body.classList.add('conectado');
  configurarEventos();
  try {
    manifesto = await buscarManifesto();
  } catch (erro) {
    console.error(erro);
    el('erro-geral-texto').textContent = `Não foi possível carregar os dados: ${erro.message}`;
    el('erro-geral').hidden = false;
    return;
  }
  if (manifesto.identidade && manifesto.identidade.cor) aplicarCorDeDestaque(manifesto.identidade.cor);
  mostrarEtapa('etapa-escolha');
}

iniciar();
