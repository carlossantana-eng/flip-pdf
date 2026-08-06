# Handoff: FlipPDF dentro do WE Station

Estado: **guia de migração**. O FlipPDF deixa de ser um site isolado no
GitHub Pages e passa a rodar como módulo do WE Station. Este documento
entrega tudo o que é preciso para remontar lá a parte de **estantes,
upload/publicação, organização de arquivos, editor e leitor flipbook**.

**Fora do escopo desta migração** (não levar): página inicial da
plataforma (`index.html`), login/cadastro simulados (`login.html`,
`cadastro.html`, `conta-simulada.js`), `como-funciona.html`,
`precos.html` e o aviso de planos no estúdio de publicação. Perfis de
usuário ficam a cargo do WE Station.

---

## 1. O que o produto faz (visão de 1 minuto)

1. O dono envia PDFs; cada PDF vira um **flipbook** (leitor com efeito
   de virar página — dupla no desktop, única no celular).
2. Os flipbooks são expostos em **estantes públicas** — uma principal e
   quantas extras o dono criar, cada uma com link, cores e capa próprios.
3. Internamente o dono organiza tudo em **pastas** (privadas, não afetam
   a estante), com **busca**, **ordenação** e **lixeira** com expurgo
   automático em 30 dias.
4. Um **editor** por publicação ajusta título, descrição, estante, capa,
   música de fundo e permissão de download.

## 2. Arquitetura atual × o que muda no WE Station

Hoje é um site 100% estático. A "base de dados" é um repositório Git:

- **Estado**: um único JSON (`catalogos.json`, o *manifesto*) + arquivos
  binários (`catalogos/*.pdf`, `catalogos/capas/*`, `catalogos/musicas/*`,
  `assets/estantes/*`, `assets/identidade/*`).
- **Escrita**: as páginas de gestão gravam direto na `main` via API do
  GitHub (Git Data API), autenticadas por um fine-grained token colado
  pelo dono no navegador (localStorage).
- **Publicação**: workflow do GitHub Actions regenera o manifesto e
  artefatos de build e publica no Pages (1–2 min de latência).

No WE Station, três substituições resolvem a migração inteira:

| Hoje (GitHub) | No WE Station |
|---|---|
| `catalogos.json` na `main` | Registro/tabela equivalente no backend (o formato do §3 é o contrato) |
| Binários commitados no repo | Storage de arquivos do WE Station (padrão WE: R2 via `rwe-cdn`, com classe de acesso declarada — estantes são públicas) |
| Token GitHub no localStorage + Git Data API (`nucleo-admin.js`) | API autenticada do WE Station (padrão WE: app interna atrás de Cloudflare Access com login M365) |
| Workflow do Pages (latência 1–2 min) | Desnecessário — escrita na API reflete na hora |

Ponto central do design que torna isso barato: **só um módulo fala com o
GitHub** (`assets/js/nucleo-admin.js`, 176 linhas). Todas as páginas de
gestão usam apenas três primitivas dele:

- `buscarManifesto()` → devolve o JSON do manifesto;
- `commitar(mudancas, mensagem)` → aplica um lote atômico de mudanças
  (`[{ caminho, conteudoBase64 }]`; conteúdo `null` = apagar arquivo);
  o manifesto atualizado sempre vai no mesmo lote;
- `temToken()` → há credencial? (controla o que aparece na UI).

Reimplementar essas três funções contra a API do WE Station migra o
painel inteiro sem tocar na lógica das telas. O equivalente de
`commitar` deve ser **transacional**: ou grava arquivos + manifesto
juntos, ou nada (hoje é um commit Git único por ação, com 3 tentativas
em caso de corrida — ver §6).

## 3. Modelo de dados — o contrato (`catalogos.json`)

Tudo vive num único documento. Campos ausentes têm significado (padrão);
as páginas **removem** o campo quando o valor volta ao padrão — não
gravam `false`/vazio.

### Top-level

