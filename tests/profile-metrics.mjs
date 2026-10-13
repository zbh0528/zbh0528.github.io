import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCitation, calculateSnapshot } from "../assets/profile.mjs";
const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const data = JSON.parse(await readFile(new URL("assets/journal-metrics.json", root), "utf8"));
function entries(id) {
  const block = html.match(new RegExp('<section id="' + id + '"[\\s\\S]*?<ol[\\s\\S]*?</ol>'))[0];
  return [...block.matchAll(/<li value="\d+"><p>([\s\S]*?)<\/p><\/li>/g)].map(m => {
    const journal = m[1].match(/<strong><em>(.*?)<\/em><\/strong>/)[1];
    return parseCitation(m[1].replace(/<[^>]+>/g, ""), journal);
  });
}
const journals = entries("journal-papers"), conferences = entries("conference-papers");
const result = calculateSnapshot(journals, conferences, data);
assert.deepEqual([result.journals, result.conferences, result.first, result.second], [11, 17, 4, 1]);
assert.equal(result.total, 47);
assert.deepEqual([result.covered, result.notReported, result.pending], [10, 1, 0]);
assert.equal(calculateSnapshot([...journals, journals[0]], conferences, data).total, 55.4);
assert.equal(calculateSnapshot([...journals, {journal:"Unverified journal", year:2026, authorPosition:1}], conferences, data).pending, 1);
assert.equal(parseCitation('Someone, and Baohang Zhang, "Title," Venue 2025. DOI: 10.1/2024', "Venue").year, 2025);
assert.equal(parseCitation('Baohang Zhang, "Title," Venue. DOI: 10.1/2024', "Venue").year, null);
assert.throws(() => calculateSnapshot(journals, conferences, {...data, records:[{...data.records[0], value:NaN}]}));
assert.throws(() => calculateSnapshot(journals, conferences, {...data, records:[{...data.records[0], release_year:2025}]}));
console.log("PASS: authorship, publication-year mapping, repeated venues, unreported/pending IFs, and data validation.");
