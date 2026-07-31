// Alternância entre tema escuro (padrão) e claro.
// A preferência fica no navegador; um trecho inline no <head> de cada
// página aplica o tema salvo antes da primeira pintura (sem "piscada").
(function () {
  const CHAVE = 'plataforma-tema';

  const SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/></svg>';
  const LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/></svg>';

  function temaClaro() {
    return document.documentElement.dataset.tema === 'claro';
  }

  function desenhar(botao) {
    botao.innerHTML = temaClaro() ? LUA : SOL;
    const rotulo = temaClaro() ? 'Mudar para o tema escuro' : 'Mudar para o tema claro';
    botao.title = rotulo;
    botao.setAttribute('aria-label', rotulo);
  }

  function iniciar() {
    const barra = document.querySelector('.barra-acoes');
    if (!barra) return;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'icone-barra btn-tema';
    desenhar(botao);
    botao.addEventListener('click', () => {
      if (temaClaro()) {
        delete document.documentElement.dataset.tema;
        try { localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
      } else {
        document.documentElement.dataset.tema = 'claro';
        try { localStorage.setItem(CHAVE, 'claro'); } catch { /* sem armazenamento */ }
      }
      desenhar(botao);
    });
    barra.insertBefore(botao, barra.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