| Campo | Tipo | Significado |
|---|---|---|
| `titulo` | string | Nome da estante principal (e do site) |
| `descricao` | string? | Subtítulo da estante principal |
| `catalogos` | array | As publicações (abaixo) |
| `pastas` | string[]? | Nomes das pastas privadas (a associação fica em cada catálogo) |
| `estantes` | array? | Estantes extras (abaixo); a principal não entra aqui |
| `identidade` | objeto? | Identidade da estante principal: `cor`, `corSecundaria`, `corFundo`, `logo` (caminho), `capa` (caminho do banner) |
| `perfil` | objeto? | `nome`, `email`, `whatsapp` (só dígitos com DDI). No WE Station, perfil vem da conta — mas **`whatsapp` alimenta o botão de conversa** na estante e no leitor; preservar essa configuração em algum lugar |

### Entrada de catálogo (`catalogos[]`)

| Campo | Tipo | Significado / regra |
|---|---|---|
| `arquivo` | string | **Chave primária**: nome do PDF, slug único (ver normalização no §5.1) |
| `titulo` | string | Obrigatório, até 90 caracteres |
| `adicionadoEm` | string | Data `AAAA-MM-DD` |
| `descricao` | string? | Até 160 caracteres |
| `pasta` | string? | Pasta privada; ausente = raiz de "Meus Arquivos" |
| `estante` | string? | `id` da estante pública; **ausente = principal** |
| `ordem` | number? | Posição na estante (menor primeiro); ausente = entra depois dos ordenados, por data desc |
| `capa` | string? | Caminho da imagem de capa (própria ou WebP pré-gerada) |
| `musica` | string? | Caminho do MP3 de fundo do leitor |
| `permitirDownload` | false? | Só existe quando o download está **bloqueado**; ausente = permitido |
| `lixeira` | true? | Soft delete: some da estante e do leitor |
| `lixeiraEm` | string? | Data de entrada na lixeira (base do expurgo de 30 dias) |

### Estante extra (`estantes[]`)

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string | Slug único (derivado do nome; sufixo `-2`, `-3`… em colisão; `principal` é reservado) |
| `nome` | string | Nome exibido |
| `descricao` | string? | Subtítulo |
| `criadaEm` | string | Data `AAAA-MM-DD` |
| `cor`, `corSecundaria`, `corFundo` | string? | Cores hex; ausente = herda o padrão do tema (ver §5.2) |
| `capa` | string? | Banner do topo da estante |

## 4. Inventário de código — o que levar e como

### Portável quase como está (JS puro, ES modules, zero framework)

| Arquivo | Papel | Acoplamento a trocar |
|---|---|---|
| `assets/js/leitor.js` (809 l.) | Leitor flipbook completo (§5.5) | Nenhum com GitHub. Só lê o manifesto por `fetch` e o PDF por URL — apontar para a API/storage |
| `assets/js/estante.js` (314 l.) | Estante pública (§5.4) | Idem; usa `temToken()` só para exibir o lápis de edição |
| `assets/js/publicar.js` (483 l.) | Estúdio de upload em 3 etapas (§5.1) | `buscarManifesto`/`commitar`; o poll do workflow (linhas ~379–398) **cai fora** — sem Pages, publicar é síncrono |
| `assets/js/arquivos.js` (518 l.) | Meus Arquivos: pastas, busca, ordenação, lixeira (§5.3) | `buscarManifesto`/`commitar` |
| `assets/js/estantes.js` (530 l.) | Gestão de estantes: criar, personalizar, ordenar, excluir (§5.2) | `buscarManifesto`/`commitar` |
| `assets/js/editor.js` (294 l.) | Editor por publicação com prévia ao vivo (iframe do leitor) | `buscarManifesto`/`commitar` |
| `assets/js/dialogo.js` (113 l.) | Diálogos `pedirTexto`/`confirmar` (usa `<dialog>`) | Nenhum |
| `assets/js/nucleo-admin.js` (176 l.) | **Reescrever**: manter a interface, trocar o transporte | É o próprio adaptador |
| `assets/css/estilo.css` (2.428 l.) | Todo o visual (painel, estante, leitor) | Variáveis CSS no `:root`; adaptar ao shell do WE Station |
| HTMLs correspondentes | `publicar.html`, `arquivos.html`, `estantes.html`, `editor.html`, `configuracoes.html`, `estante.html`, `leitor.html` | Os scripts esperam os `id`s desses HTMLs — levar o markup junto |

