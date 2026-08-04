// Minhas Estantes: crie e gerencie várias estantes públicas.
// Cada catálogo pertence a uma estante (sem o campo = principal).
import {
  temToken, buscarManifesto, manifestoParaBase64, commitar, aplicarCorDeDestaque,
  dataLegivel, arquivoParaBase64,
} from './nucleo-admin.js';
import { pedirTexto, confirmar } from './dialogo.js';

const el = (id) => document.getElementById(id);

const PADRAO_PRIMARIA = '#88da10';
const PADRAO_SECUNDARIA = '#0b0d08';
const PADRAO_FUNDO = '#000000';

// Cores efetivas de uma estante: as dela > padrão do tema.
// (A principal guarda as suas na identidade do manifesto.)
function coresDe(info, ehPrincipal) {
  const proprio = ehPrincipal ? (manifesto.identidade || {}) : info;
  return {
    primaria: proprio.cor || PADRAO_PRIMARIA,
    secundaria: proprio.corSecundaria || PADRAO_SECUNDARIA,
    fundo: proprio.corFundo || PADRAO_FUNDO,
  };
}

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
  const capa = capaDe(info, ehPrincipal);
  icone.innerHTML = capa
    ? `<img src="${capa}" alt="">`
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M4 16h16"/><path d="M9 4v6M15 10v6"/></svg>';
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

let personalizando = null;   // { info, ehPrincipal }
let capaNova = null;         // imagem escolhida, ainda não salva
let removerCapa = false;
const EXTENSOES_CAPA = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function capaDe(info, ehPrincipal) {
  return ehPrincipal ? (manifesto.identidade || {}).capa : info.capa;
}

function mostrarCapaDialogo() {
  const { info, ehPrincipal } = personalizando;
  const previa = el('personalizar-capa-previa');
  const remover = el('personalizar-capa-remover');
  if (capaNova) {
    previa.src = URL.createObjectURL(capaNova);
    previa.hidden = false;
    remover.hidden = false;
  } else if (capaDe(info, ehPrincipal) && !removerCapa) {
    previa.src = capaDe(info, ehPrincipal);
    previa.hidden = false;
    remover.hidden = false;
  } else {
    previa.hidden = true;
    remover.hidden = true;
  }
}

const PARES_DE_COR = [
  ['personalizar-cor', 'personalizar-cor-hex'],
  ['personalizar-cor-secundaria', 'personalizar-cor-secundaria-hex'],
  ['personalizar-cor-fundo', 'personalizar-cor-fundo-hex'],
];

