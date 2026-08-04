// Minhas Estantes: crie e gerencie várias estantes públicas.
// Cada catálogo pertence a uma estante (sem o campo = principal).
import {
  temToken, buscarManifesto, manifestoParaBase64, commitar, aplicarCorDeDestaque,
  dataLegivel,
} from './nucleo-admin.js';
import { pedirTexto, pedirNomeDescricao, confirmar } from './dialogo.js';

const el = (id) => document.getElementById(id);

let manifesto = null;
let termoBusca = '';
let estanteDoDialogo = null;

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

function idDeNome(nome) {
  const base = normalizar(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'estante';
}

function estantes() {
  return manifesto.estantes || [];
}

function catalogosDe(idEstante) {
  return manifesto.catalogos.filter((c) => !c.lixeira && (c.estante || 'principal') === idEstante);
}

async function salvarManifesto(mensagem) {
  await commitar(
    [{ caminho: 'catalogos.json', conteudoBase64: manifestoParaBase64(manifesto) }],
    mensagem,
  );
}

async function executar(mensagemErro, acao) {
  try {
    await acao();
    desenhar();
  } catch (erro) {
    console.error(erro);
    avisar(`${mensagemErro}: ${erro.message}`, true);
  }
}

/* ====== Lista ====== */

function linhaDeEstante(info, ehPrincipal) {
  const linha = document.createElement('div');
  linha.className = 'linha-estante';

  const identidade = document.createElement('div');
  identidade.className = 'estante-identidade';
  const icone = document.createElement('span');
  icone.className = 'estante-icone';
  icone.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M4 16h16"/><path d="M9 4v6M15 10v6"/></svg>';
  const textos = document.createElement('div');
  const nome = document.createElement('strong');
  nome.textContent = info.nome;
  if (ehPrincipal) {
    const selo = document.createElement('span');
    selo.className = 'selo-plano';
    selo.textContent = 'Principal';
    nome.appendChild(selo);
  }
  const url = new URL(ehPrincipal ? 'estante.html' : `estante.html?e=${encodeURIComponent(info.id)}`, location.href).toString();
  const ligacao = document.createElement('a');
  ligacao.href = url;
  ligacao.target = '_blank';
  ligacao.rel = 'noopener';
  ligacao.textContent = url.replace(/^https?:\/\//, '');
  const meta = document.createElement('p');
  const quantos = catalogosDe(info.id).length;
  meta.textContent = `${quantos === 1 ? '1 flipbook' : `${quantos} flipbooks`}${info.criadaEm ? ` · criada em ${dataLegivel(info.criadaEm)}` : ''}`;
  textos.append(nome, ligacao, meta);
  identidade.append(icone, textos);

  const acoes = document.createElement('div');
  acoes.className = 'estante-acoes';

  const criarBotao = (rotulo, classe, acao) => {
    const botao = document.createElement('button');
    botao.className = `botao ${classe}`;
    botao.textContent = rotulo;
    botao.addEventListener('click', acao);
    acoes.appendChild(botao);
    return botao;
  };

  criarBotao('Adicionar flipbooks', 'botao-suave', () => abrirDialogoCatalogos(info, ehPrincipal));
  criarBotao('Personalizar', 'botao-suave', () => personalizar(info, ehPrincipal));
  criarBotao('Copiar link', 'botao-suave', async () => {
    try { await navigator.clipboard.writeText(url); avisar('Link copiado!'); } catch { avisar(url, true); }
  });
  if (!ehPrincipal) {
    criarBotao('Excluir', 'botao-perigo', () => excluir(info));
  }

  linha.append(identidade, acoes);
  return linha;
}

function desenhar() {
  const lista = el('lista-estantes');
  lista.innerHTML = '';
  const principal = { id: 'principal', nome: manifesto.titulo || 'Catálogos' };
  const todas = [
    { info: principal, ehPrincipal: true },
    ...estantes().map((e) => ({ info: e, ehPrincipal: false })),
  ].filter(({ info }) => !termoBusca || normalizar(info.nome).includes(normalizar(termoBusca)));

  for (const { info, ehPrincipal } of todas) {
    lista.appendChild(linhaDeEstante(info, ehPrincipal));
  }
  if (todas.length === 0) {
    lista.innerHTML = '<p class="lista-vazia">Nenhuma estante encontrada.</p>';
  }
}

/* ====== Ações ====== */

async function novaEstante() {
  const nome = await pedirTexto({
    titulo: 'Nova estante',
    rotulo: 'Nome da estante',
    confirmarRotulo: 'Criar estante',
    texto: 'Ela ganha um link próprio para compartilhar com os clientes.',
  });
  if (!nome) return;
  executar('Não foi possível criar a estante', async () => {
    manifesto = await buscarManifesto();
    let id = idDeNome(nome);
    const existentes = new Set(['principal', ...estantes().map((e) => e.id)]);
    let sufixo = 2;
    while (existentes.has(id)) id = `${idDeNome(nome)}-${sufixo++}`;
    manifesto.estantes = [...estantes(), {
      id,
      nome,
      criadaEm: new Date().toISOString().slice(0, 10),
    }];
    await salvarManifesto(`Cria a estante "${nome}"`);
    avisar(`Estante "${nome}" criada — use "Adicionar flipbooks" para montá-la.`, true);
  });
}

async function personalizar(info, ehPrincipal) {
  const descricaoAtual = ehPrincipal ? (manifesto.descricao || '') : (info.descricao || '');
  const resposta = await pedirNomeDescricao({
    titulo: `Personalizar "${info.nome}"`,
    valorNome: info.nome,
    valorDescricao: descricaoAtual,
    confirmarRotulo: 'Salvar',
    texto: 'O nome e a descrição aparecem no topo da estante pública.',
  });
  if (!resposta) return;
  const { nome, descricao } = resposta;
  executar('Não foi possível personalizar', async () => {
    manifesto = await buscarManifesto();
    if (ehPrincipal) {
      manifesto.titulo = nome;
      if (descricao) manifesto.descricao = descricao;
      else delete manifesto.descricao;
    } else {
      const alvo = estantes().find((e) => e.id === info.id);
      if (!alvo) throw new Error('estante não encontrada.');
      alvo.nome = nome;
      if (descricao) alvo.descricao = descricao;
      else delete alvo.descricao;
    }
    await salvarManifesto(`Personaliza a estante "${nome}"`);
    avisar('Estante atualizada!');
  });
}

async function excluir(info) {
  const quantos = catalogosDe(info.id).length;
  const aceitou = await confirmar({
    titulo: `Excluir a estante "${info.nome}"?`,
    texto: quantos > 0
      ? `Os ${quantos} flipbook(s) dela voltam para a estante principal — nada é apagado.`
      : 'A estante está vazia.',
    confirmarRotulo: 'Excluir estante',
    perigo: true,
  });
  if (!aceitou) return;
  executar('Não foi possível excluir', async () => {
    manifesto = await buscarManifesto();
    manifesto.estantes = estantes().filter((e) => e.id !== info.id);
    for (const c of manifesto.catalogos) if (c.estante === info.id) delete c.estante;
    await salvarManifesto(`Exclui a estante "${info.nome}"`);
    avisar('Estante excluída — os flipbooks voltaram para a principal.');
  });
}

/* ====== Diálogo de catálogos ====== */

function abrirDialogoCatalogos(info, ehPrincipal) {
  estanteDoDialogo = { info, ehPrincipal };
  el('dialogo-catalogos-titulo').textContent = `Flipbooks em "${info.nome}"`;
  const opcoes = el('opcoes-catalogos');
  opcoes.innerHTML = '';
  const ativos = manifesto.catalogos.filter((c) => !c.lixeira);
  if (ativos.length === 0) {
    opcoes.innerHTML = '<p class="lista-vazia">Nenhum flipbook publicado ainda.</p>';
  }
  for (const catalogo of ativos) {
    const opcao = document.createElement('label');
    opcao.className = 'campo-check';
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.dataset.arquivo = catalogo.arquivo;
    caixa.checked = (catalogo.estante || 'principal') === info.id;
    opcao.append(caixa, document.createTextNode(` ${catalogo.titulo}`));
    opcoes.appendChild(opcao);
  }
  el('dialogo-catalogos').showModal();
}

function salvarDialogoCatalogos() {
  const { info } = estanteDoDialogo;
  const caixas = [...el('opcoes-catalogos').querySelectorAll('input[type="checkbox"]')];
  el('dialogo-catalogos').close();
  executar('Não foi possível salvar', async () => {
    manifesto = await buscarManifesto();
    for (const caixa of caixas) {
      const entrada = manifesto.catalogos.find((c) => c.arquivo === caixa.dataset.arquivo);
      if (!entrada) continue;
      const pertencia = (entrada.estante || 'principal') === info.id;
      if (caixa.checked && !pertencia) {
        if (info.id === 'principal') delete entrada.estante;
        else entrada.estante = info.id;
      } else if (!caixa.checked && pertencia && info.id !== 'principal') {
        delete entrada.estante;
      }
    }
    await salvarManifesto(`Atualiza os catálogos da estante "${info.nome}"`);
    avisar('Estante atualizada!');
  });
}

/* ====== Início ====== */

async function iniciar() {
  if (!temToken()) {
    el('sem-chave').hidden = false;
    return;
  }
  document.body.classList.add('conectado');
  el('busca-estantes').addEventListener('input', (evento) => {
    termoBusca = evento.target.value.trim();
    desenhar();
  });
  el('btn-nova-estante').addEventListener('click', novaEstante);
  el('catalogos-cancelar').addEventListener('click', () => el('dialogo-catalogos').close());
  el('catalogos-salvar').addEventListener('click', salvarDialogoCatalogos);

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
