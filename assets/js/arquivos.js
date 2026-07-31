// Meus Arquivos: gerenciador de publicações do painel — pastas, busca,
// ordenação e lixeira (enviar, restaurar e excluir definitivamente).
import {
  temToken, buscarManifesto, manifestoParaBase64, commitar, aplicarCorDeDestaque,
} from './nucleo-admin.js';
import * as pdfjs from '../vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).toString();

const LARGURA_CAPA = Math.min(420, Math.round(200 * Math.min(window.devicePixelRatio || 1, 2)));
const el = (id) => document.getElementById(id);

let manifesto = null;
let aba = 'arquivos';        // 'arquivos' | 'lixeira'
let pastaAtual = null;       // nome da pasta aberta (ou null = raiz)
let termoBusca = '';
let ordem = 'recentes';
const capasProntas = new Map();   // arquivo -> dataURL

let temporizadorToast = null;
function avisar(texto, demorado = false) {
  const toast = el('toast');
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { toast.hidden = true; }, demorado ? 6000 : 3000);
}

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function pastas() {
  return manifesto.pastas || [];
}

function catalogosDe(nomePasta) {
  return manifesto.catalogos.filter((c) => !c.lixeira && c.pasta === nomePasta);
}

async function salvarManifesto(mensagem, mudancasExtras = []) {
  await commitar(
    [...mudancasExtras, { caminho: 'catalogos.json', conteudoBase64: manifestoParaBase64(manifesto) }],
    mensagem,
  );
}

/* ====== Capas ====== */

const filaCapas = [];
let desenhandoCapas = false;

function agendarCapa(catalogo, alvo) {
  filaCapas.push({ catalogo, alvo });
  if (!desenhandoCapas) processarCapas();
}

