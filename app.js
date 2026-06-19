/*
  Leitor de Data Books - CAVAN / Dormentes de Concreto
  - PDF.js faz a leitura textual no navegador.
  - O array window.DATABOOK_TEMPLATE_ROWS vem da aba DOCUMENTAL do Excel enviado.
  - Exportação em JSON, CSV e XLSX.
*/

const state = {
  databooks: [],
  flatChecklist: [],
  flatLots: []
};

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const els = {
  input: document.getElementById("pdfInput"),
  selectBtn: document.getElementById("selectBtn"),
  dropzone: document.getElementById("dropzone"),
  clearBtn: document.getElementById("clearBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportXlsxBtn: document.getElementById("exportXlsxBtn"),
  status: document.getElementById("status"),
  totalFiles: document.getElementById("totalFiles"),
  kpiDataBooks: document.getElementById("kpiDataBooks"),
  kpiLotes: document.getElementById("kpiLotes"),
  kpiCertificados: document.getElementById("kpiCertificados"),
  kpiPendencias: document.getElementById("kpiPendencias"),
  summaryPanel: document.getElementById("summaryPanel"),
  checklistPanel: document.getElementById("checklistPanel"),
  lotsPanel: document.getElementById("lotsPanel"),
  summaryBody: document.querySelector("#summaryTable tbody"),
  checklistBody: document.querySelector("#checklistTable tbody"),
  lotsBody: document.querySelector("#lotsTable tbody"),
  searchInput: document.getElementById("searchInput")
};

els.selectBtn.addEventListener("click", () => els.input.click());
els.input.addEventListener("change", event => handleFiles(Array.from(event.target.files || [])));
els.clearBtn.addEventListener("click", clearAll);
els.exportJsonBtn.addEventListener("click", exportJson);
els.exportCsvBtn.addEventListener("click", exportCsv);
els.exportXlsxBtn.addEventListener("click", exportXlsx);
els.searchInput.addEventListener("input", renderAll);

["dragenter", "dragover"].forEach(evt => {
  els.dropzone.addEventListener(evt, e => {
    e.preventDefault();
    els.dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach(evt => {
  els.dropzone.addEventListener(evt, e => {
    e.preventDefault();
    els.dropzone.classList.remove("dragover");
  });
});
els.dropzone.addEventListener("drop", e => {
  const files = Array.from(e.dataTransfer.files || []).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
  handleFiles(files);
});

async function handleFiles(files) {
  if (!files.length) return;
  if (!window.pdfjsLib) {
    setStatus("PDF.js não carregou. Verifique sua internet ou inclua a biblioteca localmente.", true);
    return;
  }
  setStatus(`Lendo ${files.length} PDF(s)...`);
  toggleExports(false);

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      setStatus(`Lendo ${i + 1}/${files.length}: ${file.name}`);
      const pages = await readPdf(file);
      const parsed = parseDataBook(file.name, pages);
      results.push(parsed);
    } catch (err) {
      console.error(err);
      results.push({
        fileName: file.name,
        error: err.message || String(err),
        header: {},
        certificados: [],
        checklist: []
      });
    }
  }

  state.databooks.push(...results);
  rebuildFlatData();
  renderAll();
  toggleExports(state.databooks.length > 0);
  const ok = results.filter(r => !r.error).length;
  setStatus(`<strong>${ok}</strong> PDF(s) lido(s). Confira as tabelas antes de exportar.`);
}

async function readPdf(file) {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items || [];
    const text = items.map(item => item.str).join("\n");
    pages.push({ page: pageNumber, text });
  }
  return pages;
}

function parseDataBook(fileName, pages) {
  const allText = pages.map(p => p.text).join("\n\n");
  const header = extractHeader(pages[0]?.text || "", allText);
  const certificados = pages
    .filter(p => /CERTIFICADO DE QUALIDADE DO LOTE/i.test(p.text))
    .map(p => parseCertificatePage(p.text, p.page));

  const checklist = buildChecklist({ fileName, header, certificados, pages, allText });
  return {
    fileName,
    pages: pages.length,
    parsedAt: new Date().toISOString(),
    header,
    certificados,
    checklist
  };
}

function extractHeader(firstPage, allText) {
  const header = {
    fornecedor: /CAVAN/i.test(firstPage) ? "CAVAN Pré Moldado S/A" : "",
    cliente: matchText(firstPage, /CLIENTE:\s*([^\n]+)/i),
    mes: matchText(firstPage, /((?:JANEIRO|FEVEREIRO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+\d{4})/i),
    dataBook: matchText(firstPage, /DATA BOOK\s+(\d{3}\/\d{2})/i),
    periodoInicio: "",
    periodoFim: "",
    lotes: [],
    quantidade: null,
    produto: "",
    modelo: ""
  };

  const period = firstPage.match(/Período de produção:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (period) {
    header.periodoInicio = period[1];
    header.periodoFim = period[2];
  }

  const loteBlock = firstPage.match(/Lotes:\s*([\s\S]*?)\nQuantidade:/i);
  if (loteBlock) header.lotes = unique((loteBlock[1].match(/\b\d{4,5}\b/g) || []).map(n => n.padStart(5, "0")));

  const quantidade = matchText(firstPage, /Quantidade:\s*([\d\.]+)/i);
  header.quantidade = quantidade ? Number(quantidade.replace(/\./g, "")) : null;
  header.produto = clean(matchText(firstPage, /Produto:\s*([\s\S]*?)\nModelo:/i));
  header.modelo = clean(matchText(firstPage, /Modelo:\s*([^\n]+)/i));
  return header;
}

function parseCertificatePage(text, pageNumber) {
  const cert = {
    page: pageNumber,
    cliente: "",
    lote: "",
    dataProducao: "",
    tipoDormente: "",
    lotesChumbadores: "",
    notasFiscais: [],
    bobinas: [],
    modulosElasticidade: [],
    limitesMpa: [],
    resistenciaConcreto: [],
    temperaturas: [],
    temperaturaMax: null,
    temperaturaInicialMax: null,
    taxaAquecimentoMax: null
  };

  const idPattern = text.match(/RUMO[^\n]*\n\s*([^\n]*Bitola[^\n]*)\n\s*(\d{4,5})\n\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (idPattern) {
    cert.cliente = clean((text.match(/RUMO[^\n]*/i) || [""])[0]);
    cert.tipoDormente = clean(idPattern[1]);
    cert.lote = idPattern[2].padStart(5, "0");
    cert.dataProducao = idPattern[3];
  } else {
    const dates = [...text.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)].map(m => ({ value: m[0], index: m.index }));
    const prodDate = dates.find(d => !/08\/01\/2025/.test(d.value)) || dates[0];
    if (prodDate) {
      cert.dataProducao = prodDate.value;
      const before = text.slice(Math.max(0, prodDate.index - 220), prodDate.index);
      const candidates = before.match(/\b\d{4,5}\b/g) || [];
      cert.lote = (candidates[candidates.length - 1] || "").padStart(5, "0");
    }
  }

  const chumb = text.match(/LOTES?\s+(?:DE\s+)?CHUMBADORES:\s*\n?([^\n]+(?:\n[^\n]+)?)/i);
  if (chumb) {
    cert.lotesChumbadores = clean(chumb[1])
      .replace(/\b(?:Nota fiscal|N[°º]? da Bobina|Modulo de Elasticidade).*$/i, "")
      .trim();
  }

  const nfBlock = text.match(/Nota fiscal:\s*([\s\S]*?)N[°º]?\s*da Bobina:/i);
  if (nfBlock) cert.notasFiscais = unique(nfBlock[1].match(/\b\d{3}\.?\d{3}\b|\b\d{6}\b/g) || []);

  const bobinaBlock = text.match(/N[°º]?\s*da Bobina:\s*([\s\S]*?)Modulo de Elasticidade:/i);
  if (bobinaBlock) cert.bobinas = unique(bobinaBlock[1].match(/\b\d{9,12}\b/g) || []);

  const moduloBlock = text.match(/Modulo de Elasticidade:\s*([\s\S]*?)(?:CONCRETO|CORTE DE AÇO|ACOMPANHAMENTO)/i);
  if (moduloBlock) cert.modulosElasticidade = unique((moduloBlock[1].match(/\d{3},\d{3}/g) || []).map(toNumber));

  cert.limitesMpa = (text.match(/≥\s*[\d,]+\s*MPa/g) || []).map(s => toNumber(s));
  cert.resistenciaConcreto = parseConcreteStrength(text);
  cert.temperaturas = parseTemperatures(text);

  const allTemps = cert.temperaturas.flatMap(r => r.leituras);
  cert.temperaturaMax = allTemps.length ? Math.max(...allTemps) : null;
  cert.temperaturaInicialMax = cert.temperaturas[0] ? Math.max(...cert.temperaturas[0].leituras) : null;
  cert.taxaAquecimentoMax = calcMaxHeatingRate(cert.temperaturas);

  return cert;
}

function parseConcreteStrength(text) {
  const rows = [];
  const regex = /(\d+(?:,\d+)?)\s*dias?\s+([\d,]+)\s+([\d,]+)(?:\s+([\d,]+)\s+([\d,]+))?/gi;
  for (const m of text.matchAll(regex)) {
    const day = toNumber(m[1]);
    if (!day || day <= 0 || day > 35) continue;
    const values = [m[2], m[3], m[4], m[5]].filter(Boolean).map(toNumber);
    if (values.some(v => Number.isNaN(v))) continue;
    const rec = { idadeDias: day, compressaoAxial: values.slice(0, 2) };
    if (values.length >= 4) rec.tracaoFlexao = values.slice(2, 4);
    if (!rows.some(r => r.idadeDias === rec.idadeDias)) rows.push(rec);
  }
  return rows;
}

function parseTemperatures(text) {
  let block = text;
  const mBlock = text.match(/Ínicio\s*\nMeio\s*\nFim\s*\n([\s\S]*?)Tolerância/i);
  if (mBlock) block = mBlock[1];
  const rows = [];
  const regex = /(\d{2}:\d{2})\s+([\d,]+)\s*ºC(?:\s+([\d,]+)\s*ºC)?(?:\s+([\d,]+)\s*ºC)?/gi;
  for (const m of block.matchAll(regex)) {
    const leituras = [m[2], m[3], m[4]].filter(Boolean).map(toNumber).filter(n => !Number.isNaN(n));
    if (leituras.length) rows.push({ hora: m[1], leituras });
  }
  return rows.slice(0, 8);
}

function buildChecklist(context) {
  const templateRows = window.DATABOOK_TEMPLATE_ROWS || [];
  const lotes = resolveChecklistLots(context);

  return lotes.flatMap(lote => {
    const certificado = (context.certificados || []).find(c => c.lote === lote) || null;

    // O checklist precisa existir para cada lote do Data Book.
    // Para campos de certificado, usamos somente o certificado daquele lote.
    // Para documentos gerais de matéria-prima, usamos as evidências do Data Book inteiro,
    // mas mantendo o resultado separado por lote para exportação e conferência.
    const lotContext = {
      ...context,
      lote,
      certificado,
      certificados: certificado ? [certificado] : []
    };

    return templateRows.map(row => {
      const extracted = extractChecklistValue(row, lotContext);
      return {
        dataBook: context.header.dataBook || context.fileName,
        fileName: context.fileName,
        lote,
        excelRow: row.excelRow,
        section: row.section,
        item: row.item,
        description: row.description,
        tool: row.tool,
        tolerance: row.tolerance,
        value: extracted.value,
        status: extracted.status,
        evidence: extracted.evidence
      };
    });
  });
}

function resolveChecklistLots(context) {
  const lotesCapa = context.header?.lotes || [];
  const lotesCertificados = (context.certificados || []).map(c => c.lote).filter(Boolean);
  const lotes = unique([...lotesCapa, ...lotesCertificados]);
  return lotes.length ? lotes : [""];
}

function extractChecklistValue(row, context) {
  const desc = `${row.section} ${row.description}`.toLowerCase();
  const certs = context.certificados || [];

  if (/monitoramento de temperatura/.test(desc) && /registrar curva/.test(desc)) {
    const max = maxOf(certs.map(c => c.temperaturaMax));
    const value = max != null ? `Temp. máxima ${fmt(max)}°C em ${certs.length} certificado(s)` : "Não encontrado";
    return {
      value,
      status: max != null ? (max <= 60 ? "OK" : "NOK") : "NA",
      evidence: max != null ? "Leituras da tabela ACOMPANHAMENTO DE TEMPERATURA dos certificados de lote." : "Sem tabela de temperatura identificada."
    };
  }

  if (/temperatura inicial/.test(desc)) {
    const maxInitial = maxOf(certs.map(c => c.temperaturaInicialMax));
    const value = maxInitial != null ? `Maior primeira leitura: ${fmt(maxInitial)}°C` : "Não encontrado";
    return {
      value,
      status: maxInitial != null ? (maxInitial <= 30 ? "OK" : "NOK") : "NA",
      evidence: "Primeira linha de leitura de temperatura de cada certificado. Validar manualmente se corresponde ao tempo de pega/espera aplicável."
    };
  }

  if (/aumento máximo de 20/.test(desc)) {
    const rate = maxOf(certs.map(c => c.taxaAquecimentoMax));
    const value = rate != null ? `Maior taxa calculada: ${fmt(rate)}°C/h` : "Não encontrado";
    return {
      value,
      status: rate != null ? (rate <= 20 ? "OK" : "NOK") : "NA",
      evidence: "Cálculo feito entre horários sequenciais de temperatura disponíveis nos certificados."
    };
  }

  if (/resistência a compressão do concreto/.test(desc)) {
    let day = row.tool === "28d" ? 28 : row.tool === "14d" ? 14 : row.tool === "7d" ? 7 : 28;
    const values = collectStrength(certs, day, "compressaoAxial");
    const summary = summarizeValues(values, "MPa");
    const minRequired = parseMinRequirement(row.tolerance) ?? inferLimit(certs, 1);
    return {
      value: summary || "Não encontrado",
      status: values.length ? (minRequired == null || Math.min(...values) >= minRequired ? "OK" : "NOK") : "NA",
      evidence: values.length ? `Valores de compressão aos ${day} dias extraídos dos certificados. Limite usado: ${minRequired ?? "não definido"} MPa.` : "Nenhum valor compatível encontrado."
    };
  }

  if (/resistência a tração na flexão/.test(desc)) {
    const day = row.tool === "28d" ? 28 : 14;
    const values = collectStrength(certs, day, "tracaoFlexao");
    const summary = summarizeValues(values, "MPa");
    const minRequired = parseMinRequirement(row.tolerance) ?? inferLimit(certs, 2);
    return {
      value: summary || "Não encontrado",
      status: values.length ? (minRequired == null || Math.min(...values) >= minRequired ? "OK" : "NOK") : "NA",
      evidence: values.length ? `Valores de tração na flexão aos ${day} dias extraídos dos certificados. Limite usado: ${minRequired ?? "não definido"} MPa.` : "Nenhum valor compatível encontrado."
    };
  }

  if (/aço/.test(desc)) {
    const bobinas = unique(certs.flatMap(c => c.bobinas || []));
    const modulos = certs.flatMap(c => c.modulosElasticidade || []);
    const found = bobinas.length || modulos.length || findEvidence(context.pages, ["fios de protensão", "bobina", "módulo de elasticidade", "modulo de elasticidade"]);
    return {
      value: found ? `Bobinas: ${bobinas.slice(0, 12).join(", ") || "localizadas"}${bobinas.length > 12 ? "..." : ""}; Módulos: ${summarizeValues(modulos, "") || "localizados"}` : "Não encontrado",
      status: found ? "OK" : "NA",
      evidence: found ? "Rastreabilidade de corte de aço nos certificados de lote e/ou seção de certificados de fios de protensão." : "Sem evidência textual de aço/fios/bobinas."
    };
  }

  const evidence = findDocumentaryEvidence(row, context.pages);
  if (evidence) {
    return {
      value: evidence.value,
      status: "OK",
      evidence: `Pág. ${evidence.page}: ${evidence.excerpt}`
    };
  }

  return {
    value: "Não encontrado automaticamente",
    status: "NA",
    evidence: "Campo mantido para conferência manual ou para inclusão de novo padrão de extração."
  };
}

function findDocumentaryEvidence(row, pages) {
  const section = row.section.toLowerCase();
  const desc = row.description.toLowerCase();
  const keywords = [];

  if (section.includes("agregado miúdo")) keywords.push("agregado miúdo", "agregado miudo", "areia", "miúdo");
  if (section.includes("agregado graúdo")) keywords.push("agregado graúdo", "agregado graudo", "brita", "graúdo");
  if (section.includes("cimento")) keywords.push("cimento", "boletim de ensaios", "cp v", "ensaios físicos", "ensaios quimicos");
  if (section.includes("concreto")) keywords.push("concreto", "aditivo", "metacaulim", "sílica", "agua", "água");

  if (desc.includes("peneira 75")) keywords.push("75 μm", "75 um", "material mais fino", "peneira 75");
  if (desc.includes("massa especifica") || desc.includes("massa específica")) keywords.push("massa específica", "massa especifica");
  if (desc.includes("densidade")) keywords.push("densidade", "absorção", "absorcao");
  if (desc.includes("absorção")) keywords.push("absorção", "absorcao");
  if (desc.includes("volume de vazios")) keywords.push("volume de vazios", "índice de vazios", "indice de vazios");
  if (desc.includes("massa unitária")) keywords.push("massa unitária", "massa unitaria");
  if (desc.includes("argila")) keywords.push("argila em torrões", "materiais friáveis", "materiais friaveis");
  if (desc.includes("impurezas")) keywords.push("impurezas orgânicas", "impurezas organicas");
  if (desc.includes("índice de forma")) keywords.push("índice de forma", "indice de forma", "paquímetro", "paquimetro");
  if (desc.includes("los angeles")) keywords.push("Los Angeles", "abrasão", "abrasao");
  if (desc.includes("perda ao fogo")) keywords.push("perda ao fogo", "PF 950");
  if (desc.includes("trióxido") || desc.includes("so3")) keywords.push("SO3", "trióxido de enxofre", "trioxido de enxofre");
  if (desc.includes("resíduo insolúvel")) keywords.push("resíduo insolúvel", "residuo insolúvel", "residuo insoluvel");
  if (desc.includes("magnésio") || desc.includes("mgo")) keywords.push("MgO", "óxido magnésio", "oxido magnesio");
  if (desc.includes("cálcio livre") || desc.includes("cao")) keywords.push("CaO", "cálcio livre", "calcio livre");
  if (desc.includes("co2")) keywords.push("CO2", "anidrido carbônico", "anidrido carbonico");
  if (desc.includes("finura")) keywords.push("finura", "NBR 11579", "# 200");
  if (desc.includes("tempo de pega")) keywords.push("tempo de pega", "NBR 16607");
  if (desc.includes("aditivo")) keywords.push("aditivo", "certificado de análise de aditivo", "certificado de analise de aditivo");
  if (desc.includes("minerais")) keywords.push("metacaulim", "sílica", "silica", "adição mineral", "adicao mineral");
  if (desc.includes("abatimento")) keywords.push("abatimento", "slump", "cone");
  if (desc.includes("reatividade")) keywords.push("reatividade álcali", "reatividade alcali", "NBR 15577", "expansão em barras", "expansao em barras", "petrográfica", "petrografica");
  if (desc.includes("def")) keywords.push("DEF", "formação a DEF", "formacao a DEF");
  if (desc.includes("água") || desc.includes("agua")) keywords.push("água destinada", "agua destinada", "preparação de concreto", "preparacao de concreto");
  if (desc.includes("validade")) keywords.push("validade");

  const uniqueKeywords = unique(keywords.map(k => normalizeForSearch(k)).filter(Boolean));
  if (!uniqueKeywords.length) return null;

  let best = null;
  for (const page of pages) {
    const pageNorm = normalizeForSearch(page.text);
    let hits = 0;
    for (const kw of uniqueKeywords) if (pageNorm.includes(kw)) hits++;
    if (hits >= Math.min(2, uniqueKeywords.length)) {
      const excerpt = excerptAround(page.text, uniqueKeywords[0]) || clean(page.text).slice(0, 260);
      best = { page: page.page, hits, excerpt };
      break;
    }
  }
  if (!best) return null;
  return {
    page: best.page,
    value: `Evidência localizada (${best.hits} termo(s) compatíveis)`,
    excerpt: best.excerpt
  };
}

function rebuildFlatData() {
  state.flatChecklist = state.databooks.flatMap(db => db.checklist || []);
  state.flatLots = state.databooks.flatMap(db => (db.certificados || []).map(c => ({
    dataBook: db.header?.dataBook || db.fileName,
    fileName: db.fileName,
    ...c
  })));
}

function renderAll() {
  const q = (els.searchInput.value || "").trim().toLowerCase();
  renderKpis(q);
  renderSummary(q);
  renderChecklist(q);
  renderLots(q);
}

function renderKpis(q = "") {
  const filteredChecklist = filterRows(state.flatChecklist, q);
  const pend = filteredChecklist.filter(r => ["NOK", "NA"].includes(r.status)).length;
  els.totalFiles.textContent = state.databooks.length;
  els.kpiDataBooks.textContent = unique(state.databooks.map(d => d.header?.dataBook || d.fileName)).length;
  els.kpiLotes.textContent = unique([
    ...state.flatLots.map(l => l.lote),
    ...state.flatChecklist.map(r => r.lote)
  ].filter(Boolean)).length;
  els.kpiCertificados.textContent = state.flatLots.length;
  els.kpiPendencias.textContent = pend;
}

function renderSummary(q = "") {
  const rows = state.databooks.filter(db => rowMatches(db, q));
  els.summaryPanel.classList.toggle("hidden", state.databooks.length === 0);
  els.summaryBody.innerHTML = rows.map(db => {
    const h = db.header || {};
    return `<tr>
      <td>${escapeHtml(db.fileName)}${db.error ? `<br><span class="badge nok">ERRO</span> ${escapeHtml(db.error)}` : ""}</td>
      <td>${escapeHtml(h.dataBook || "-")}</td>
      <td>${escapeHtml(h.cliente || "-")}</td>
      <td>${escapeHtml([h.periodoInicio, h.periodoFim].filter(Boolean).join(" a ") || "-")}</td>
      <td>${escapeHtml(h.modelo || "-")}</td>
      <td>${escapeHtml(h.quantidade ?? "-")}</td>
      <td>${escapeHtml((h.lotes || []).join(", "))}</td>
      <td>${escapeHtml((db.certificados || []).length)}</td>
    </tr>`;
  }).join("");
}

function renderChecklist(q = "") {
  const rows = filterRows(state.flatChecklist, q);
  els.checklistPanel.classList.toggle("hidden", state.flatChecklist.length === 0);
  els.checklistBody.innerHTML = rows.map(r => `<tr>
    <td>${escapeHtml(r.dataBook)}</td>
    <td>${escapeHtml(r.lote || "-")}</td>
    <td>${escapeHtml(r.section)}</td>
    <td>${escapeHtml(r.item)}</td>
    <td>${escapeHtml(r.description)}</td>
    <td>${escapeHtml(r.tolerance || "-")}</td>
    <td>${escapeHtml(r.value || "-")}</td>
    <td>${statusBadge(r.status)}</td>
    <td class="evidence">${escapeHtml(r.evidence || "-")}</td>
  </tr>`).join("");
}

function renderLots(q = "") {
  const rows = filterRows(state.flatLots, q);
  els.lotsPanel.classList.toggle("hidden", state.flatLots.length === 0);
  els.lotsBody.innerHTML = rows.map(r => {
    const c28 = valuesAtDay(r, 28, "compressaoAxial");
    const t28 = valuesAtDay(r, 28, "tracaoFlexao");
    return `<tr>
      <td>${escapeHtml(r.dataBook)}</td>
      <td>${escapeHtml(r.lote || "-")}</td>
      <td>${escapeHtml(r.dataProducao || "-")}</td>
      <td>${escapeHtml(r.tipoDormente || "-")}</td>
      <td>${escapeHtml(r.lotesChumbadores || "-")}</td>
      <td>${escapeHtml((r.bobinas || []).join(", ") || "-")}</td>
      <td>${escapeHtml(c28.length ? c28.map(v => fmt(v)).join(" / ") + " MPa" : "-")}</td>
      <td>${escapeHtml(t28.length ? t28.map(v => fmt(v)).join(" / ") + " MPa" : "-")}</td>
      <td>${escapeHtml(r.temperaturaMax != null ? fmt(r.temperaturaMax) + "°C" : "-")}</td>
      <td>${escapeHtml(r.page || "-")}</td>
    </tr>`;
  }).join("");
}

function exportJson() {
  downloadFile(`extracao-databooks-${dateStamp()}.json`, JSON.stringify(state.databooks, null, 2), "application/json;charset=utf-8");
}

function exportCsv() {
  const rows = state.flatChecklist.map(r => ({
    arquivo: r.fileName,
    data_book: r.dataBook,
    lote: r.lote,
    linha_excel: r.excelRow,
    secao: r.section,
    item: r.item,
    descricao: r.description,
    tolerancia: r.tolerance,
    valores_obtidos: r.value,
    status: r.status,
    evidencia: r.evidence
  }));
  downloadFile(`checklist-databooks-${dateStamp()}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

function exportXlsx() {
  if (!window.XLSX) {
    setStatus("Biblioteca XLSX não carregou. Use JSON ou CSV, ou inclua SheetJS localmente.", true);
    return;
  }
  const wb = XLSX.utils.book_new();
  const resumo = state.databooks.map(db => ({
    arquivo: db.fileName,
    data_book: db.header?.dataBook || "",
    cliente: db.header?.cliente || "",
    mes: db.header?.mes || "",
    periodo_inicio: db.header?.periodoInicio || "",
    periodo_fim: db.header?.periodoFim || "",
    fornecedor: db.header?.fornecedor || "",
    modelo: db.header?.modelo || "",
    quantidade: db.header?.quantidade || "",
    lotes_capa: (db.header?.lotes || []).join(", "),
    certificados_lidos: (db.certificados || []).length,
    produto: db.header?.produto || ""
  }));
  const checklist = state.flatChecklist.map(r => ({
    arquivo: r.fileName,
    data_book: r.dataBook,
    lote: r.lote,
    linha_excel: r.excelRow,
    secao: r.section,
    item: r.item,
    descricao: r.description,
    ferramenta_dia: r.tool,
    tolerancia: r.tolerance,
    valores_obtidos: r.value,
    status: r.status,
    evidencia: r.evidence
  }));
  const lotes = state.flatLots.map(r => ({
    arquivo: r.fileName,
    data_book: r.dataBook,
    lote: r.lote,
    data_producao: r.dataProducao,
    tipo_dormente: r.tipoDormente,
    lotes_chumbadores: r.lotesChumbadores,
    notas_fiscais: (r.notasFiscais || []).join(", "),
    bobinas: (r.bobinas || []).join(", "),
    modulos_elasticidade: (r.modulosElasticidade || []).join(", "),
    comp_7d: valuesAtDay(r, 7, "compressaoAxial").join(" / "),
    comp_14d: valuesAtDay(r, 14, "compressaoAxial").join(" / "),
    comp_28d: valuesAtDay(r, 28, "compressaoAxial").join(" / "),
    tracao_14d: valuesAtDay(r, 14, "tracaoFlexao").join(" / "),
    tracao_28d: valuesAtDay(r, 28, "tracaoFlexao").join(" / "),
    temperatura_max: r.temperaturaMax,
    temperatura_inicial_max: r.temperaturaInicialMax,
    taxa_aquecimento_max_c_h: r.taxaAquecimentoMax,
    pagina: r.page
  }));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checklist), "Checklist documental");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lotes), "Certificados por lote");
  XLSX.writeFile(wb, `extracao-databooks-${dateStamp()}.xlsx`);
}

function clearAll() {
  state.databooks = [];
  state.flatChecklist = [];
  state.flatLots = [];
  els.input.value = "";
  els.searchInput.value = "";
  renderAll();
  toggleExports(false);
  setStatus("Aguardando PDFs...");
}

function toggleExports(enabled) {
  els.exportJsonBtn.disabled = !enabled;
  els.exportCsvBtn.disabled = !enabled;
  els.exportXlsxBtn.disabled = !enabled;
}

function setStatus(html, isError = false) {
  els.status.innerHTML = html;
  els.status.style.color = isError ? "#b42318" : "";
}

function filterRows(rows, q) {
  if (!q) return rows;
  return rows.filter(r => rowMatches(r, q));
}

function rowMatches(row, q) {
  if (!q) return true;
  return normalizeForSearch(JSON.stringify(row)).includes(normalizeForSearch(q));
}

function valuesAtDay(cert, day, key) {
  const rec = (cert.resistenciaConcreto || []).find(r => Math.abs(r.idadeDias - day) < 0.01);
  return rec && rec[key] ? rec[key] : [];
}

function collectStrength(certs, day, key) {
  return certs.flatMap(c => valuesAtDay(c, day, key)).filter(n => typeof n === "number" && !Number.isNaN(n));
}

function summarizeValues(values, suffix) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const s = suffix ? ` ${suffix}` : "";
  return `mín. ${fmt(min)}${s}; méd. ${fmt(avg)}${s}; máx. ${fmt(max)}${s}; n=${values.length}`;
}

function parseMinRequirement(tolerance) {
  if (!tolerance) return null;
  const m = String(tolerance).match(/[≥>]=?\s*([\d,.]+)/);
  return m ? toNumber(m[1]) : null;
}

function inferLimit(certs, index) {
  const values = certs.flatMap(c => c.limitesMpa || []).filter(v => typeof v === "number" && !Number.isNaN(v));
  return values[index] ?? null;
}

function calcMaxHeatingRate(rows) {
  if (!rows || rows.length < 2) return null;
  let maxRate = null;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const hours = hourDiff(prev.hora, curr.hora);
    if (!hours || hours <= 0) continue;
    const len = Math.min(prev.leituras.length, curr.leituras.length);
    for (let j = 0; j < len; j++) {
      const rate = (curr.leituras[j] - prev.leituras[j]) / hours;
      if (maxRate == null || rate > maxRate) maxRate = rate;
    }
  }
  return maxRate;
}

function hourDiff(a, b) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return (bh * 60 + bm - (ah * 60 + am)) / 60;
}

function maxOf(values) {
  const cleanVals = values.filter(v => typeof v === "number" && !Number.isNaN(v));
  return cleanVals.length ? Math.max(...cleanVals) : null;
}

function findEvidence(pages, keywords) {
  const normalized = keywords.map(normalizeForSearch);
  return pages.some(page => {
    const t = normalizeForSearch(page.text);
    return normalized.some(k => t.includes(k));
  });
}

function excerptAround(text, keyword) {
  const normalizedText = normalizeForSearch(text);
  const idx = normalizedText.indexOf(normalizeForSearch(keyword));
  if (idx < 0) return clean(text).slice(0, 260);
  const plain = clean(text);
  const start = Math.max(0, idx - 100);
  return plain.slice(start, start + 300);
}

function matchText(text, regex) {
  const m = text.match(regex);
  return m ? clean(m[1]) : "";
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toNumber(value) {
  if (value == null) return NaN;
  const raw = String(value)
    .replace(/≥|≤|>|<|MPa|ºC|°C|%|kg\/dm³|kg\/m3|mm/gi, "")
    .trim();
  let normalized = raw;
  if (/\d\.\d{3}/.test(raw) && /,/.test(raw)) normalized = raw.replace(/\./g, "").replace(",", ".");
  else normalized = raw.replace(",", ".");
  const m = normalized.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function fmt(value) {
  if (value == null || Number.isNaN(value)) return "";
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(value) ? 0 : 2 });
}

function unique(arr) {
  return Array.from(new Set((arr || []).filter(v => v !== undefined && v !== null && String(v).trim() !== "")));
}

function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function statusBadge(status) {
  const st = (status || "NA").toUpperCase();
  const cls = st === "OK" ? "ok" : st === "NOK" ? "nok" : "na";
  return `<span class="badge ${cls}">${escapeHtml(st)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[ch]));
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(";"), ...rows.map(row => headers.map(h => escape(row[h])).join(";"))].join("\n");
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}