Utilitários de `nucleo-admin.js` que as telas importam e devem continuar
existindo no novo adaptador: `nomeSeguro`, `tituloDoNome`,
`arquivoParaBase64` (ou equivalente de upload), `dataLegivel`,
`corDeTexto` (contraste WCAG usado no tema dinâmico das estantes).

### Bibliotecas vendorizadas (copiar `assets/vendor/`)

- **PDF.js** (`pdf.min.mjs` + `pdf.worker.min.mjs`) — renderização de
  páginas, extração de texto (busca), outline (sumário), anotações
  (links clicáveis).
- **StPageFlip** (`page-flip.browser.js`) — animação de virada; exposto
  como global `St`. Métodos usados: `loadFromImages`, `updateFromImages`,
  `flip`, `flipNext`, `flipPrev`, `turnToPage`, `getOrientation`, eventos
  `flip`/`changeState`/`changeOrientation`.

Manter vendorizado (sem CDN) segue valendo como boa prática no WE Station.

### Não levar

`index.html`, `login.html`, `cadastro.html`, `como-funciona.html`,
`precos.html`, `conta-simulada.js`, `admin.html`/`admin.js` (o painel-home
com saudação — o WE Station tem o próprio shell/navegação; as ações dele
apontam para as telas acima), `tema.js` (alternância claro/escuro do
painel — usar o tema do WE Station), `404.html`, workflows, scripts de
build (§7), fluxo de token do GitHub (telas "cole sua chave" e afins).

## 5. Regras de negócio (especificação de comportamento)

O que segue é o que precisa continuar verdadeiro depois da migração —
é destilado do código, não da documentação.

### 5.1 Upload / publicação (`publicar.js`)

Fluxo em 3 etapas: **escolher** (clique ou arrastar-e-soltar, múltiplos
PDFs) → **configurar** (título, pasta, descrição, capa, download, por
arquivo) → **enviar** (lote inteiro numa única transação, com anel de
progresso).

- **Normalização do nome** (`nomeSeguro`): remove acentos (NFD), troca
  tudo que não é `[a-zA-Z0-9]` por `-`, minúsculas, apara hífens;
  vazio vira `catalogo`. O resultado (`<slug>.pdf`) é a chave da
  publicação. Título sugerido (`tituloDoNome`): nome sem extensão,
  `-_` viram espaço, primeira letra maiúscula.
- **Mesmo slug já publicado = substituição** do PDF, avisada na UI
  ("substituirá o flipbook existente com este nome").
- **Limites**: PDF até 60 MB; capa própria PNG/JPG/WebP até 2 MB.
  (No repositório o teto era ditado pelo Git; o WE Station pode subir,
  mas manter validação client-side com mensagem clara.)
- **Capa automática**: sem capa própria, gera-se um WebP da 1ª página
  (480 px de largura, qualidade 0.82, descartado se >512 KB) no
  navegador via PDF.js + canvas — para a estante pública servir imagem
  leve em vez de renderizar PDF no aparelho do visitante. Se a geração
  falhar, segue sem capa (a estante renderiza a 1ª página na hora,
  como fallback).
- Ao gravar: entrada nova ganha `adicionadoEm` = hoje; campos vazios
  são **removidos** (não gravados vazios); capa antiga com caminho
  diferente é apagada no mesmo lote; republicar algo que estava na
  lixeira limpa `lixeira`/`lixeiraEm`.
- Título é obrigatório para todos os itens do lote antes de enviar.
- `beforeunload` avisa se a pessoa tentar fechar durante o envio.

### 5.2 Estantes (`estantes.js`)

- **A principal é implícita**: não existe em `estantes[]`; seu nome é o
  `titulo` top-level, cores/capa vivem em `identidade`. Catálogo sem
  campo `estante` pertence a ela.
- **Criar**: slug do nome (mesma normalização do §5.1, sem `.pdf`);
  colisão com `principal` ou com ids existentes gera sufixo `-2`, `-3`…
- **Personalizar**: nome, descrição e 3 cores (primária = botões/realce,
  secundária = painel/prateleiras, fundo). Cores **só são gravadas
  quando diferem do padrão do tema** (`#88da10`, `#0b0d08`, `#000000`)
  — igualou o padrão, o campo é removido (herança). Capa/banner:
  PNG/JPG/WebP até 2 MB, gravada em `assets/estantes/<id>.<ext>`
  (a da principal também, com id `principal`); trocar apaga a anterior
  no mesmo lote.
