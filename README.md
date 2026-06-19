# Leitor de Data Books - Dormente de Concreto

Site estático preparado para rodar no **GitHub Pages**. Ele lê Data Books em PDF da CAVAN no próprio navegador e monta uma extração documental baseada na aba **DOCUMENTAL** do Excel enviado.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub, por exemplo: `databook-extractor`.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
   - O arquivo `index.html` precisa ficar direto na raiz.
   - Não coloque os arquivos dentro de uma subpasta se quiser usar GitHub Pages direto pela raiz.
3. No GitHub, entre em **Settings > Pages**.
4. Em **Build and deployment**, escolha:
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/root`
5. Clique em **Save**.
6. Aguarde alguns minutos. O GitHub vai gerar um link parecido com:
   `https://SEU-USUARIO.github.io/databook-extractor/`

## Como usar

1. Abra o site publicado ou abra o `index.html` no navegador.
2. Clique em **Escolher PDFs** e selecione um ou mais Data Books.
3. Depois da leitura, use a caixa **Lote do Data Book** para escolher qual lote deseja analisar.
4. Use também os botões/chips de lotes abaixo da caixa de seleção. Eles servem como referência rápida para o usuário saber quais lotes existem naquele Data Book.
5. O site passa a mostrar somente:
   - checklist documental do lote escolhido;
   - certificado do lote escolhido.
6. Exporte em **JSON**, **CSV** ou **XLSX**.

## Ajuste de visualização por lote

Para a página não ficar enorme após inserir um Data Book, o checklist e a tabela de certificados não aparecem todos de uma vez. Primeiro o usuário escolhe um lote na caixa de seleção.

A lista de lotes é montada automaticamente com base nos lotes encontrados na capa e nos certificados do PDF. Quando houver mais de um Data Book carregado, a seleção mostra o número do Data Book junto com o lote, por exemplo:

```text
001/26 • Lote 02349 • Bitola larga - FMT FC • 07/01/2026
```

Assim o usuário consegue escolher com segurança o lote correto, mesmo se houver vários PDFs carregados ao mesmo tempo.

## Estrutura dos arquivos

```text
index.html
styles.css
app.js
.nojekyll
assets/
  template-fields.js
README.md
```

## O que esta versão extrai automaticamente

- Cabeçalho do Data Book: cliente, mês, período, número do Data Book, modelo, produto, quantidade e lotes da capa.
- Certificados por lote: lote, data de produção, tipo de dormente, chumbadores, bobinas, notas fiscais, módulos, resistências, temperaturas e página.
- Checklist documental do Excel: usa os campos da aba `DOCUMENTAL`, gerando uma linha para cada item **em cada lote contido no Data Book**, com valores obtidos e status automático quando houver regra clara.

## Exportação

A visualização da página é filtrada por lote para facilitar a conferência. A exportação continua levando todos os lotes extraídos, com a coluna `lote`, para permitir análise completa no Excel ou futura integração com outro sistema.

## Importante

Este projeto é **100% estático**. Não usa Node, backend, banco de dados ou Supabase. Por isso serve para GitHub Pages.

As bibliotecas PDF.js e SheetJS são carregadas por CDN. Portanto, para ler PDFs e exportar XLSX, o navegador precisa ter acesso à internet.

Alguns documentos de matéria-prima dentro dos Data Books têm formatos variados. Para esses itens, esta versão localiza evidência textual e preenche como **OK** quando encontra termos compatíveis. Quando não encontra, deixa **NA** para conferência manual ou futura melhoria do parser.
