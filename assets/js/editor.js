// Editor de publicação: configurações à esquerda, flipbook ao vivo à
// direita. Salvar grava no repositório num único commit.
import {
  temToken, buscarManifesto, manifestoParaBase64, commitar,
  arquivoParaBase64, aplicarCorDeDestaque,
} from './nucleo-admin.js';

const EXTENSOES_CAPA = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const LIMITE_CAPA = 2 * 1024 * 1024;
const el = (id) => document.getElementById(id);

const arquivo = new URLSearchParams(location.search).get('c');
let manifesto = null;
let capaNova = null;      // File escolhido, ainda não salvo
let removerCapa = false;

let temporizadorToast = null;
function avisar(texto, demorado = false) {
  const toast = el('toast');
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { toast.hidden = true; }, demorado ? 6000 : 3000);
}

function entradaAtual() {
  return manifesto.catalogos.find((c) => c.arquivo === arquivo);
}

function preencherPastas(selecionada) {
  const select = el('campo-pasta');
  select.innerHTML = '';
  select.appendChild(new Option('Sem pasta', ''));
  for (const nome of [...(manifesto.pastas || [])].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
    select.appendChild(new Option(nome, nome));
  }
  select.appendChild(new Option('+ Nova pasta…', '__nova__'));
  select.value = selecionada || '';
  select.addEventListener('change', () => {
    if (select.value !== '__nova__') return;
    const nome = (window.prompt('Nome da nova pasta:') || '').trim();
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
}

function preencherEstantes(selecionada) {
  const select = el('campo-estante');
  select.innerHTML = '';
  select.appendChild(new Option(`${manifesto.titulo || 'Catálogos'} (principal)`, 'principal'));
  for (const estante of manifesto.estantes || []) {
    select.appendChild(new Option(estante.nome, estante.id));
  }
  select.value = selecionada || 'principal';
  if (select.selectedIndex < 0) select.value = 'principal';
}

function mostrarCapa(entrada) {
  const previa = el('capa-previa');
  const automatica = el('capa-automatica');
  const btnAutomatica = el('btn-capa-automatica');
  if (capaNova) {
    previa.src = URL.createObjectURL(capaNova);
    previa.hidden = false;
    automatica.hidden = true;
    btnAutomatica.hidden = false;
  } else if (entrada.capa && !removerCapa) {
    previa.src = entrada.capa;
    previa.hidden = false;
    automatica.hidden = true;
    btnAutomatica.hidden = false;
  } else {
    previa.hidden = true;
    automatica.hidden = false;
    btnAutomatica.hidden = true;
  }
}

/* ====== Design do leitor ====== */

const FUNDO_PADRAO = '#000000';
const BARRA_PADRAO = '#0b0d08';

function coletarDesign() {
  const design = {};
  const fundo = el('design-fundo').value;
  const barra = el('design-barra').value;
  if (fundo.toLowerCase() !== FUNDO_PADRAO) design.fundo = fundo;
  if (barra.toLowerCase() !== BARRA_PADRAO) design.barra = barra;
  const ocultar = [...document.querySelectorAll('[data-botao]')]
    .filter((caixa) => !caixa.checked)
    .map((caixa) => caixa.dataset.botao);
  if (ocultar.length > 0) design.ocultar = ocultar;
  return Object.keys(design).length > 0 ? design : null;
}

function carregarDesign(entrada) {
  const design = entrada.leitor || {};
  el('design-fundo').value = design.fundo || FUNDO_PADRAO;
  el('design-barra').value = design.barra || BARRA_PADRAO;
  const ocultar = new Set(design.ocultar || []);
  for (const caixa of document.querySelectorAll('[data-botao]')) {
    caixa.checked = !ocultar.has(caixa.dataset.botao);
  }
}

// Prévia em tempo real: envia o design para o leitor dentro do iframe.
function enviarPrevia() {
  const quadro = el('previa');
  if (quadro.contentWindow) {
    quadro.contentWindow.postMessage({ tipo: 'design-previa', design: coletarDesign() || {} }, location.origin);
  }
}

function configurarDesign() {
  for (const controle of document.querySelectorAll('[data-botao], #design-fundo, #design-barra')) {
    controle.addEventListener('input', enviarPrevia);
    controle.addEventListener('change', enviarPrevia);
  }
  el('btn-cores-padrao').addEventListener('click', () => {
    el('design-fundo').value = FUNDO_PADRAO;
    el('design-barra').value = BARRA_PADRAO;
    enviarPrevia();
  });
  el('previa').addEventListener('load', enviarPrevia);
}

async function salvar() {
  const titulo = el('campo-titulo').value.trim();
  if (!titulo) { avisar('O título não pode ficar vazio.'); return; }
  const botao = el('btn-salvar');
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    manifesto = await buscarManifesto();
    const entrada = entradaAtual();
    if (!entrada) throw new Error('publicação não encontrada no manifesto.');

    const mudancas = [];
    entrada.titulo = titulo;
    const descricao = el('campo-descricao').value.trim();
    if (descricao) entrada.descricao = descricao;
    else delete entrada.descricao;

    const pasta = el('campo-pasta').value;
    if (pasta && pasta !== '__nova__') {
      entrada.pasta = pasta;
      if (!(manifesto.pastas || []).includes(pasta)) {
        manifesto.pastas = [...(manifesto.pastas || []), pasta];
      }
    } else {
      delete entrada.pasta;
    }

    if (el('campo-download').checked) delete entrada.permitirDownload;
    else entrada.permitirDownload = false;

    const estanteEscolhida = el('campo-estante').value;
    if (estanteEscolhida && estanteEscolhida !== 'principal') entrada.estante = estanteEscolhida;
    else delete entrada.estante;

    const design = coletarDesign();
    if (design) entrada.leitor = design;
    else delete entrada.leitor;

    if (capaNova) {
      const nomeBase = arquivo.replace(/\.pdf$/i, '');
      const caminhoCapa = `catalogos/capas/${nomeBase}.${EXTENSOES_CAPA[capaNova.type]}`;
      mudancas.push({ caminho: caminhoCapa, conteudoBase64: await arquivoParaBase64(capaNova) });
      if (entrada.capa && entrada.capa !== caminhoCapa) {
        mudancas.push({ caminho: entrada.capa, conteudoBase64: null });
      }
      entrada.capa = caminhoCapa;
    } else if (removerCapa && entrada.capa) {
      mudancas.push({ caminho: entrada.capa, conteudoBase64: null });
      delete entrada.capa;
    }

    mudancas.push({ caminho: 'catalogos.json', conteudoBase64: manifestoParaBase64(manifesto) });
    await commitar(mudancas, `Atualiza a publicação "${titulo}"`);

    capaNova = null;
    removerCapa = false;
    mostrarCapa(entrada);
    el('editor-nome').textContent = titulo;
    avisar('Salvo! As alterações entram no ar em 1–2 minutos.', true);
  } catch (erro) {
    console.error(erro);
    avisar(`Não foi possível salvar: ${erro.message}`, true);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar alterações';
  }
}

async function enviarParaLixeira() {
  const entrada = entradaAtual();
  if (!window.confirm(`Enviar "${entrada.titulo}" para a lixeira?\n\nEle sai da estante, mas pode ser restaurado em Meus Arquivos.`)) return;
  try {
    manifesto = await buscarManifesto();
    const alvo = entradaAtual();
    if (alvo) {
      alvo.lixeira = true;
      alvo.lixeiraEm = new Date().toISOString().slice(0, 10);
      await commitar(
        [{ caminho: 'catalogos.json', conteudoBase64: manifestoParaBase64(manifesto) }],
        `Envia "${alvo.titulo}" para a lixeira`,
      );
    }
    location.href = 'arquivos.html';
  } catch (erro) {
    console.error(erro);
    avisar(`Não foi possível enviar para a lixeira: ${erro.message}`, true);
  }
}

function configurarEventos(entrada) {
  el('btn-salvar').addEventListener('click', salvar);
  el('btn-lixeira').addEventListener('click', enviarParaLixeira);

  el('btn-escolher-capa').addEventListener('click', () => el('campo-capa').click());
  el('campo-capa').addEventListener('change', () => {
    const imagem = el('campo-capa').files[0];
    el('campo-capa').value = '';
    if (!imagem) return;
    if (!EXTENSOES_CAPA[imagem.type]) { avisar('Use uma imagem PNG, JPG ou WebP.'); return; }
    if (imagem.size > LIMITE_CAPA) { avisar('A capa deve ter até 2 MB.'); return; }
    capaNova = imagem;
    removerCapa = false;
    mostrarCapa(entrada);
  });
  el('btn-capa-automatica').addEventListener('click', () => {
    capaNova = null;
    removerCapa = true;
    mostrarCapa(entrada);
    avisar('A capa volta a ser a 1ª página ao salvar.');
  });

  const urlLeitor = new URL(`leitor.html?c=${encodeURIComponent(arquivo)}`, location.href).toString();
  const copiar = el('btn-copiar-link');
  copiar.hidden = false;
  copiar.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(urlLeitor); avisar('Link copiado!'); } catch { avisar(urlLeitor, true); }
  });
  const abrir = el('btn-abrir');
  abrir.hidden = false;
  abrir.href = urlLeitor;
}