// Mantém o seletor e o campo hex sempre iguais, nos dois sentidos.
function ligarCampoHex(idCor, idHex) {
  const cor = el(idCor);
  const hex = el(idHex);
  cor.addEventListener('input', () => { hex.value = cor.value; });
  hex.addEventListener('input', () => {
    let valor = hex.value.trim().toLowerCase();
    if (valor && !valor.startsWith('#')) valor = `#${valor}`;
    if (/^#[0-9a-f]{6}$/.test(valor)) cor.value = valor;
  });
  hex.addEventListener('blur', () => { hex.value = cor.value; });
}

function personalizar(info, ehPrincipal) {
  personalizando = { info, ehPrincipal };
  el('personalizar-titulo').textContent = `Personalizar "${info.nome}"`;
  el('personalizar-nome').value = info.nome;
  el('personalizar-descricao').value = ehPrincipal ? (manifesto.descricao || '') : (info.descricao || '');
  const cores = coresDe(info, ehPrincipal);
  el('personalizar-cor').value = cores.primaria;
  el('personalizar-cor-secundaria').value = cores.secundaria;
  el('personalizar-cor-fundo').value = cores.fundo;
  for (const [idCor, idHex] of PARES_DE_COR) el(idHex).value = el(idCor).value;
  el('personalizar-erro').hidden = true;
  capaNova = null;
  removerCapa = false;
  mostrarCapaDialogo();
  el('dialogo-personalizar').showModal();
}

function salvarPersonalizar() {
  const { info, ehPrincipal } = personalizando;
  const nome = el('personalizar-nome').value.trim();
  if (!nome) {
    el('personalizar-erro').textContent = 'Preencha o nome.';
    el('personalizar-erro').hidden = false;
    return;
  }
  const descricao = el('personalizar-descricao').value.trim();
  const primaria = el('personalizar-cor').value.toLowerCase();
  const secundaria = el('personalizar-cor-secundaria').value.toLowerCase();
  const fundo = el('personalizar-cor-fundo').value.toLowerCase();
  el('dialogo-personalizar').close();
  const novaCapa = capaNova;
  const capaRemovida = removerCapa;
  executar('Não foi possível personalizar', async () => {
    manifesto = await buscarManifesto();
    const mudancas = [];
    // Grava a cor só quando difere do que a estante herdaria sem ela.
    const aplicarCores = (alvo, herdadas) => {
      if (primaria !== herdadas.primaria) alvo.cor = primaria;
      else delete alvo.cor;
      if (secundaria !== herdadas.secundaria) alvo.corSecundaria = secundaria;
      else delete alvo.corSecundaria;
      if (fundo !== herdadas.fundo) alvo.corFundo = fundo;
      else delete alvo.corFundo;
    };
    if (ehPrincipal) {
      manifesto.titulo = nome;
      if (descricao) manifesto.descricao = descricao;
      else delete manifesto.descricao;
      manifesto.identidade = { ...(manifesto.identidade || {}) };
      aplicarCores(manifesto.identidade, {
        primaria: PADRAO_PRIMARIA, secundaria: PADRAO_SECUNDARIA, fundo: PADRAO_FUNDO,
      });
    } else {
      const alvo = estantes().find((e) => e.id === info.id);
      if (!alvo) throw new Error('estante não encontrada.');
      alvo.nome = nome;
      if (descricao) alvo.descricao = descricao;
      else delete alvo.descricao;
      aplicarCores(alvo, {
        primaria: PADRAO_PRIMARIA, secundaria: PADRAO_SECUNDARIA, fundo: PADRAO_FUNDO,
      });
    }
    // Capa: grava/remove a imagem no mesmo commit.
    const donoDaCapa = ehPrincipal
      ? (manifesto.identidade = { ...(manifesto.identidade || {}) })
      : estantes().find((e) => e.id === info.id);
    const idDaCapa = ehPrincipal ? 'principal' : info.id;
    if (novaCapa) {
      const caminho = `assets/estantes/${idDaCapa}.${EXTENSOES_CAPA[novaCapa.type]}`;
      mudancas.push({ caminho, conteudoBase64: await arquivoParaBase64(novaCapa) });
      if (donoDaCapa.capa && donoDaCapa.capa !== caminho) {
        mudancas.push({ caminho: donoDaCapa.capa, conteudoBase64: null });
      }
      donoDaCapa.capa = caminho;
    } else if (capaRemovida && donoDaCapa.capa) {
      mudancas.push({ caminho: donoDaCapa.capa, conteudoBase64: null });
      delete donoDaCapa.capa;
    }

    mudancas.push({ caminho: 'catalogos.json', conteudoBase64: manifestoParaBase64(manifesto) });
    await commitar(mudancas, `Personaliza a estante "${nome}"`);
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
  el('personalizar-cancelar').addEventListener('click', () => el('dialogo-personalizar').close());
  el('personalizar-salvar').addEventListener('click', salvarPersonalizar);
  el('personalizar-capa-escolher').addEventListener('click', () => el('personalizar-capa-arquivo').click());
  el('personalizar-capa-arquivo').addEventListener('change', () => {
    const imagem = el('personalizar-capa-arquivo').files[0];
    el('personalizar-capa-arquivo').value = '';
    if (!imagem) return;
    if (!EXTENSOES_CAPA[imagem.type]) { avisar('Use uma imagem PNG, JPG ou WebP.'); return; }
    if (imagem.size > 2 * 1024 * 1024) { avisar('A capa deve ter até 2 MB.'); return; }
    capaNova = imagem;
    removerCapa = false;
    mostrarCapaDialogo();
  });
  el('personalizar-capa-remover').addEventListener('click', () => {
    capaNova = null;
    removerCapa = true;
    mostrarCapaDialogo();
  });
  for (const [idCor, idHex] of PARES_DE_COR) ligarCampoHex(idCor, idHex);

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
