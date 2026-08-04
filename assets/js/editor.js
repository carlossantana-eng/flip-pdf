// Editor de publicação: configurações à esquerda, flipbook ao vivo à
// direita. Salvar grava no repositório num único commit.
import {
  temToken, buscarManifesto, manifestoParaBase64, commitar,
  arquivoParaBase64, dataLegivel,
} from './nucleo-admin.js';
import { confirmar } from './dialogo.js';

const EXTENSOES_CAPA = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const LIMITE_CAPA = 2 * 1024 * 1024;
const LIMITE_MUSICA = 8 * 1024 * 1024;
const el = (id) => document.getElementById(id);

const arquivo = new URLSearchParams(location.search).get('c');
let manifesto = null;
let alteracoesPendentes = false;

// Evita perder edições sem querer: avisa ao sair com mudanças não salvas.
window.addEventListener('beforeunload', (evento) => {
  if (!alteracoesPendentes) return;
  evento.preventDefault();
  evento.returnValue = '';
});
let capaNova = null;      // File escolhido, ainda não salvo
let removerCapa = false;
let musicaNova = null;    // MP3 escolhido, ainda não salvo
let removerMusica = false;

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

function mostrarMusica(entrada) {
  const estado = el('musica-estado');
  const remover = el('btn-remover-musica');
  if (musicaNova) {
    estado.textContent = `Nova música: ${musicaNova.name} (salve para publicar)`;
    remover.hidden = false;
  } else if (entrada.musica && !removerMusica) {
    estado.textContent = `Música atual: ${entrada.musica.split('/').pop()}`;
    remover.hidden = false;
  } else {
    estado.textContent = 'Sem música.';
    remover.hidden = true;
  }
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

    if (el('campo-download').checked) delete entrada.permitirDownload;
    else entrada.permitirDownload = false;

    const estanteEscolhida = el('campo-estante').value;
    if (estanteEscolhida && estanteEscolhida !== 'principal') entrada.estante = estanteEscolhida;
    else delete entrada.estante;

    delete entrada.leitor; // personalização do leitor foi descontinuada

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

    if (musicaNova) {
      const caminhoMusica = `catalogos/musicas/${arquivo.replace(/\.pdf$/i, '')}.mp3`;
      mudancas.push({ caminho: caminhoMusica, conteudoBase64: await arquivoParaBase64(musicaNova) });
      if (entrada.musica && entrada.musica !== caminhoMusica) {
        mudancas.push({ caminho: entrada.musica, conteudoBase64: null });
      }
      entrada.musica = caminhoMusica;
    } else if (removerMusica && entrada.musica) {
      mudancas.push({ caminho: entrada.musica, conteudoBase64: null });
      delete entrada.musica;
    }

    mudancas.push({ caminho: 'catalogos.json', conteudoBase64: manifestoParaBase64(manifesto) });
    await commitar(mudancas, `Atualiza a publicação "${titulo}"`);

    capaNova = null;
    removerCapa = false;
    musicaNova = null;
    removerMusica = false;
    alteracoesPendentes = false;
    mostrarCapa(entrada);
    mostrarMusica(entrada);
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
  const aceitou = await confirmar({
    titulo: `Enviar "${entrada.titulo}" para a lixeira?`,
    texto: 'Ele sai da estante, mas pode ser restaurado em Meus Arquivos.',
    confirmarRotulo: 'Enviar para a lixeira',
    perigo: true,
  });
  if (!aceitou) return;
  alteracoesPendentes = false;
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
  for (const campo of ['campo-titulo', 'campo-descricao', 'campo-estante', 'campo-download']) {
    el(campo).addEventListener('input', () => { alteracoesPendentes = true; });
    el(campo).addEventListener('change', () => { alteracoesPendentes = true; });
  }
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
    alteracoesPendentes = true;
    mostrarCapa(entrada);
  });
  el('btn-capa-automatica').addEventListener('click', () => {
    capaNova = null;
    removerCapa = true;
    alteracoesPendentes = true;
    mostrarCapa(entrada);
    avisar('A capa volta a ser a 1ª página ao salvar.');
  });

  el('btn-escolher-musica').addEventListener('click', () => el('campo-musica').click());
  el('campo-musica').addEventListener('change', () => {
    const som = el('campo-musica').files[0];
    el('campo-musica').value = '';
    if (!som) return;
    if (som.type !== 'audio/mpeg' && !/\.mp3$/i.test(som.name)) { avisar('Use um arquivo MP3.'); return; }
    if (som.size > LIMITE_MUSICA) { avisar('A música deve ter até 8 MB.'); return; }
    musicaNova = som;
    removerMusica = false;
    alteracoesPendentes = true;
    mostrarMusica(entrada);
  });
  el('btn-remover-musica').addEventListener('click', () => {
    musicaNova = null;
    removerMusica = true;
    alteracoesPendentes = true;
    mostrarMusica(entrada);
    avisar('A música será removida ao salvar.');
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
  el('editor-arquivo').textContent = `Arquivo: ${entrada.arquivo} · adicionado em ${dataLegivel(entrada.adicionadoEm)}`;
  preencherEstantes(entrada.estante);
  mostrarCapa(entrada);
  mostrarMusica(entrada);
  configurarEventos(entrada);

  el('previa').src = `leitor.html?c=${encodeURIComponent(arquivo)}`;
  el('editor').hidden = false;
}

iniciar();
