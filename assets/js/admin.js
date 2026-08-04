// Página de gestão da estante (painel): usa o núcleo compartilhado para
// falar com a API do GitHub. A chave de acesso fica só neste navegador.
import {
  dono, repo, RAMO, gh, commitar, buscarManifesto, manifestoParaBase64,
  definirToken, temToken, ultimoCommit, aplicarCorDeDestaque,
} from './nucleo-admin.js';

const el = (id) => document.getElementById(id);

let manifesto = null;

async function carregarManifesto() {
  manifesto = await buscarManifesto();
}

function manifestoBase64() {
  return manifestoParaBase64(manifesto);
}

/* ====== Utilidades ====== */

let temporizadorToast = null;
function avisar(texto, demorado = false) {
  const toast = el('toast');
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { toast.hidden = true; }, demorado ? 6000 : 3000);
}

/* ====== Telas ====== */

function mostrarErroGeral(texto) {
  el('tela-token').hidden = true;
  el('tela-gestao').hidden = true;
  el('erro-geral-texto').textContent = texto;
  el('erro-geral').hidden = false;
}

function mostrarTelaToken(mensagemErro = '') {
  el('tela-gestao').hidden = true;
  el('btn-conta').hidden = true;
  el('btn-notificacoes').hidden = true;
  el('painel-notificacoes').hidden = true;
  fecharMenuConta();
  document.body.classList.remove('conectado');
  el('tela-token').hidden = false;
  el('nome-repo-passo').textContent = `${dono}/${repo}`;
  el('link-upload-github').href = `https://github.com/${dono}/${repo}/upload/${RAMO}/catalogos`;
  const erro = el('erro-token');
  erro.textContent = mensagemErro;
  erro.hidden = !mensagemErro;
}

function nomeDoPerfil() {
  return ((manifesto.perfil && manifesto.perfil.nome) || manifesto.painelNome || '').trim();
}

function saudar() {
  const agora = new Date();
  const hora = agora.getHours();
  const periodo = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = nomeDoPerfil();
  el('saudacao-titulo').textContent = nome ? `${periodo}, ${nome}!` : `${periodo}!`;
}

