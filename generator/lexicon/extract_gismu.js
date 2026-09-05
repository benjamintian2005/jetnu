// Extracts the real gismu word list from the vendored gismu.txt dump
// (vendor/Lojban-Translator/gismu.txt), for use as Tier 1's terminal
// substitute for camxes.pegjs's phonology-only `gismu` shape rule.
// Place structures are NOT parsed from here — Phase 3 sources those
// from jbovlaste directly per project decision.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../vendor/Lojban-Translator/gismu.txt');
const OUT = path.join(__dirname, 'gismu.json');

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const gismu = [];
for (const line of lines) {
    const word = line.trim().split(/\s+/)[0];
    if (word) gismu.push(word);
}

const unique = [...new Set(gismu)].sort();
fs.writeFileSync(OUT, JSON.stringify(unique, null, 2));
console.log(`Extracted ${unique.length} gismu -> ${OUT}`);