- **Compor**: diálogo de checkboxes marca em quais estantes cada
  flipbook aparece — na prática, define o campo `estante` de cada
  catálogo (marcar na principal = remover o campo).
- **Ordenar**: arrastar-e-soltar + setas ↑↓ (acessível); ao salvar,
  grava `ordem` = índice (0, 1, 2…) na sequência final.
- **Excluir estante**: os flipbooks dela **voltam à principal**
  (remove-se o campo `estante` de cada um) — nunca se apaga conteúdo
  junto. A principal não pode ser excluída.
- Cada estante tem link público próprio (`estante.html?e=<id>`; a
  principal sem parâmetro) e página de compartilhamento com Open Graph
  (§7).

### 5.3 Meus Arquivos (`arquivos.js`)

- **Pastas são organização privada** — não aparecem na estante pública e
  são independentes do campo `estante`. Criar (nome único,
  case-insensitive), renomear (atualiza `pasta` de todos os catálogos) e
  excluir (os arquivos **voltam à raiz**, nada é apagado).
- **Busca** por título (sem acentos, case-insensitive) e **ordenação**
  "recentes" (`adicionadoEm` desc, título asc como desempate) ou "A–Z"
  (locale pt-BR).
- **Lixeira** (soft delete): marca `lixeira: true` + `lixeiraEm` = hoje.
  Some da estante e do leitor, continua listada na aba Lixeira. Ações:
  restaurar (com "Desfazer" em toast de 8 s ao enviar), excluir
  definitivo (com confirmação) e esvaziar tudo.
- **Expurgo automático**: item com `lixeiraEm` > 30 dias atrás é
  excluído de vez ao abrir a página (hoje: PDF + capa + música saem do
  repo num commit automático). Registro antigo sem `lixeiraEm` ganha a
  data de hoje (conta 30 dias dali). **No WE Station isso deve virar um
  job agendado no backend** — depender da abertura de uma página é
  limitação do modelo estático, não requisito.
- **Exclusão definitiva apaga o conjunto**: PDF + capa + música + a
  entrada no manifesto, tudo na mesma transação (`arquivosDe()`).

### 5.4 Estante pública (`estante.js`)

- Lista os catálogos com `!lixeira` e `estante` igual ao id da página,
  ordenados por: `ordem` asc (ausente = infinito) → `adicionadoEm` desc
  → título asc.
- **Capas**: usa `capa` se existir (imagem leve, `loading=lazy`); senão
  renderiza a 1ª página do PDF no navegador com
  `disableAutoFetch: true` (PDF.js baixa só os trechos necessários, com
  requisições Range — o storage do WE Station precisa **suportar HTTP
  Range** para manter isso). Máximo de 2 capas renderizando em paralelo
  para não travar celular.
- **Tema dinâmico**: as cores da estante viram variáveis CSS em runtime,
  com contraste automático (texto preto ou branco pela luminância WCAG
  — função `corDeTexto`). Capa/banner vira fundo do hero com gradiente
  escurecedor. Logo da identidade na barra.
- Busca por título no cliente; estado vazio amigável; botão flutuante
  de WhatsApp quando `perfil.whatsapp` existe (mensagem pré-preenchida
  com o nome da estante).
- Dono logado (hoje: `temToken()`) vê um lápis em cada capa que leva ao
  editor — visitantes não.

### 5.5 Leitor flipbook (`leitor.js`)

Recebe `?c=<arquivo.pdf>` + opcional `#p=<página>`. Recusa catálogo
inexistente ou na lixeira. Funcionalidades a preservar:

- **Renderização progressiva**: mostra o livro assim que capa, primeira
  dupla e página do link estão prontas; o resto renderiza em segundo
  plano **priorizando a página mais próxima da atual**; barra de
  progresso; página provisória "Carregando…" nas ainda não prontas.
  Resolução: largura 880 px × devicePixelRatio (teto 2), máx. 1440 px,
  JPEG 0.85.
- **Página dupla no desktop, única no celular** (StPageFlip decide pela
  largura; capa sempre sozinha). Redimensionamento calcula a largura
  que faz o livro caber na altura do palco.