function iniciaisDoNome(nome) {
  const palavras = nome.split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return '•';
  return palavras.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function atualizarConta() {
  const nome = nomeDoPerfil();
  const identidade = manifesto.identidade || {};
  const botao = el('btn-conta');
  botao.hidden = false;
  if (identidade.logo) {
    botao.textContent = '';
    botao.style.backgroundImage = `url("${identidade.logo}")`;
    el('conta-avatar').textContent = '';
    el('conta-avatar').style.backgroundImage = `url("${identidade.logo}")`;
  } else {
    botao.style.backgroundImage = '';
    botao.textContent = iniciaisDoNome(nome || manifesto.titulo || 'C');
    el('conta-avatar').style.backgroundImage = '';
    el('conta-avatar').textContent = iniciaisDoNome(nome || manifesto.titulo || 'C');
  }
  el('conta-nome').textContent = nome || manifesto.titulo || 'Meu perfil';
  const email = (manifesto.perfil && manifesto.perfil.email) || '';
  el('conta-email').textContent = email;
  el('conta-email').hidden = !email;
}

async function mostrarTelaGestao() {
  el('tela-token').hidden = true;
  el('tela-gestao').hidden = false;
  document.body.classList.add('conectado');
  await carregarManifesto();
  if (manifesto.identidade && manifesto.identidade.cor) aplicarCorDeDestaque(manifesto.identidade.cor);
  saudar();
  atualizarConta();
  el('cartao-cadastro').hidden = Boolean(nomeDoPerfil());
  el('btn-notificacoes').hidden = false;
  const ativos = manifesto.catalogos.filter((c) => !c.lixeira).length;
  el('resumo-catalogos').textContent = ativos === 1
    ? '1 flipbook na estante.'
    : `${ativos} flipbooks na estante.`;
  atualizarStatusPublicacao();
  carregarNotificacoes();
}

/* ====== Notificações (publicações do site) ====== */

const CHAVE_NOTIFICACOES = 'estante-notificacoes-vistas';
let maisRecenteNotificacao = '';

function textoDeRun(run) {
  if (run.status !== 'completed') return { icone: '⏳', texto: 'Publicação em andamento…' };
  if (run.conclusion === 'success') return { icone: '✅', texto: 'Site publicado com sucesso' };
  return { icone: '⚠️', texto: 'A publicação falhou — veja os detalhes' };
}

async function carregarNotificacoes() {
  try {
    const dados = await gh(`actions/runs?branch=${RAMO}&per_page=6`);
    const runs = dados.workflow_runs || [];
    const lista = el('lista-notificacoes');
    lista.innerHTML = '';
    if (runs.length === 0) {
      lista.innerHTML = '<li><span class="notificacao-texto">Nenhuma notificação ainda.</span></li>';
      return;
    }
    maisRecenteNotificacao = runs[0].updated_at || '';
    const vistoAte = localStorage.getItem(CHAVE_NOTIFICACOES) || '';
    const naoLidas = runs.filter((r) => (r.updated_at || '') > vistoAte).length;
    const selo = el('sino-selo');
    selo.textContent = String(naoLidas);
    selo.hidden = naoLidas === 0;

    for (const run of runs) {
      const { icone, texto } = textoDeRun(run);
      const item = document.createElement('li');
      const ligacao = document.createElement('a');
      ligacao.href = run.html_url;
      ligacao.target = '_blank';
      ligacao.rel = 'noopener';
      const quando = new Date(run.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      ligacao.innerHTML = `<span aria-hidden="true">${icone}</span><span>${texto}<span class="quando">${quando}</span></span>`;
      item.appendChild(ligacao);
      lista.appendChild(item);
    }
  } catch (erro) {
    console.warn('Falha ao carregar notificações', erro);
  }
}

function alternarNotificacoes() {
  const painel = el('painel-notificacoes');
  const abrir = painel.hidden;
  painel.hidden = !abrir;
  el('btn-notificacoes').setAttribute('aria-expanded', String(abrir));
  if (abrir) {
    // Abrir marca tudo como lido.
    if (maisRecenteNotificacao) localStorage.setItem(CHAVE_NOTIFICACOES, maisRecenteNotificacao);
    el('sino-selo').hidden = true;
    carregarNotificacoes();
  }
}

/* ====== Menu de conta ====== */

function abrirMenuConta() {
  el('conta-fundo').hidden = false;
  el('conta-menu').hidden = false;
}

function fecharMenuConta() {
  el('conta-fundo').hidden = true;
  el('conta-menu').hidden = true;
}

/* ====== Cadastro (primeiro acesso) ====== */

async function concluirCadastro() {
  const nome = el('cadastro-nome').value.trim();
  if (!nome) { avisar('Informe o seu nome ou o da empresa.'); return; }
  const botao = el('btn-concluir-cadastro');
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    await carregarManifesto();
    manifesto.perfil = { ...(manifesto.perfil || {}), nome };
    const email = el('cadastro-email').value.trim();
    if (email) manifesto.perfil.email = email;
    delete manifesto.painelNome;
    await commitar(
      [{ caminho: 'catalogos.json', conteudoBase64: manifestoBase64() }],
      'Salva o perfil do painel',
    );
    el('cartao-cadastro').hidden = true;
    saudar();
    atualizarConta();
    avisar(`Cadastro concluído — bem-vindo, ${nome}!`, true);
    atualizarStatusPublicacao();
  } catch (erro) {
    console.error(erro);
    avisar(`Não foi possível salvar: ${erro.message}`, true);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Concluir cadastro';
  }
}

/* ====== Status de publicação ====== */

let temporizadorStatus = null;
async function atualizarStatusPublicacao() {
  clearTimeout(temporizadorStatus);
  const alvo = el('status-publicacao');
  try {
    const dados = await gh(`actions/runs?branch=${RAMO}&per_page=1`);
    const run = dados.workflow_runs && dados.workflow_runs[0];
    if (!run) { alvo.textContent = 'Nenhuma publicação registrada ainda.'; return; }
    const quando = new Date(run.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    if (run.status !== 'completed') {
      alvo.textContent = '⏳ Publicando as alterações…';
      temporizadorStatus = setTimeout(atualizarStatusPublicacao, 10000);
    } else if (run.conclusion === 'success') {
      const pendente = ultimoCommit() && run.head_sha !== ultimoCommit();
      if (pendente) {
        alvo.textContent = '⏳ Alteração enviada — aguardando a publicação começar…';
        temporizadorStatus = setTimeout(atualizarStatusPublicacao, 8000);
      } else {
        alvo.textContent = `✅ Site publicado (última publicação: ${quando}).`;
      }
    } else {
      alvo.textContent = `⚠️ A última publicação falhou (${quando}). Veja a aba Actions do repositório.`;
    }
  } catch {
    alvo.textContent = 'Não foi possível consultar o status de publicação.';
  }
}

/* ====== Conexão ====== */

async function conectar(novaChave) {
  definirToken(novaChave);
  if (!temToken()) { mostrarTelaToken('Cole a chave antes de conectar.'); return; }
  const botao = el('btn-conectar');
  botao.disabled = true;
  botao.textContent = 'Verificando…';
  try {
    const repositorio = await gh('');
    if (!repositorio.permissions || !repositorio.permissions.push) {
      throw new Error('A chave não tem permissão de escrita (Contents: Read and write) neste repositório.');
    }
    await mostrarTelaGestao();
    avisar('Conectado!');
  } catch (erro) {
    console.error(erro);
    definirToken('');
    const texto = erro.status === 401
      ? 'Chave inválida ou expirada. Confira se copiou o código completo.'
      : erro.status === 404
        ? 'A chave não dá acesso a este repositório. Confira o repositório selecionado ao criar a chave.'
        : `Não foi possível conectar: ${erro.message}`;
    mostrarTelaToken(texto);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Conectar';
  }
}

function sair() {
  definirToken('');
  el('campo-token').value = '';
  fecharMenuConta();
  mostrarTelaToken();
  avisar('Sessão encerrada — a chave foi removida deste navegador.');
}

/* ====== Início ====== */

function configurarEventos() {
  el('btn-conectar').addEventListener('click', () => conectar(el('campo-token').value));
  el('campo-token').addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') conectar(el('campo-token').value);
  });
  el('btn-sair').addEventListener('click', sair);
  el('btn-concluir-cadastro').addEventListener('click', concluirCadastro);

  el('btn-notificacoes').addEventListener('click', alternarNotificacoes);
  document.addEventListener('click', (evento) => {
    const painel = el('painel-notificacoes');
    if (!painel.hidden && !evento.target.closest('.sino-caixa')) {
      painel.hidden = true;
      el('btn-notificacoes').setAttribute('aria-expanded', 'false');
    }
  });

  el('btn-conta').addEventListener('click', abrirMenuConta);
  el('conta-fechar').addEventListener('click', fecharMenuConta);
  el('conta-fundo').addEventListener('click', fecharMenuConta);
  for (const item of document.querySelectorAll('[data-fecha-menu]')) {
    item.addEventListener('click', fecharMenuConta);
  }
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !el('conta-menu').hidden) fecharMenuConta();
  });
}

async function iniciar() {
  configurarEventos();
  if (!temToken()) {
    mostrarTelaToken();
    return;
  }
  try {
    await mostrarTelaGestao();
  } catch (erro) {
    console.error(erro);
    if (erro.status === 401) {
      definirToken('');
      mostrarTelaToken('A chave salva expirou ou foi revogada. Crie uma nova e cole abaixo.');
    } else {
      mostrarErroGeral(`Não foi possível carregar os dados: ${erro.message}`);
    }
  }
}

iniciar();
