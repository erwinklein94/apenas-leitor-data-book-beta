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
3. Confira:
   - resumo do Data Book;
   - checklist documental;
   - certificados por lote.
4. Exporte em **JSON**, **CSV** ou **XLSX**.

## Estrutura dos arquivos

```text
index.html
styles.css
app.js
.nojekyll
assets/
  template-fields.js
samples/
  resultado-extracao-anexos.json
README.md
```

## O que esta primeira versão extrai automaticamente

- Cabeçalho do Data Book: cliente, mês, período, número do Data Book, modelo, produto, quantidade e lotes da capa.
- Certificados por lote: lote, data de produção, tipo de dormente, chumbadores, bobinas, notas fiscais, módulos, resistências, temperaturas e página.
- Checklist documental do Excel: usa os campos da aba `DOCUMENTAL`, com valores obtidos e status automático quando houver regra clara.

## Importante

Este projeto é **100% estático**. Não usa Node, backend, banco de dados ou Supabase. Por isso serve para GitHub Pages.

As bibliotecas PDF.js e SheetJS são carregadas por CDN. Portanto, para ler PDFs e exportar XLSX, o navegador precisa ter acesso à internet.

Alguns documentos de matéria-prima dentro dos Data Books têm formatos variados. Para esses itens, esta versão localiza evidência textual e preenche como **OK** quando encontra termos compatíveis. Quando não encontra, deixa **NA** para conferência manual ou futura melhoria do parser.