async function iniciar() {
  if (!temToken()) {
    el('sem-chave').hidden = false;
    return;
  }
  if (!arquivo) {
    el('nao-encontrado').hidden = false;
    return;
  }
  try {
    manifesto = await buscarManifesto();
  } catch (erro) {
    console.error(erro);
    el('nao-encontrado-texto').textContent = `Não foi possível carregar os dados: ${erro.message}`;
    el('nao-encontrado').hidden = false;
    return;
  }
  if (manifesto.identidade && manifesto.identidade.cor) aplicarCorDeDestaque(manifesto.identidade.cor);

  const entrada = entradaAtual();
  if (!entrada) {
    el('nao-encontrado').hidden = false;
    return;
  }
  if (entrada.lixeira) {
    el('nao-encontrado-texto').textContent = 'Esta publicação está na lixeira — restaure-a em Meus Arquivos para editar.';
    el('nao-encontrado').hidden = false;
    return;
  }

  document.title = `Editar · ${entrada.titulo}`;
  el('editor-nome').textContent = entrada.titulo;
  el('campo-titulo').value = entrada.titulo;
  el('campo-descricao').value = entrada.descricao || '';
  el('campo-download').checked = entrada.permitirDownload !== false;
  el('editor-arquivo').textContent = `Arquivo: ${entrada.arquivo} · adicionado em ${entrada.adicionadoEm || '—'}`;
  preencherPastas(entrada.pasta);
  preencherEstantes(entrada.estante);
  mostrarCapa(entrada);
  carregarDesign(entrada);
  configurarDesign();
  configurarEventos(entrada);

  el('previa').src = `leitor.html?c=${encodeURIComponent(arquivo)}`;
  el('editor').hidden = false;
}

iniciar();
