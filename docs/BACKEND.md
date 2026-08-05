# Proposta: estatísticas e backend real para o FlipPDF

Estado: **proposta — aguardando decisão**. Este documento existe para a
decisão ser tomada uma vez e virar registro; quando aprovada (total ou
em partes), cada fase vira issues/PRs próprios e este arquivo passa a
refletir o que foi decidido.

## Por que isso não dá para fazer no repositório sozinho

Hoje o FlipPDF é 100% estático (GitHub Pages): não há servidor para
contar visualizações, autenticar usuários de verdade ou guardar arquivos
privados. As contas são simuladas no navegador e a publicação depende de
um fine-grained token do GitHub — funciona muito bem como demonstração e
para uso próprio, mas trava três evoluções:

1. **Estatísticas de visualização** — precisa de um endpoint que receba
   e some os acessos.
2. **Contas reais** — precisa de autenticação em servidor (as contas
   localStorage não protegem nada).
3. **Multi-cliente** — hoje é um repositório = uma estante. Vender para
   N clientes exigiria N repositórios e N tokens.

## Direção proposta: Cloudflare, em fases independentes

A WE já padroniza infraestrutura como código na Cloudflare
(repo `rwe-cloudflare`: Workers, D1, R2, Access com login M365). A
proposta segue esse trilho — cada fase é útil sozinha e nenhuma quebra o
que existe.

### Fase 1 — Contador de visualizações (pequena, sem mudança de arquitetura)

- **O quê**: um Worker minúsculo com um banco D1: `POST /v?f=<slug>`
  soma 1 visualização (por flipbook e por dia); `GET /v?f=<slug>`
  devolve os totais. O leitor chama o POST ao abrir (sem cookie, sem
  dado pessoal — LGPD tranquila); o painel mostra os números no cartão
  de cada publicação.
- **Infra**: Worker + D1 declarados no `rwe-cloudflare` (manifesto +
  lockfile), deploy pelo workflow de lá. Zero custo no free tier.
- **Neste repositório**: só o fetch no leitor (com falha silenciosa — se
  o Worker não responder, nada muda para o visitante) e a exibição no
  painel, lendo a URL do Worker do `catalogos.json` (campo novo em
  `identidade` ou config), nunca hardcoded.
- **Decisões**: aprovar o uso do domínio workers.dev ou um subdomínio
  próprio (ex.: `stats.weconsultoria.com.br`).

### Fase 2 — Autenticação real do painel (média)

- **O quê**: tirar o fine-grained token do navegador do cliente. O
  painel passa a falar com um Worker (mesma conta Cloudflare) que guarda
  o token do GitHub como secret e expõe só as operações que o painel usa
  (ler manifesto, commitar mudanças). Na frente do Worker, **Cloudflare
  Access com login M365** — o padrão da WE para apps internas.
- **Ganhos**: o cliente loga com e-mail/conta Microsoft (ou OTP por
  e-mail, que o Access também suporta), o token sai do localStorage, e
  dá para revogar acesso por pessoa.
- **Neste repositório**: `nucleo-admin.js` ganha um modo "via Worker"
  (a API é a mesma do GitHub, só muda a base e some o header de token);
  as contas simuladas do site de marketing continuam como demonstração.
- **Decisões**: quem são os usuários (só WE? clientes?), e se clientes
  externos entram no Entra ID (convidados) ou via OTP.

### Fase 3 — Multi-cliente com R2 (grande — só se o produto for vendido)

- **O quê**: PDFs e manifestos saem do repositório Git e vão para o R2
  (um prefixo por cliente, classe de acesso declarada no `rwe-cdn`,
  conforme o padrão da WE); o Worker da fase 2 vira a API de publicação
  (upload, manifesto, estantes) com um banco D1 de tenants; o site
  estático continua no Pages, mas lê `catalogos.json` da API.
- **Ganhos**: N clientes numa instância, PDFs privados de verdade
  (URL assinada), sem limite de tamanho do Git, upload maior que 100 MB.
- **Custos**: R2 cobra por armazenamento acima do free tier (10 GB);
  ainda assim marginal.
- **Decisões**: modelo de cobrança/planos, domínio (`flippdf.com.br`?),
  e se vale registrar a marca antes.

## O que NÃO muda em nenhuma fase

- O leitor e a estante continuam estáticos e rápidos (Pages).
- `AGENTS.md` continua valendo: sem dependência de runtime neste repo;
  toda a infra nova vive como código no `rwe-cloudflare`/`rwe-cdn`.
- Nenhum segredo entra neste repositório — tokens só em secrets dos
  repos de infra.

## Recomendação

Começar pela **Fase 1** (esforço de horas, valor imediato: "quantas
pessoas viram meu catálogo?") e pela decisão de domínio. A Fase 2 entra
quando o primeiro cliente externo for usar o painel. A Fase 3 só se o
produto for comercializado de fato.
