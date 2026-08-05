# Regras para agentes e colaboradores

Este repositório é uma **estante virtual de catálogos PDF** publicada no
GitHub Pages. Leia o `README.md` para o retrato atual do projeto; este
arquivo define as regras de trabalho.

## Princípios

1. **Site estático, sem dependências em runtime.** Nada de frameworks ou
   bundlers. JavaScript puro (ES modules), CSS puro. As bibliotecas de
   terceiros (PDF.js, StPageFlip) ficam vendorizadas em `assets/vendor/`
   — não troque por CDN. A única dependência npm é o Playwright, dev-only,
   para as suítes de `tests/` — nunca adicione dependência de runtime.
2. **`catalogos.json` é gerado.** Quem escreve nele é
   `scripts/gerar-manifesto.mjs` (rodado pelo workflow `publicar.yml` na
   `main`). Edições manuais de `titulo`/`descricao` são preservadas pelo
   script; nunca faça o script sobrescrevê-las. O mesmo workflow gera os
   artefatos de build (gitignorados): páginas de compartilhamento `f/`
   (flipbooks) e `e/` (estantes) com Open Graph
   (`scripts/gerar-compartilhamento.mjs`) e `sitemap.xml`/`robots.txt`
   (`scripts/gerar-sitemap.mjs`).
3. **Conteúdo (PDFs) não se mistura com código.** PDFs vivem só em
   `catalogos/`; capas opcionais em `catalogos/capas/`.
4. **Caminhos sempre relativos** (sem `/` inicial): o site é servido no
   subcaminho `/flip-pdf/` do GitHub Pages.
5. **Idioma: PT-BR** em interface, documentação, mensagens de commit e
   nomes de arquivos novos.
6. **CI verde antes de merge**; após push na `main`, confira o run do
   workflow *Publicar estante* (`gh run list` / aba Actions). Os workflows
   falham alto por design — não use `continue-on-error`.
7. **Sem segredos**: este projeto não usa credenciais além do
   `GITHUB_TOKEN` padrão dos workflows. Não adicione tokens ou chaves.
   A página `admin.html` usa um fine-grained token que o dono cola no
   próprio navegador (localStorage) — o token nunca aparece em código,
   commit ou log; nunca peça o valor dele, apenas confirmação de que
   foi criado com escopo mínimo (Contents: read/write deste repo).
8. **admin.html e arquivos.html gravam na main via API do GitHub**
   (Git Data API, um commit por ação), compartilhando o módulo
   `assets/js/nucleo-admin.js`. O `gerar-manifesto.mjs` preserva TODOS
   os campos extras das entradas (pasta, lixeira, descrição etc.) —
   mudanças nesse contrato exigem atualizar script e páginas juntos.
9. **Lixeira**: catálogo com `lixeira: true` no manifesto fica oculto
   da estante e do leitor; `lixeiraEm` marca a data e a página de
   arquivos exclui definitivamente (PDF + capa + música) o que passar
   de 30 dias.
10. **Campos por catálogo no manifesto**: `pasta` (organização
    privada), `estante` (estante pública; ausente = principal),
    `permitirDownload: false`, `capa` (própria ou WebP pré-gerada da
    1ª página na publicação), `musica` e `ordem` (sequência na
    estante; menor primeiro, sem `ordem` = por data no fim). Estantes
    extras vivem no top-level
    `estantes: [{id, nome, descricao?, criadaEm, cor?, corSecundaria?, corFundo?, capa?}]`;
    a principal guarda cores/capa em `identidade`. O `perfil` aceita
    `nome`, `email` e `whatsapp` (só dígitos, com DDI) — o WhatsApp vira
    botão de conversa na estante e no leitor.

11. **Contas de usuário são SIMULADAS** (`conta-simulada.js`,
    localStorage): não prometem segurança nem multiusuário real. Não
    misturar com a chave do GitHub (que é a autenticação de publicação).
    A raiz é a landing da plataforma; a estante dos clientes é
    `estante.html`.

## Testes antes de entregar

- **Suítes automatizadas**: `npm install` e depois `npm test` (roda
  `tests/rodar.mjs`: sobe servidor local e executa as suítes Playwright
  com a API do GitHub simulada — nenhum teste toca a rede). O CI
  (`verificar.yml`) roda tudo em PRs e em pushes de código na `main`.
  Se o Chromium local não for o do Playwright, aponte-o com
  `CHROMIUM_BIN=<caminho>`.
- `node scripts/gerar-manifesto.mjs --check` passa.
- Para mudanças visuais, confira também no navegador via
  `python3 -m http.server` em desktop e mobile (~390px) — as suítes
  cobrem comportamento, não estética.