- **Navegação**: setas na tela, teclado (←/→, Home/End), barra de
  progresso arrastável (vai direto, sem animação), miniaturas (tecla
  `m`), link profundo `#p=N` gravado a cada virada (e `hashchange`
  navega com o leitor aberto).
- **Lupa** (tecla/botão): página ampliada de 0 (inteira na tela) a +300
  (4×), com botões, slider e ←/→ entre páginas; render dedicado em alta
  resolução (até 2600 px) com cache.
- **Busca por texto** (tecla `b`): extrai o texto de todas as páginas
  uma única vez (PDF.js `getTextContent`), busca sem acentos, até 60
  resultados (máx. 3 por página) com trecho destacado; clicar vai à
  página. Mensagem específica para PDF sem texto (só imagens).
- **Sumário** (tecla `s`): outline do PDF, com indentação por nível;
  aparece só quando o PDF tem outline.
- **Links clicáveis do PDF**: anotações de link viram áreas clicáveis
  sobrepostas às páginas visíveis (URLs externas em nova aba; destinos
  internos viram `flip`). Recalculadas a cada virada/resize; escondidas
  durante a animação; proteção contra corrida por número de geração.
- **Música de fundo** (se `musica`): loop, volume 0.45, tenta autoplay
  e, se bloqueado, começa no primeiro toque; botão liga/desliga.
- **Compartilhar**: Web Share API quando existe; senão copia o link.
  Compartilha a página com Open Graph (§7) **preservando `#p=N`**.
- **Download**: botão visível salvo `permitirDownload: false`.
- **Tema**: cores da estante a que o flipbook pertence (ou da
  identidade, se principal). Botão "voltar" leva à estante certa
  (`?e=<id>`). WhatsApp na barra quando configurado.
- **Acessibilidade**: `prefers-reduced-motion` reduz a virada para
  50 ms (padrão 400 ms); atalhos de letra ignorados enquanto se digita;
  tela cheia opcional.

### 5.6 Configurações que sobrevivem fora do "perfil"

De `configuracoes.js`, ignorando o perfil em si: título/descrição da
estante principal, **logomarca** (`identidade.logo`, PNG/JPG/WebP/SVG
até 2 MB — aparece na barra da estante e do leitor) e o **WhatsApp
comercial** (normalizado para dígitos; sem DDI assume `55`). No WE
Station, essas são configurações do módulo, não do usuário.

## 6. Concorrência e integridade

O padrão atual em **toda** operação de escrita é:

1. **Rebuscar o manifesto fresco** do servidor (nunca confiar no que
   está na tela);
2. aplicar a mutação em memória;
3. gravar arquivos + manifesto **numa transação única**;
4. em conflito de corrida (hoje HTTP 409/422 quando a `main` andou),
   **repetir do passo 1** até 3 vezes.

No WE Station: transação de banco + lock otimista (versão/etag no
manifesto) reproduz isso melhor. Manter o princípio de que a UI nunca
grava um manifesto derivado de leitura velha.

Outros invariantes de integridade:

- Arquivo órfão não existe: capa/música trocada ou excluída sai do
  storage na mesma transação; exclusão definitiva leva PDF + capa +
  música juntos.
- `arquivo` (slug) é único; `id` de estante é único e `principal` é
  reservado.
