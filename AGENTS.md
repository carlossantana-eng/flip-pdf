# Regras para agentes e colaboradores

Este repositório é uma **estante virtual de catálogos PDF** publicada no
GitHub Pages. Leia o `README.md` para o retrato atual do projeto; este
arquivo define as regras de trabalho.

## Princípios

1. **Site estático, sem build e sem dependências.** Nada de npm install,
   frameworks ou bundlers. JavaScript puro (ES modules), CSS puro.
   As bibliotecas de terceiros (PDF.js, StPageFlip) ficam vendorizadas em
   `assets/vendor/` — não troque por CDN.
2. **`catalogos.json` é gerado.** Quem escreve nele é
   `scripts/gerar-manifesto.mjs` (rodado pelo workflow `publicar.yml` na
   `main`). Edições manuais de `titulo`/`descricao` são preservadas pelo
   script; nunca faça o script sobrescrevê-las.
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
8. **admin.html grava na main via API do GitHub** (Git Data API, um
   commit por ação). O `gerar-manifesto.mjs` preserva as entradas que
   a página cria; mudanças nesse contrato exigem atualizar os dois.

## Testes manuais mínimos antes de entregar

- `node scripts/gerar-manifesto.mjs --check` passa.
- Estante e leitor abrem via `python3 -m http.server` (capa renderiza,
  flip funciona, lupa abre, link `#p=N` posiciona na página certa).
- Testar viewport mobile (~390px) além do desktop.
