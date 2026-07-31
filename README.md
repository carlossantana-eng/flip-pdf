# Estante Virtual de Catálogos

Site estático que publica seus catálogos em PDF como uma **estante virtual**:
os clientes acessam um link, veem as capas e folheiam o catálogo no navegador
com efeito de virar página (flipbook) — no computador em página dupla, no
celular em página única. Nada de mandar arquivo por WhatsApp ou e-mail.

**Modelos de referência:** Calameo e FlipHTML5 — mas aqui tudo roda no seu
próprio repositório, de graça, no GitHub Pages.

## Como adicionar um catálogo

### Pela página de gestão (recomendado)

Abra **`/admin.html`** no site publicado (botão "Publicar" na barra da
estante). O painel tem saudação, cartões de ação e menu lateral. Por lá você:

- **envia PDFs** (clique ou arraste e solte) — inclusive **em lote**:
  vários arquivos de uma vez, publicados num único commit;
- **edita título e descrição** de cada catálogo;
- **exclui** catálogos;
- edita o **título e a descrição da estante** e o **nome exibido na
  saudação do painel**;
- acompanha o **status de publicação**.

Em **`/arquivos.html`** ("Meus Arquivos", acessível pelo menu do painel)
você organiza as publicações como no FlipHTML5:

- **pastas** para agrupar catálogos (criar, renomear, excluir — os
  arquivos nunca são apagados junto);
- **busca** por nome e **ordenação** (recentes ou A–Z);
- **lixeira**: excluir manda o catálogo para a lixeira (ele some da
  estante mas continua no repositório); de lá dá para **restaurar** ou
  **excluir definitivamente**. Pastas e lixeira ficam registradas no
  `catalogos.json` (campos `pasta` e `lixeira`).

Na primeira vez, a página pede uma **chave de acesso do GitHub**
(fine-grained token). O passo a passo aparece na própria página; em resumo:

1. Crie a chave em <https://github.com/settings/personal-access-tokens/new>.
2. Em *Repository access*, selecione **apenas este repositório**.
3. Em *Permissions → Contents*, escolha **Read and write** (nada mais).
4. Copie o código (`github_pat_…`) e cole na página.

A chave fica salva **somente no navegador em que você colou** (localStorage)
e conversa apenas com a API do GitHub. Quando expirar, crie outra e cole de
novo. Para revogar: <https://github.com/settings/personal-access-tokens>
(rotina de rotação: revogar a antiga → criar nova → colar na página).

### Pelo GitHub (alternativa)

1. Abra a pasta [`catalogos/`](catalogos/) aqui no GitHub.
2. Clique em **Add file → Upload files** e envie o PDF.
3. Faça o commit na branch `main`.

O GitHub Actions atualiza o `catalogos.json` e republica o site sozinho em
1–2 minutos. O título do catálogo é derivado do nome do arquivo
(`tabela-precos-2026.pdf` → "Tabela precos 2026").

> Dica: use nomes de arquivo sem acentos e sem espaços
> (ex.: `catalogo-lupulos-2026.pdf`). A página de gestão já normaliza o
> nome automaticamente.

### Ajustar título ou descrição

Edite o [`catalogos.json`](catalogos.json) e mude o campo `titulo` (ou
adicione `descricao`) da entrada. Suas edições são preservadas quando o
manifesto é regenerado — só os campos que você não mexeu são automáticos.

```json
{
  "arquivo": "tabela-precos-2026.pdf",
  "titulo": "Tabela de Preços 2026",
  "adicionadoEm": "2026-07-31"
}
```

O `titulo` e a `descricao` no topo do `catalogos.json` controlam o cabeçalho
da estante.

### Capa personalizada (opcional)

Por padrão a capa é a 1ª página do PDF, gerada automaticamente. Se quiser
outra imagem, envie um arquivo com o **mesmo nome** do PDF para
`catalogos/capas/` (ex.: `catalogos/capas/tabela-precos-2026.jpg`).
Formatos aceitos: jpg, jpeg, png, webp.

### Remover um catálogo

Exclua o PDF da pasta `catalogos/` (no GitHub: abra o arquivo → menu `…` →
**Delete file**). O manifesto e a estante se atualizam sozinhos.

## Publicação (fazer uma única vez)

O site é servido pelo **GitHub Pages**. Para ativar:

1. Vá em **Settings → Pages** deste repositório.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Faça qualquer push na `main` (ou rode o workflow *Publicar estante*
   manualmente em **Actions**).

O endereço do site será `https://<seu-usuario>.github.io/flip-pdf/`.
É esse link que você manda para os clientes — ou o link direto de um
catálogo, ex.: `https://<seu-usuario>.github.io/flip-pdf/leitor.html?c=catalogo-exemplo.pdf`.

> **Atenção:** em conta gratuita do GitHub, o Pages só funciona em
> repositório **público**. Os PDFs ficam acessíveis a quem tiver o link.

## Recursos do leitor

- Efeito de virar página (arraste o canto, use as setas ou o teclado).
- Página dupla no computador, página única no celular.
- Lupa para ampliar a página (útil para tabelas de preço).
- Link direto para uma página específica (`#p=5`) — o botão
  **Compartilhar** já copia o link da página atual.
- Botões de baixar o PDF e tela cheia.
- Carregamento progressivo: o catálogo abre rápido e as demais páginas
  são preparadas em segundo plano.

## Estrutura do repositório

| Caminho | O que é |
|---|---|
| `catalogos/` | Os PDFs publicados (e `capas/` opcionais) |
| `catalogos.json` | Manifesto da estante (gerado/atualizado pelo CI) |
| `index.html` + `assets/js/estante.js` | A estante (grade de capas) |
| `leitor.html` + `assets/js/leitor.js` | O leitor flipbook |
| `admin.html` + `assets/js/admin.js` | Página de gestão (upload/edição pelo navegador, via API do GitHub) |
| `assets/vendor/` | PDF.js e StPageFlip hospedados localmente (sem CDN) |
| `scripts/gerar-manifesto.mjs` | Sincroniza o manifesto com a pasta `catalogos/` (Node, sem dependências) |
| `.github/workflows/publicar.yml` | Atualiza o manifesto e publica no Pages a cada push na `main` |
| `.github/workflows/verificar.yml` | Validação offline em pull requests |

O arquivo `catalogos/catalogo-exemplo.pdf` é só uma demonstração —
**pode excluir** quando publicar os catálogos reais.

## Rodar localmente

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

(Precisa de um servidor local porque o navegador bloqueia `fetch` em
páginas abertas direto do disco.)