- Excluir contêiner (pasta, estante) **nunca** exclui conteúdo — sempre
  devolve à raiz/principal. (Mesma filosofia do "reconcile nunca
  deleta" dos padrões WE.)

## 7. O que hoje é build e vira responsabilidade do servidor

O workflow `publicar.yml` roda scripts que deixam de existir como build
e viram features do backend:

- **`gerar-manifesto.mjs`** — reconciliação manifesto ↔ pasta de PDFs
  (entradas novas para PDFs soltos, remoção de entradas sem PDF,
  detecção de capa por convenção de nome). Só existe porque há duas
  portas de escrita (painel e upload direto no repo). Com API única no
  WE Station, **desaparece** — a API é a única porta.
- **`gerar-compartilhamento.mjs`** — páginas estáticas `f/<slug>.html`
  (flipbook) e `e/<id>.html` (estante) com meta tags **Open Graph**,
  porque WhatsApp/redes não executam JS. Essencial manter o efeito:
  no WE Station, as rotas públicas de flipbook/estante devem servir
  `og:title`, `og:description`, `og:image` (capa; fallback logo),
  `og:url` e `twitter:card` **renderizados no servidor** — aí os links
  compartilháveis passam a ser a própria URL canônica, sem páginas de
  redirecionamento. Preservar o repasse do fragmento `#p=N`.
- **`gerar-sitemap.mjs`** — sitemap/robots; adotar o mecanismo que o WE
  Station já tiver (as páginas `f/` e `e/` entram, o resto é interno).
- **Carimbo de versão** (`__VERSAO__` → hash nos links de CSS/JS para
  cache-busting) — usar o pipeline de assets do WE Station.

## 8. Autenticação e autorização

- Hoje: quem tem o token do GitHub no navegador é "o dono" — um único
  papel, uma única estante-site. As telas só escondem botões
  (`temToken()`); a segurança real era a do token.
- No WE Station: login M365/Cloudflare Access conforme o padrão WE para
  apps internas. O adaptador que substituir `nucleo-admin.js` passa a
  usar a sessão do WE Station; `temToken()` vira "usuário autenticado
  com permissão de gestão". **Nenhum segredo no cliente.**
- As rotas públicas (estante, leitor, arquivos PDF/capas/músicas das
  estantes públicas) ficam fora do Access — são o produto que o cliente
  final vê. Se PDFs privados entrarem no roadmap, é URL assinada no
  storage (previsto na Fase 3 do `docs/BACKEND.md`).
- Se o WE Station for multi-tenant: o manifesto inteiro (e o prefixo de
  storage) é **por tenant**; slugs são únicos por tenant, não globais.

## 9. Testes — o que existe e como aproveitar

`tests/` tem 11 suítes Playwright (Node puro, sem framework de teste)
orquestradas por `tests/rodar.mjs`, que sobe um servidor local e
**simula a API do GitHub** (nenhum teste toca a rede). Cobrem: estúdio
de publicação (lote, capa, substituição), Meus Arquivos (pastas,
lixeira, expurgo 30 dias), estantes (criar/personalizar/ordenar/excluir),
editor, leitor (navegação, lupa, busca, música, links), temas e capturas
de tela de referência em `tests/capturas/`.

Valor para a migração: as suítes são a **especificação executável** do
comportamento do §5. Ao portar, trocar o mock da API do GitHub por um
mock da API do WE Station mantém a cobertura — a maior parte dos
seletores e fluxos de UI permanece válida se o markup for levado junto.

## 10. Roteiro sugerido de migração

1. **Contrato**: definir no WE Station o armazenamento do manifesto
   (§3) e o endpoint transacional equivalente a
   `buscarManifesto`/`commitar` (§6), + storage de binários com HTTP
   Range (§5.4).
2. **Adaptador**: reescrever `nucleo-admin.js` contra essa API mantendo
   a interface (é o único ponto de contato — §2).
3. **Público primeiro**: portar `estante.html`/`leitor.html` (+ vendor,
   CSS) lendo da nova API — dá para validar com dados reais sem nenhuma
   tela de gestão.
4. **Gestão**: portar `publicar`, `arquivos`, `estantes`, `editor`,
   `configuracoes` (sem o bloco de perfil), removendo o poll de workflow
   do `publicar.js` e as telas de token.
5. **Servidor**: OG server-side (§7), job de expurgo da lixeira (§5.3),
   autorização (§8).
6. **Testes**: adaptar `tests/` com mock da nova API (§9).
7. **Decomissionamento** deste site (Pages) só depois do WE Station em
   produção — ato manual e deliberado, documentado aqui no repo.

## 11. Referências dentro deste repositório

- `AGENTS.md` — regras atuais do repo (várias deixam de valer no WE
  Station, ex.: "site estático sem runtime").
- `docs/BACKEND.md` — proposta anterior de backend em fases
  (Cloudflare). A migração para o WE Station **substitui as Fases 2 e 3**
  daquela proposta; a Fase 1 (contador de visualizações) segue válida
  como feature futura do módulo.
- `README.md` — retrato do produto hoje, com o passo a passo do fluxo
  GitHub que será aposentado.
