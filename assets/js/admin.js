// Página de gestão da estante (painel): usa o núcleo compartilhado para
// falar com a API do GitHub. A chave de acesso fica só neste navegador.
import {
  dono, repo, RAMO, gh, commitar, buscarManifesto, manifestoParaBase64,
  arquivoParaBase64, nomeSeguro, tituloDoNome, definirToken, temToken,
  ultimoCommit, aplicarCorDeDestaque,
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
  const frases = [
    'Que seu dia seja leve e produtivo!',
    'Semana começando — bons negócios!',
    'Que seu dia seja cheio de alegria e conquistas!',
    'Seus catálogos estão a um clique dos clientes.',
    'Um bom catálogo vende sozinho — capriche!',
    'Quase fim de semana, bora fechar bem!',
    'Bom descanso — a estante trabalha por você.',
  ];
  el('saudacao-frase').textContent = frases[agora.getDay()];
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

function preencherConfiguracoes() {
  el('campo-titulo-estante').value = manifesto.titulo || '';
  el('campo-descricao-estante').value = manifesto.descricao || '';
  el('campo-nome-painel').value = nomeDoPerfil();
  el('campo-email-perfil').value = (manifesto.perfil && manifesto.perfil.email) || '';
  el('campo-cor').value = (manifesto.identidade && manifesto.identidade.cor) || '#c05621';
  const logo = manifesto.identidade && manifesto.identidade.logo;
  const previa = el('logo-previa');
  previa.hidden = !logo;
  if (logo) previa.src = logo;
  el('btn-remover-logo').hidden = !logo;
}

async function mostrarTelaGestao() {
  el('tela-token').hidden = true;
  el('tela-gestao').hidden = false;
  document.body.classList.add('conectado');
  await carregarManifesto();
  if (manifesto.identidade && manifesto.identidade.cor) aplicarCorDeDestaque(manifesto.identidade.cor);
  saudar();
  atualizarConta();
  preencherConfiguracoes();
  el('cartao-cadastro').hidden = Boolean(nomeDoPerfil());
  el('btn-notificacoes').hidden = false;
  desenharLista();
  atualizarStatusPublicacao();
  carregarNotificacoes();
}

/* ====== Lista de catálogos ====== */

function desenharLista() {
  const lista = el('lista-catalogos');
  lista.innerHTML = '';
  const ativos = manifesto.catalogos.filter((c) => !c.lixeira);
  if (ativos.length === 0) {
    lista.innerHTML = '<li class="lista-vazia">Nenhum catálogo ainda — envie o primeiro PDF acima.</li>';
    return;
  }
  const ordenados = ativos.sort((a, b) =>
    (b.adicionadoEm || '').localeCompare(a.adicionadoEm || '') ||
    a.titulo.localeCompare(b.titulo, 'pt-BR'));

  for (const catalogo of ordenados) {
    const item = document.createElement('li');
    item.className = 'item-admin';

    const info = document.createElement('div');
    info.className = 'item-campos';

    const campoTitulo = document.createElement('input');
    campoTitulo.type = 'text';
    campoTitulo.value = catalogo.titulo;
    campoTitulo.maxLength = 90;
    campoTitulo.setAttribute('aria-label', `Título de ${catalogo.arquivo}`);

    const campoDescricao = document.createElement('input');
    campoDescricao.type = 'text';
    campoDescricao.value = catalogo.descricao || '';
    campoDescricao.placeholder = 'Descrição (opcional)';
    campoDescricao.maxLength = 160;
    campoDescricao.setAttribute('aria-label', `Descrição de ${catalogo.arquivo}`);

    const nomeArquivo = document.createElement('p');
    nomeArquivo.className = 'item-arquivo';
    nomeArquivo.textContent = `${catalogo.arquivo} · adicionado em ${catalogo.adicionadoEm || '—'}`;

    info.append(campoTitulo, campoDescricao, nomeArquivo);

    const acoes = document.createElement('div');
    acoes.className = 'item-acoes';

    const btnVer = document.createElement('a');
    btnVer.className = 'botao botao-suave';
    btnVer.textContent = 'Abrir';
    btnVer.target = '_blank';
    btnVer.rel = 'noopener';
    btnVer.href = `leitor.html?c=${encodeURIComponent(catalogo.arquivo)}`;

    const btnSalvar = document.createElement('button');
    btnSalvar.className = 'botao';
    btnSalvar.textContent = 'Salvar';
    btnSalvar.addEventListener('click', () =>
      salvarCatalogo(catalogo, campoTitulo.value, campoDescricao.value, btnSalvar));

    const btnExcluir = document.createElement('button');
    btnExcluir.className = 'botao botao-perigo';
    btnExcluir.textContent = 'Excluir';
    btnExcluir.addEventListener('click', () => excluirCatalogo(catalogo, btnExcluir));

    acoes.append(btnVer, btnSalvar, btnExcluir);
    item.append(info, acoes);
    lista.appendChild(item);
  }
}

async function salvarCatalogo(catalogo, novoTitulo, novaDescricao, botao) {
  novoTitulo = novoTitulo.trim();
  if (!novoTitulo) { avisar('O título não pode ficar vazio.'); return; }
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    await carregarManifesto();
    const entrada = manifesto.catalogos.find((c) => c.arquivo === catalogo.arquivo);
    if (!entrada) throw new Error('Catálogo não encontrado no manifesto.');
    entrada.titulo = novoTitulo;
    if (novaDescricao.trim()) entrada.descricao = novaDescricao.trim();
    else delete entrada.descricao;
    await commitar(
      [{ caminho: 'catalogos.json', conteudoBase64: manifestoBase64() }],
      `Atualiza dados de "${novoTitulo}"`,
    );
    desenharLista();
    avisar('Salvo! O site republica em 1–2 minutos.');
    atualizarStatusPublicacao();
  } catch (erro) {
    console.error(erro);
    avisar(`Não foi possível salvar: ${erro.message}`, true);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar';
  }
}