async function processarCapas() {
  desenhandoCapas = true;
  while (filaCapas.length > 0) {
    const { catalogo, alvo } = filaCapas.shift();
    if (!alvo.isConnected) continue;
    try {
      let capa = capasProntas.get(catalogo.arquivo);
      if (!capa) {
        const tarefa = pdfjs.getDocument({
          url: `catalogos/${encodeURIComponent(catalogo.arquivo)}`,
          disableAutoFetch: true,
        });
        const pdf = await tarefa.promise;
        const pagina = await pdf.getPage(1);
        const base = pagina.getViewport({ scale: 1 });
        const viewport = pagina.getViewport({ scale: LARGURA_CAPA / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const contexto = canvas.getContext('2d');
        contexto.fillStyle = '#ffffff';
        contexto.fillRect(0, 0, canvas.width, canvas.height);
        await pagina.render({ canvasContext: contexto, viewport }).promise;
        capa = canvas.toDataURL('image/jpeg', 0.8);
        capasProntas.set(catalogo.arquivo, capa);
        tarefa.destroy().catch(() => {});
      }
      const img = document.createElement('img');
      img.src = capa;
      img.alt = '';
      alvo.replaceChildren(img);
    } catch (erro) {
      console.warn(`Sem capa para ${catalogo.arquivo}`, erro);
      alvo.querySelector('.esqueleto')?.remove();
    }
  }
  desenhandoCapas = false;
}

/* ====== Renderização ====== */

function listaVisivel() {
  let itens = manifesto.catalogos.filter((c) => Boolean(c.lixeira) === (aba === 'lixeira'));
  if (aba === 'arquivos' && pastaAtual) itens = itens.filter((c) => c.pasta === pastaAtual);
  if (aba === 'arquivos' && !pastaAtual && !termoBusca) itens = itens.filter((c) => !c.pasta);
  if (termoBusca) itens = itens.filter((c) => normalizar(c.titulo).includes(normalizar(termoBusca)));
  return itens.sort((a, b) => ordem === 'nome'
    ? a.titulo.localeCompare(b.titulo, 'pt-BR')
    : (b.adicionadoEm || '').localeCompare(a.adicionadoEm || '') || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

function desenharPastas() {
  const grade = el('grade-pastas');
  grade.innerHTML = '';
  const mostrar = aba === 'arquivos' && !pastaAtual && !termoBusca;
  grade.hidden = !mostrar;
  if (!mostrar) return;
  for (const nome of [...pastas()].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
    const cartao = document.createElement('button');
    cartao.className = 'cartao-pasta';
    cartao.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
    const rotulo = document.createElement('span');
    rotulo.className = 'pasta-nome';
    rotulo.textContent = nome;
    const quantidade = document.createElement('span');
    quantidade.className = 'pasta-conta';
    const n = catalogosDe(nome).length;
    quantidade.textContent = n === 1 ? '1 arquivo' : `${n} arquivos`;
    cartao.append(rotulo, quantidade);
    cartao.addEventListener('click', () => { pastaAtual = nome; desenhar(); });
    grade.appendChild(cartao);
  }
}

function botaoAcao(rotulo, classe, acao) {
  const botao = document.createElement('button');
  botao.className = `botao ${classe}`;
  botao.textContent = rotulo;
  botao.addEventListener('click', acao);
  return botao;
}

function desenharArquivos() {
  const grade = el('grade-arquivos');
  grade.innerHTML = '';
  const itens = listaVisivel();

  for (const catalogo of itens) {
    const cartao = document.createElement('div');
    cartao.className = 'cartao-arquivo';

    const capa = document.createElement('a');
    capa.className = 'arquivo-capa';
    capa.href = `leitor.html?c=${encodeURIComponent(catalogo.arquivo)}`;
    capa.target = '_blank';
    capa.rel = 'noopener';
    capa.innerHTML = '<div class="esqueleto"></div>';
    agendarCapa(catalogo, capa);

    const info = document.createElement('div');
    info.className = 'arquivo-info';
    const titulo = document.createElement('h3');
    titulo.textContent = catalogo.titulo;
    const meta = document.createElement('p');
    meta.textContent = catalogo.lixeira
      ? `na lixeira desde ${catalogo.lixeiraEm || '—'}`
      : `${catalogo.adicionadoEm || '—'}${catalogo.pasta && !pastaAtual ? ` · ${catalogo.pasta}` : ''}`;
    info.append(titulo, meta);

    const acoes = document.createElement('div');
    acoes.className = 'arquivo-acoes';
    if (aba === 'arquivos') {
      acoes.append(
        botaoAcao('Mover', 'botao-suave', () => abrirMover(catalogo)),
        botaoAcao('Lixeira', 'botao-perigo', () => enviarParaLixeira(catalogo)),
      );
    } else {
      acoes.append(
        botaoAcao('Restaurar', 'botao-suave', () => restaurar(catalogo)),
        botaoAcao('Excluir', 'botao-perigo', () => excluirDefinitivo(catalogo)),
      );
    }

    cartao.append(capa, info, acoes);
    grade.appendChild(cartao);
  }

  const vazio = el('vazio');
  const temPastasVisiveis = !el('grade-pastas').hidden && el('grade-pastas').children.length > 0;
  vazio.hidden = itens.length > 0 || temPastasVisiveis;
  if (!vazio.hidden) {
    if (termoBusca) {
      el('vazio-titulo').textContent = 'Nada encontrado';
      el('vazio-texto').textContent = 'Tente pesquisar por outro nome.';
      el('btn-enviar-agora').hidden = true;
    } else if (aba === 'lixeira') {
      el('vazio-titulo').textContent = 'A lixeira está vazia';
      el('vazio-texto').textContent = 'Arquivos enviados para a lixeira aparecem aqui.';
      el('btn-enviar-agora').hidden = true;
    } else if (pastaAtual) {
      el('vazio-titulo').textContent = 'Pasta vazia';
      el('vazio-texto').textContent = 'Use "Mover" em um arquivo para trazê-lo para cá.';
      el('btn-enviar-agora').hidden = true;
    } else {
      el('vazio-titulo').textContent = 'Ainda não há arquivos';
      el('vazio-texto').textContent = 'Envie o primeiro catálogo pelo painel.';
      el('btn-enviar-agora').hidden = false;
    }
  }
}

function desenhar() {
  el('aba-arquivos').classList.toggle('ativa', aba === 'arquivos');
  el('aba-lixeira').classList.toggle('ativa', aba === 'lixeira');
  const naLixeira = manifesto.catalogos.filter((c) => c.lixeira).length;
  el('conta-lixeira').textContent = String(naLixeira);
  el('conta-lixeira').hidden = naLixeira === 0;

  el('trilha').hidden = !(aba === 'arquivos' && pastaAtual);
  if (pastaAtual) el('pasta-atual').textContent = pastaAtual;
  el('btn-nova-pasta').hidden = aba === 'lixeira' || Boolean(pastaAtual);
  el('rodape-lixeira').hidden = !(aba === 'lixeira' && naLixeira > 0);

  desenharPastas();
  desenharArquivos();
}

/* ====== Ações ====== */

async function executar(mensagemErro, acao) {
  try {
    await acao();
    desenhar();
  } catch (erro) {
    console.error(erro);
    avisar(`${mensagemErro}: ${erro.message}`, true);
  }
}

function enviarParaLixeira(catalogo) {
  executar('Não foi possível mover para a lixeira', async () => {
    manifesto = await buscarManifesto();
    const entrada = manifesto.catalogos.find((c) => c.arquivo === catalogo.arquivo);
    if (!entrada) throw new Error('arquivo não encontrado no manifesto.');
    entrada.lixeira = true;
    entrada.lixeiraEm = new Date().toISOString().slice(0, 10);
    await salvarManifesto(`Envia "${entrada.titulo}" para a lixeira`);
    avisar('Enviado para a lixeira — some da estante em 1–2 minutos.');
  });
}

function restaurar(catalogo) {
  executar('Não foi possível restaurar', async () => {
    manifesto = await buscarManifesto();
    const entrada = manifesto.catalogos.find((c) => c.arquivo === catalogo.arquivo);
    if (!entrada) throw new Error('arquivo não encontrado no manifesto.');
    delete entrada.lixeira;
    delete entrada.lixeiraEm;
    await salvarManifesto(`Restaura "${entrada.titulo}" da lixeira`);
    avisar('Restaurado! Volta à estante em 1–2 minutos.');
  });
}

function excluirDefinitivo(catalogo) {
  if (!window.confirm(`Excluir "${catalogo.titulo}" DEFINITIVAMENTE?\n\nO PDF sai do repositório e não dá para desfazer.`)) return;
  executar('Não foi possível excluir', async () => {
    manifesto = await buscarManifesto();
    manifesto.catalogos = manifesto.catalogos.filter((c) => c.arquivo !== catalogo.arquivo);
    await salvarManifesto(
      `Exclui definitivamente "${catalogo.titulo}"`,
      [{ caminho: `catalogos/${catalogo.arquivo}`, conteudoBase64: null }],
    );
    avisar('Excluído definitivamente.');
  });
}

function esvaziarLixeira() {
  const presos = manifesto.catalogos.filter((c) => c.lixeira);
  if (presos.length === 0) return;
  if (!window.confirm(`Excluir DEFINITIVAMENTE os ${presos.length} item(ns) da lixeira?\n\nNão dá para desfazer.`)) return;
  executar('Não foi possível esvaziar a lixeira', async () => {
    manifesto = await buscarManifesto();
    const naLixeira = manifesto.catalogos.filter((c) => c.lixeira);
    manifesto.catalogos = manifesto.catalogos.filter((c) => !c.lixeira);
    await salvarManifesto(
      `Esvazia a lixeira (${naLixeira.length} arquivo(s))`,
      naLixeira.map((c) => ({ caminho: `catalogos/${c.arquivo}`, conteudoBase64: null })),
    );
    avisar('Lixeira esvaziada.');
  });
}

/* ====== Pastas ====== */

function novaPasta() {
  const nome = (window.prompt('Nome da nova pasta:') || '').trim();
  if (!nome) return;
  if (pastas().some((p) => p.toLowerCase() === nome.toLowerCase())) {
    avisar('Já existe uma pasta com esse nome.');
    return;
  }
  executar('Não foi possível criar a pasta', async () => {
    manifesto = await buscarManifesto();
    manifesto.pastas = [...(manifesto.pastas || []), nome];
    await salvarManifesto(`Cria a pasta "${nome}"`);
    avisar(`Pasta "${nome}" criada.`);
  });
}

function renomearPasta() {
  const novo = (window.prompt('Novo nome da pasta:', pastaAtual) || '').trim();
  if (!novo || novo === pastaAtual) return;
  executar('Não foi possível renomear', async () => {
    const antigo = pastaAtual;
    manifesto = await buscarManifesto();
    manifesto.pastas = (manifesto.pastas || []).map((p) => (p === antigo ? novo : p));
    for (const c of manifesto.catalogos) if (c.pasta === antigo) c.pasta = novo;
    await salvarManifesto(`Renomeia a pasta "${antigo}" para "${novo}"`);
    pastaAtual = novo;
    avisar('Pasta renomeada.');
  });
}

function excluirPasta() {
  const quantos = catalogosDe(pastaAtual).length;
  const aviso = quantos > 0
    ? `Excluir a pasta "${pastaAtual}"?\n\nOs ${quantos} arquivo(s) dela voltam para "Meus Arquivos" (nada é apagado).`
    : `Excluir a pasta vazia "${pastaAtual}"?`;
  if (!window.confirm(aviso)) return;
  executar('Não foi possível excluir a pasta', async () => {
    const alvo = pastaAtual;
    manifesto = await buscarManifesto();
    manifesto.pastas = (manifesto.pastas || []).filter((p) => p !== alvo);
    for (const c of manifesto.catalogos) if (c.pasta === alvo) delete c.pasta;
    await salvarManifesto(`Exclui a pasta "${alvo}"`);
    pastaAtual = null;
    avisar('Pasta excluída — os arquivos voltaram para a raiz.');
  });
}

function abrirMover(catalogo) {
  const opcoes = el('opcoes-pasta');
  opcoes.innerHTML = '';
  const destinos = [...pastas()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const criar = (rotulo, destino) => {
    const botao = document.createElement('button');
    botao.className = 'opcao-pasta';
    botao.textContent = rotulo;
    if ((catalogo.pasta || null) === destino) botao.classList.add('atual');
    botao.addEventListener('click', () => {
      el('dialogo-mover').close();
      moverPara(catalogo, destino);
    });
    opcoes.appendChild(botao);
  };

  criar('Meus Arquivos (sem pasta)', null);
  for (const nome of destinos) criar(nome, nome);

  const nova = document.createElement('button');
  nova.className = 'opcao-pasta opcao-nova';
  nova.textContent = '+ Nova pasta…';
  nova.addEventListener('click', () => {
    el('dialogo-mover').close();
    const nome = (window.prompt('Nome da nova pasta:') || '').trim();
    if (nome) moverPara(catalogo, nome, true);
  });
  opcoes.appendChild(nova);

  el('dialogo-mover').showModal();
}

function moverPara(catalogo, destino, criarPasta = false) {
  executar('Não foi possível mover', async () => {
    manifesto = await buscarManifesto();
    if (criarPasta && !(manifesto.pastas || []).includes(destino)) {
      manifesto.pastas = [...(manifesto.pastas || []), destino];
    }
    const entrada = manifesto.catalogos.find((c) => c.arquivo === catalogo.arquivo);
    if (!entrada) throw new Error('arquivo não encontrado no manifesto.');
    if (destino) entrada.pasta = destino;
    else delete entrada.pasta;
    await salvarManifesto(destino
      ? `Move "${entrada.titulo}" para a pasta "${destino}"`
      : `Move "${entrada.titulo}" para fora das pastas`);
    avisar(destino ? `Movido para "${destino}".` : 'Movido para Meus Arquivos.');
  });
}

/* ====== Início ====== */

function configurarEventos() {
  el('aba-arquivos').addEventListener('click', () => { aba = 'arquivos'; pastaAtual = null; desenhar(); });
  el('aba-lixeira').addEventListener('click', () => { aba = 'lixeira'; pastaAtual = null; desenhar(); });
  el('voltar-raiz').addEventListener('click', () => { pastaAtual = null; desenhar(); });
  el('busca-arquivos').addEventListener('input', (evento) => {
    termoBusca = evento.target.value.trim();
    desenhar();
  });
  el('ordenar').addEventListener('change', (evento) => { ordem = evento.target.value; desenhar(); });
  el('btn-nova-pasta').addEventListener('click', novaPasta);
  el('btn-renomear-pasta').addEventListener('click', renomearPasta);
  el('btn-excluir-pasta').addEventListener('click', excluirPasta);
  el('btn-esvaziar').addEventListener('click', esvaziarLixeira);
  el('mover-cancelar').addEventListener('click', () => el('dialogo-mover').close());
}

async function iniciar() {
  if (!temToken()) {
    el('sem-chave').hidden = false;
    return;
  }
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
  el('gerenciador').hidden = false;
  desenhar();
}

iniciar();
