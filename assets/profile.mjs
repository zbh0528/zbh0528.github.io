export function parseCitation(text, journal) {
  const authors = text.split('"')[0].split(",").map(name => name.trim().replace(/^and\s+/, "").replace(/\*$/, ""));
  const afterJournal = text.slice(text.indexOf(journal) + journal.length).split("DOI:")[0];
  const year = Number(afterJournal.match(/\b(20\d{2})\b/)?.[1]) || null;
  return { journal, year, authorPosition: authors.indexOf("Baohang Zhang") + 1 };
}

export function calculateSnapshot(journals, conferences, data) {
  if (data.policy !== "jcr_release_year_matches_publication_year" || !Array.isArray(data.records)) throw new Error("Invalid IF data");
  const metrics = new Map();
  for (const record of data.records) {
    const key = record.journal + "|" + record.release_year;
    if (metrics.has(key) || !Number.isInteger(record.data_year) || record.release_year !== record.data_year + 1 ||
        !["verified", "not_reported"].includes(record.status) || new URL(record.source).protocol !== "https:" ||
        (record.status === "verified" && (!Number.isFinite(record.value) || record.value < 0)) ||
        (record.status === "not_reported" && record.value !== null)) throw new Error("Invalid journal metric");
    metrics.set(key, record);
  }
  const rows = [];
  let total = 0, covered = 0, notReported = 0, pending = 0;
  for (const paper of journals) {
    const metric = metrics.get(paper.journal + "|" + paper.year);
    if (!metric) pending++;
    else if (metric.status === "not_reported") notReported++;
    else { total += metric.value; covered++; }
    rows.push({ paper, metric });
  }
  return {
    journals: journals.length, conferences: conferences.length,
    first: journals.filter(p => p.authorPosition === 1).length,
    second: journals.filter(p => p.authorPosition === 2).length,
    total: Math.round(total * 1000) / 1000, covered, notReported, pending, rows
  };
}

if (typeof document !== "undefined") {
  const readPapers = id => Array.from(document.querySelectorAll(id + " li")).map(li =>
    parseCitation(li.textContent, li.querySelector("strong em").textContent));
  const text = (id, value) => { document.getElementById(id).textContent = value; };
  let snapshot, verifiedOn, metricsFailed = false;

  function renderMetrics() {
    const zh = document.documentElement.lang === "zh-CN", stats = snapshot;
    if (stats) {
      text("snapshot-journals", stats.journals);
      text("snapshot-conferences", stats.conferences);
      text("snapshot-primary", stats.first + stats.second);
      text("snapshot-if", stats.total.toFixed(1));
      text("authorship-note", zh ? "第一作者期刊论文" + stats.first + "篇，第二作者期刊论文" + stats.second + "篇" :
        stats.first + " first-author and " + stats.second + " second-author journal papers");
      text("if-coverage", zh ? stats.covered + "项已匹配影响因子 · " + stats.notReported + "项未报告" +
        (stats.pending ? " · " + stats.pending + "项待核验" : "") :
        stats.covered + " assigned IF values · " + stats.notReported + " not reported" +
        (stats.pending ? " · " + stats.pending + " awaiting verification" : ""));
      text("metrics-status", zh ? "影响因子来源核验日期：" + verifiedOn + "。总值已根据论文列表重新计算。" :
        "IF sources verified: " + verifiedOn + ". Totals recalculated from the publication list.");
      const body = document.getElementById("if-table-body");
      body.replaceChildren();
      for (const {paper, metric} of stats.rows) {
        const row = document.createElement("tr");
        for (const value of [paper.journal, paper.year ?? "—", metric?.data_year ?? "—",
          metric?.status === "verified" ? metric.value.toFixed(1) : metric ? (zh ? "未报告" : "Not reported") : (zh ? "待核验" : "Awaiting verification")]) {
          const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
        }
        const cell = document.createElement("td");
        if (metric) { const link = document.createElement("a"); link.href = metric.source; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = metric.source_label; cell.append(link); }
        else cell.textContent = "—";
        row.append(cell); body.append(row);
      }
    }
    if (metricsFailed) text("metrics-status", zh ? "影响因子数据刷新失败，当前显示最近核验的数值。" :
      "IF data could not refresh. Last verified values are shown.");
  }

  async function refreshMetrics() {
    const journals = readPapers("#journal-papers"), conferences = readPapers("#conference-papers");
    const button = document.getElementById("refresh-metrics");
    button.disabled = true;
    try {
      const response = await fetch("assets/journal-metrics.json", { cache: "no-store" });
      if (!response.ok) throw new Error("IF data unavailable");
      const data = await response.json();
      snapshot = calculateSnapshot(journals, conferences, data);
      verifiedOn = data.verified_on;
      metricsFailed = false;
    } catch { metricsFailed = true; }
    finally { button.disabled = false; renderMetrics(); }
  }
  document.addEventListener("homepage-language-change", renderMetrics);
  document.getElementById("refresh-metrics").addEventListener("click", refreshMetrics);
  refreshMetrics();
}
