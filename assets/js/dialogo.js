// Diálogos com a identidade do app no lugar de window.prompt/confirm:
// validação inline, Enter confirma, Esc cancela.
let caixa = null;

function garantir() {
  if (caixa) return caixa;
  caixa = document.createElement('dialog');
  caixa.className = 'dialogo';
  caixa.id = 'dialogo-app';
  document.body.appendChild(caixa);
  return caixa;
}

function abrir({
  titulo, texto = '', campos = [], confirmarRotulo = 'Confirmar', perigo = false, validar = null,
}) {
  const dialogo = garantir();
  dialogo.innerHTML = `
    <h2>${titulo}</h2>
    ${texto ? `<p class="dica dialogo-texto">${texto}</p>` : ''}
    ${campos.map((campo, i) => `
      <label class="campo">
        <span>${campo.rotulo}</span>
        <input id="dialogo-app-campo-${i}" type="text" maxlength="${campo.maximo || 90}">
      </label>`).join('')}
    <p class="erro-campo" id="dialogo-app-erro" hidden></p>
    <div class="publicar-rodape">
      <button class="botao botao-suave" id="dialogo-app-cancelar" type="button">Cancelar</button>
      <button class="botao${perigo ? ' botao-perigo' : ''}" id="dialogo-app-confirmar" type="button">${confirmarRotulo}</button>
    </div>`;

  const entradas = campos.map((campo, i) => {
    const entrada = dialogo.querySelector(`#dialogo-app-campo-${i}`);
    entrada.value = campo.valor || '';
    return entrada;
  });

  return new Promise((resolver) => {
    let resolvido = false;
    const terminar = (resultado) => {
      if (resolvido) return;
      resolvido = true;
      if (dialogo.open) dialogo.close();
      resolver(resultado);
    };

    dialogo.querySelector('#dialogo-app-confirmar').addEventListener('click', () => {
      const valores = entradas.map((entrada) => entrada.value.trim());
      if (validar) {
        const problema = validar(...valores);
        if (problema) {
          const erro = dialogo.querySelector('#dialogo-app-erro');
          erro.textContent = problema;
          erro.hidden = false;
          entradas[0]?.focus();
          return;
        }
      }
      terminar(campos.length > 0 ? valores : true);
    });
    dialogo.querySelector('#dialogo-app-cancelar').addEventListener('click', () => terminar(null));
    dialogo.addEventListener('close', () => terminar(null), { once: true });
    for (const entrada of entradas) {
      entrada.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') {
          evento.preventDefault();
          dialogo.querySelector('#dialogo-app-confirmar').click();
        }
      });
    }

    dialogo.showModal();
    entradas[0]?.focus();
    entradas[0]?.select();
  });
}

// Pergunta um texto. Resolve com a string (aparada) ou null se cancelar.
export async function pedirTexto({
  titulo, rotulo = 'Nome', valor = '', texto = '', confirmarRotulo = 'Salvar', maximo = 90, validar = null,
}) {
  const resultado = await abrir({
    titulo,
    texto,
    campos: [{ rotulo, valor, maximo }],
    confirmarRotulo,
    validar: (nome) => (!nome ? 'Preencha o nome.' : (validar ? validar(nome) : null)),
  });
  return resultado ? resultado[0] : null;
}

// Pergunta nome + descrição. Resolve com {nome, descricao} ou null.
export async function pedirNomeDescricao({
  titulo, valorNome = '', valorDescricao = '', texto = '', confirmarRotulo = 'Salvar', validar = null,
}) {
  const resultado = await abrir({
    titulo,
    texto,
    campos: [
      { rotulo: 'Nome', valor: valorNome, maximo: 80 },
      { rotulo: 'Descrição (opcional)', valor: valorDescricao, maximo: 160 },
    ],
    confirmarRotulo,
    validar: (nome) => (!nome ? 'Preencha o nome.' : (validar ? validar(nome) : null)),
  });
  return resultado ? { nome: resultado[0], descricao: resultado[1] } : null;
}

// Confirmação. Resolve com true/false.
export async function confirmar({ titulo, texto = '', confirmarRotulo = 'Confirmar', perigo = false }) {
  const resultado = await abrir({ titulo, texto, confirmarRotulo, perigo });
  return resultado === true;
}
