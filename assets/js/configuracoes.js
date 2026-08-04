// Configurações da estante, do perfil e da identidade visual — página
// própria, separada do Início do painel.
import {
  temToken, buscarManifesto, manifestoParaBase64, commitar,
  arquivoParaBase64,
} from './nucleo-admin.js';

const EXTENSOES_LOGO = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const el = (id) => document.getElementById(id);

let manifesto = null;
let logoPendente = null;      // File escolhido, ainda não salvo
let removerLogo = false;
let alteracoesPendentes = false;

// Evita perder edições sem querer: avisa ao sair com mudanças não salvas.
window.addEventListener('beforeunload', (evento) => {
  if (!alteracoesPendentes) return;
  evento.preventDefault();
  evento.returnValue = '';
});

let temporizadorToast = null;
function avisar(texto, demorado = false) {
  const toast = el('toast');
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { toast.hidden = true; }, demorado ? 6000 : 3000);
}

function nomeDoPerfil() {
  return ((manifesto.perfil && manifesto.perfil.nome) || manifesto.painelNome || '').trim();
}

function preencher() {
  el('campo-titulo-estante').value = manifesto.titulo || '';
  el('campo-descricao-estante').value = manifesto.descricao || '';
  el('campo-nome-painel').value = nomeDoPerfil();
  el('campo-email-perfil').value = (manifesto.perfil && manifesto.perfil.email) || '';
  const logo = manifesto.identidade && manifesto.identidade.logo;
  const previa = el('logo-previa');
  previa.hidden = !logo;
  if (logo) previa.src = logo;
  el('btn-remover-logo').hidden = !logo;
}

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
  alteracoesPendentes = true;
  const previa = el('logo-previa');
  previa.src = URL.createObjectURL(arquivo);
  previa.hidden = false;
  el('btn-remover-logo').hidden = false;
  avisar('Logomarca escolhida — clique em "Salvar configurações" para publicar.');
}

async function salvar() {
  const botao = el('btn-salvar-estante');
  const titulo = el('campo-titulo-estante').value.trim();
  if (!titulo) { avisar('O título do site não pode ficar vazio.'); return; }
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    manifesto = await buscarManifesto();
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

    mudancas.push({ caminho: 'catalogos.json', conteudoBase64: manifestoParaBase64(manifesto) });
    await commitar(mudancas, 'Atualiza as configurações da estante');

    logoPendente = null;
    removerLogo = false;
    alteracoesPendentes = false;
    avisar('Configurações salvas! O site republica em 1–2 minutos.', true);
  } catch (erro) {
    console.error(erro);
    avisar(`Não foi possível salvar: ${erro.message}`, true);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar configurações';
  }
}

function configurarEventos() {
  for (const id of ['campo-titulo-estante', 'campo-descricao-estante', 'campo-nome-painel', 'campo-email-perfil']) {
    el(id).addEventListener('input', () => { alteracoesPendentes = true; });
    el(id).addEventListener('change', () => { alteracoesPendentes = true; });
  }
  el('btn-salvar-estante').addEventListener('click', salvar);
  el('btn-escolher-logo').addEventListener('click', () => el('campo-logo').click());
  el('campo-logo').addEventListener('change', () => {
    if (el('campo-logo').files[0]) escolherLogo(el('campo-logo').files[0]);
    el('campo-logo').value = '';
  });
  el('btn-remover-logo').addEventListener('click', () => {
    logoPendente = null;
    removerLogo = true;
    alteracoesPendentes = true;
    el('logo-previa').hidden = true;
    el('btn-remover-logo').hidden = true;
    avisar('A logomarca será removida ao salvar as configurações.');
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
  preencher();
  el('gerenciador').hidden = false;
}

iniciar();
