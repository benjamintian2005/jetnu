// Tier 3 corpus generation CLI (phase 5: size-matched to Tier 1/2).
//
// Unlike phase 4's flat one-sentence-per-fact-variant output (206
// sentences, ~7.2K chars -- a hard combinatorial ceiling from word-order
// permutation alone), this reaches Tier 1/2's ~300K character target by
// chaining 1-3 related true facts into compound sentences (see chain.js
// for why this is combinatorially much richer, and lojban_render.js's
// renderChain for how facts are joined with "i je"). Every candidate is
// still validated through the real camxes.js parser -- same mandatory
// convention as every other tier -- and exact-duplicate strings are
// rejected so the corpus grows via genuine surface variation, not
// verbatim repetition, per the project's phase 5 requirement.
//
// Usage: node generate.js [targetChars] [seed]

const fs = require('fs');
const path = require('path');
const { renderChain, isValid } = require('./lojban_render');
const { randomChain, weightedChainLength, world } = require('./chain');

function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const TARGET_CHARS = parseInt(process.argv[2] || '298910', 10);
const SEED = parseInt(process.argv[3] || '42', 10);
const OUT_PATH = path.join(__dirname, '../../corpus/tier3/sample.jsonl');
const MAX_ATTEMPTS = TARGET_CHARS * 10;

const rng = makeRng(SEED);
const seen = new Set();
const accepted = [];
let totalChars = 0;
let attempts = 0;
let duplicateRejects = 0;
let parseRejects = 0;

while (totalChars < TARGET_CHARS && attempts < MAX_ATTEMPTS) {
    attempts++;
    const chain = randomChain(rng, weightedChainLength(rng));
    const text = renderChain(chain, rng);
    if (seen.has(text)) { duplicateRejects++; continue; }
    if (!isValid(text)) { parseRejects++; continue; }
    seen.add(text);
    accepted.push({ text, facts: chain.map(({ _idx, ...f }) => f) });
    totalChars += text.length;
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, accepted.map((r) => JSON.stringify(r)).join('\n') + '\n');

console.log(`Facts in toy world: ${world.facts.length}`);
console.log(`Accepted: ${accepted.length} sentences, ${totalChars} chars (target: ${TARGET_CHARS})`);
console.log(`Attempts: ${attempts} (duplicates: ${duplicateRejects}, parse-rejected: ${parseRejects})`);
console.log(`Written to ${OUT_PATH}`);
