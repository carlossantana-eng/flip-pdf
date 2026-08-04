// Contas de usuário SIMULADAS: tudo fica no localStorage deste navegador.
// Não há servidor — é uma demonstração do fluxo de cadastro/login, pensada
// para ser trocada por autenticação real quando o site for hospedado.
// A senha é guardada como hash SHA-256 por higiene, mas isto NÃO é
// segurança de verdade: qualquer dado aqui é local e visível ao navegador.

const CHAVE_USUARIOS = 'plataforma-usuarios';
const CHAVE_SESSAO = 'plataforma-sessao';

function lerUsuarios() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_USUARIOS)) || [];
  } catch {
    return [];
  }
}

function gravarUsuarios(usuarios) {
  localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(usuarios));
}

async function hash(texto) {
  const dados = new TextEncoder().encode(texto);
  const resumo = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function usuarioAtual() {
  const email = localStorage.getItem(CHAVE_SESSAO);
  if (!email) return null;
  const usuario = lerUsuarios().find((u) => u.email === email);
  return usuario ? { nome: usuario.nome, email: usuario.email, criadoEm: usuario.criadoEm } : null;
}

export async function cadastrar(nome, email, senha) {
  nome = nome.trim();
  email = email.trim().toLowerCase();
  if (!nome) throw new Error('Informe o seu nome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const usuarios = lerUsuarios();
  if (usuarios.some((u) => u.email === email)) {
    throw new Error('Já existe uma conta com este e-mail neste navegador. Faça login.');
  }
  usuarios.push({ nome, email, senha: await hash(senha), criadoEm: new Date().toISOString().slice(0, 10) });
  gravarUsuarios(usuarios);
  localStorage.setItem(CHAVE_SESSAO, email);
  return usuarioAtual();
}

export async function entrar(email, senha) {
  email = email.trim().toLowerCase();
  const usuario = lerUsuarios().find((u) => u.email === email);
  if (!usuario || usuario.senha !== await hash(senha)) {
    throw new Error('E-mail ou senha incorretos. (Lembre-se: a conta demo vale só neste navegador.)');
  }
  localStorage.setItem(CHAVE_SESSAO, email);
  return usuarioAtual();
}

export function sairDaConta() {
  localStorage.removeItem(CHAVE_SESSAO);
}

// Conta demo pré-cadastrada: existe em qualquer navegador, sem cadastro.
export const CONTA_DEMO = { email: 'demo@flippdf.com', senha: 'demo123' };

async function garantirContaDemo() {
  const usuarios = lerUsuarios();
  if (usuarios.some((u) => u.email === CONTA_DEMO.email)) return;
  usuarios.push({
    nome: 'Demo',
    email: CONTA_DEMO.email,
    senha: await hash(CONTA_DEMO.senha),
    criadoEm: new Date().toISOString().slice(0, 10),
  });
  gravarUsuarios(usuarios);
}

garantirContaDemo();

// Ajusta a navegação das páginas públicas conforme a sessão:
// elementos com [data-visitante] aparecem deslogado; [data-logado], logado.
export function ajustarNavegacao() {
  const usuario = usuarioAtual();
  for (const elemento of document.querySelectorAll('[data-visitante]')) {
    elemento.hidden = Boolean(usuario);
  }
  for (const elemento of document.querySelectorAll('[data-logado]')) {
    elemento.hidden = !usuario;
  }
  const boasVindas = document.getElementById('nav-usuario');
  if (boasVindas && usuario) boasVindas.textContent = usuario.nome.split(/\s+/)[0];
  for (const botao of document.querySelectorAll('[data-sair]')) {
    botao.addEventListener('click', () => {
      sairDaConta();
      location.href = 'index.html';
    });
  }
}
