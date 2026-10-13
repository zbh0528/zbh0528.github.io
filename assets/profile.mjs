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
  async function refreshMetrics() {
    const journals = readPapers("#journal-papers"), conferences = readPapers("#conference-papers");
    const button = document.getElementById("refresh-metrics");
    button.disabled = true;
    try {
      const response = await fetch("assets/journal-metrics.json", { cache: "no-store" });
      if (!response.ok) throw new Error("IF data unavailable");
      const data = await response.json(), stats = calculateSnapshot(journals, conferences, data);
      text("snapshot-journals", stats.journals);
      text("snapshot-conferences", stats.conferences);
      text("snapshot-primary", stats.first + stats.second);
      text("snapshot-if", stats.total.toFixed(1));
      text("authorship-note", stats.first + " first-author and " + stats.second + " second-author journal papers");
      text("if-coverage", stats.covered + " assigned IF values · " + stats.notReported + " not reported" +
        (stats.pending ? " · " + stats.pending + " awaiting verification" : ""));
      text("metrics-status", "IF sources verified: " + data.verified_on + ". Totals recalculated from the publication list.");
      const body = document.getElementById("if-table-body");
      body.replaceChildren();
      for (const {paper, metric} of stats.rows) {
        const row = document.createElement("tr");
        for (const value of [paper.journal, paper.year ?? "—", metric?.data_year ?? "—",
          metric?.status === "verified" ? metric.value.toFixed(1) : metric ? "Not reported" : "Awaiting verification"]) {
          const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
        }
        const cell = document.createElement("td");
        if (metric) { const link = document.createElement("a"); link.href = metric.source; link.textContent = metric.source_label; cell.append(link); }
        else cell.textContent = "—";
        row.append(cell); body.append(row);
      }
    } catch {
      text("metrics-status", "IF data could not refresh. Last verified values are shown.");
    } finally { button.disabled = false; }
  }
  document.getElementById("refresh-metrics").addEventListener("click", refreshMetrics);
  refreshMetrics();
  // ponytail: one request covers the first 100 public repositories; paginate if this profile exceeds 100.
  fetch("https://api.github.com/users/zbh0528/repos?per_page=100").then(response => {
    if (!response.ok) throw new Error("Repository metadata unavailable");
    return response.json();
  }).then(repos => {
    if (!Array.isArray(repos)) throw new Error("Invalid repository metadata");
    document.querySelectorAll("[data-repo]").forEach(element => {
      const repo = repos.find(r => r.name === element.dataset.repo);
      if (!repo || typeof repo.pushed_at !== "string") return;
      const date = new Date(repo.pushed_at);
      if (Number.isNaN(date.valueOf())) return;
      element.textContent = (typeof repo.language === "string" ? repo.language + " · " : "") + "Updated " + date.toISOString().slice(0, 10);
    });
  }).catch(() => {});
}