async function excluirCatalogo(catalogo, botao) {
  const confirmar = window.confirm(
    `Excluir "${catalogo.titulo}"?\n\nO arquivo ${catalogo.arquivo} sai da estante e do repositório.`);
  if (!confirmar) return;
  botao.disabled = true;
  botao.textContent = 'Excluindo…';
  try {
    await carregarManifesto();
    manifesto.catalogos = manifesto.catalogos.filter((c) => c.arquivo !== catalogo.arquivo);
    await commitar(
      [
        { caminho: `catalogos/${catalogo.arquivo}`, conteudoBase64: null },
        { caminho: 'catalogos.json', conteudoBase64: manifestoBase64() },
      ],
      `Remove o catálogo "${catalogo.titulo}"`,
    );
    desenharLista();
    avisar('Catálogo excluído. O site republica em 1–2 minutos.');
    atualizarStatusPublicacao();
  } catch (erro) {
    console.error(erro);
    avisar(`Não foi possível excluir: ${erro.message}`, true);
    botao.disabled = false;
    botao.textContent = 'Excluir';
  }
}

/* ====== Envio de PDFs (um ou vários, num único commit) ====== */

async function enviarArquivos(listaDeArquivos) {
  const LIMITE = 60 * 1024 * 1024;
  const pdfs = [...listaDeArquivos].filter((a) => /\.pdf$/i.test(a.name));
  if (pdfs.length === 0) {
    avisar('Envie arquivos PDF.');
    return;
  }
  const grandes = pdfs.filter((a) => a.size > LIMITE);
  if (grandes.length > 0) {
    avisar(`Acima de 60 MB (comprima antes): ${grandes.map((a) => a.name).join(', ')}`, true);
    return;
  }

  await carregarManifesto();
  const aceitos = [];
  const nomesNoLote = new Set();
  for (const arquivo of pdfs) {
    const nome = nomeSeguro(arquivo.name);
    if (nomesNoLote.has(nome)) {
      avisar(`Dois arquivos do lote têm o mesmo nome (${nome}) — enviado só o primeiro.`, true);
      continue;
    }
    const existente = manifesto.catalogos.find((c) => c.arquivo === nome);
    if (existente) {
      const substituir = window.confirm(
        `Já existe um catálogo com o arquivo ${nome} ("${existente.titulo}").\n\nSubstituir pelo novo PDF?`);
      if (!substituir) continue;
    }
    nomesNoLote.add(nome);
    aceitos.push({ arquivo, nome, existente: Boolean(existente) });
  }
  if (aceitos.length === 0) return;

  const progresso = el('envio-progresso');
  const textoProgresso = el('envio-texto');
  progresso.hidden = false;
  el('zona-envio').classList.add('desativada');
  try {
    const mudancas = [];
    for (let i = 0; i < aceitos.length; i += 1) {
      const { arquivo, nome, existente } = aceitos[i];
      textoProgresso.textContent = aceitos.length === 1
        ? `Preparando ${nome}…`
        : `Preparando ${i + 1} de ${aceitos.length} (${nome})…`;
      mudancas.push({ caminho: `catalogos/${nome}`, conteudoBase64: await arquivoParaBase64(arquivo) });
      if (existente) {
        // Substituir um arquivo que estava na lixeira o traz de volta.
        const entrada = manifesto.catalogos.find((c) => c.arquivo === nome);
        if (entrada) { delete entrada.lixeira; delete entrada.lixeiraEm; }
      }
      if (!existente) {
        manifesto.catalogos.push({
          arquivo: nome,
          titulo: tituloDoNome(arquivo.name),
          adicionadoEm: new Date().toISOString().slice(0, 10),
        });
      }
    }
    mudancas.push({ caminho: 'catalogos.json', conteudoBase64: manifestoBase64() });

    textoProgresso.textContent = aceitos.length === 1
      ? `Enviando ${aceitos[0].nome}… (arquivos grandes podem demorar)`
      : `Enviando ${aceitos.length} catálogos… (arquivos grandes podem demorar)`;
    await commitar(
      mudancas,
      aceitos.length === 1
        ? (aceitos[0].existente ? `Substitui o PDF de ${aceitos[0].nome}` : `Adiciona o catálogo ${aceitos[0].nome}`)
        : `Adiciona ${aceitos.length} catálogos em lote`,
    );
    desenharLista();
    avisar(aceitos.length === 1
      ? 'Catálogo enviado! Ele aparece na estante em 1–2 minutos.'
      : `${aceitos.length} catálogos enviados! Eles aparecem na estante em 1–2 minutos.`, true);
    atualizarStatusPublicacao();
  } catch (erro) {
    console.error(erro);
    avisar(`Falha no envio: ${erro.message}`, true);
  } finally {
    progresso.hidden = true;
    el('zona-envio').classList.remove('desativada');
    el('campo-arquivo').value = '';
  }
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
    preencherConfiguracoes();
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

/* ====== Configurações (estante, perfil e identidade) ====== */

const EXTENSOES_LOGO = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
let logoPendente = null;      // File escolhido, ainda não salvo
let removerLogo = false;

function escolherLogo(arquivo) {
  if (!EXTENSOES_LOGO[arquivo.type]) {
    avisar('Use uma imagem PNG, JPG, WebP ou SVG.');
    return;
  }
  if (arquivo.size > 2 * 1024 * 1024) {
    avisar('A logomarca deve ter até 2 MB.');
    return;
  }
  logoPendente = arquivo;
  removerLogo = false;
  const previa = el('logo-previa');
  previa.src = URL.createObjectURL(arquivo);
  previa.hidden = false;
  el('btn-remover-logo').hidden = false;
  avisar('Logomarca escolhida — clique em "Salvar configurações" para publicar.');
}

async function salvarConfiguracoes() {
  const botao = el('btn-salvar-estante');
  const titulo = el('campo-titulo-estante').value.trim();
  if (!titulo) { avisar('O título do site não pode ficar vazio.'); return; }
  botao.disabled = true;
  try {
    await carregarManifesto();
    const mudancas = [];
    const logoAnterior = manifesto.identidade && manifesto.identidade.logo;

    manifesto.titulo = titulo;
    const descricao = el('campo-descricao-estante').value.trim();
    if (descricao) manifesto.descricao = descricao;
    else delete manifesto.descricao;

    const nome = el('campo-nome-painel').value.trim();
    const email = el('campo-email-perfil').value.trim();
    if (nome || email) {
      manifesto.perfil = {};
      if (nome) manifesto.perfil.nome = nome;
      if (email) manifesto.perfil.email = email;
    } else {
      delete manifesto.perfil;
    }
    delete manifesto.painelNome;

    manifesto.identidade = { ...(manifesto.identidade || {}) };
    manifesto.identidade.cor = el('campo-cor').value;

    if (logoPendente) {
      const caminhoLogo = `assets/identidade/logo.${EXTENSOES_LOGO[logoPendente.type]}`;
      mudancas.push({ caminho: caminhoLogo, conteudoBase64: await arquivoParaBase64(logoPendente) });
      if (logoAnterior && logoAnterior !== caminhoLogo) {
        mudancas.push({ caminho: logoAnterior, conteudoBase64: null });
      }
      manifesto.identidade.logo = caminhoLogo;
    } else if (removerLogo && logoAnterior) {
      mudancas.push({ caminho: logoAnterior, conteudoBase64: null });
      delete manifesto.identidade.logo;
    }

    mudancas.push({ caminho: 'catalogos.json', conteudoBase64: manifestoBase64() });
    await commitar(mudancas, 'Atualiza as configurações da estante');

    logoPendente = null;
    removerLogo = false;
    el('cartao-cadastro').hidden = Boolean(nomeDoPerfil());
    saudar();
    atualizarConta();
    avisar('Configurações salvas! O site republica em 1–2 minutos.');
    atualizarStatusPublicacao();
  } catch (erro) {
    console.error(erro);
    avisar(`Não foi possível salvar: ${erro.message}`, true);
  } finally {
    botao.disabled = false;
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
  el('btn-salvar-estante').addEventListener('click', salvarConfiguracoes);
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

  el('btn-escolher-logo').addEventListener('click', () => el('campo-logo').click());
  el('campo-logo').addEventListener('change', () => {
    if (el('campo-logo').files[0]) escolherLogo(el('campo-logo').files[0]);
    el('campo-logo').value = '';
  });
  el('btn-remover-logo').addEventListener('click', () => {
    logoPendente = null;
    removerLogo = true;
    el('logo-previa').hidden = true;
    el('btn-remover-logo').hidden = true;
    avisar('A logomarca será removida ao salvar as configurações.');
  });

  const zona = el('zona-envio');
  const campoArquivo = el('campo-arquivo');
  zona.addEventListener('click', () => campoArquivo.click());
  zona.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); campoArquivo.click(); }
  });
  el('acao-enviar').addEventListener('click', () => campoArquivo.click());
  el('acao-lote').addEventListener('click', () => campoArquivo.click());
  campoArquivo.addEventListener('change', () => {
    if (campoArquivo.files.length > 0) enviarArquivos(campoArquivo.files);
  });
  zona.addEventListener('dragover', (evento) => {
    evento.preventDefault();
    zona.classList.add('arrastando');
  });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
  zona.addEventListener('drop', (evento) => {
    evento.preventDefault();
    zona.classList.remove('arrastando');
    if (evento.dataTransfer.files.length > 0) enviarArquivos(evento.dataTransfer.files);
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
