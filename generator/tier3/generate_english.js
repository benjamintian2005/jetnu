// English control corpus generation CLI (phase 5: size-matched to Tier
// 1/2). Mirrors generate.js's chain-based approach on the English side
// (see chain.js, english_render.js's renderChain) -- no camxes-equivalent
// grammar checker exists for English here, so validation is just exact
// -duplicate rejection, keeping growth to genuine surface variation.
//
// Usage: node generate_english.js [targetChars] [seed]

const fs = require('fs');
const path = require('path');
const { renderChain } = require('./english_render');
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
const SEED = parseInt(process.argv[3] || '43', 10);
const OUT_PATH = path.join(__dirname, '../../corpus/english_control/sample.jsonl');
const MAX_ATTEMPTS = TARGET_CHARS * 10;

const rng = makeRng(SEED);
const seen = new Set();
const accepted = [];
let totalChars = 0;
let attempts = 0;
let duplicateRejects = 0;

while (totalChars < TARGET_CHARS && attempts < MAX_ATTEMPTS) {
    attempts++;
    const chain = randomChain(rng, weightedChainLength(rng));
    const text = renderChain(chain, rng);
    if (seen.has(text)) { duplicateRejects++; continue; }
    seen.add(text);
    accepted.push({ text, facts: chain.map(({ _idx, ...f }) => f) });
    totalChars += text.length;
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, accepted.map((r) => JSON.stringify(r)).join('\n') + '\n');

console.log(`Facts in toy world: ${world.facts.length}`);
console.log(`Accepted: ${accepted.length} sentences, ${totalChars} chars (target: ${TARGET_CHARS})`);
console.log(`Attempts: ${attempts} (duplicates: ${duplicateRejects})`);
console.log(`Written to ${OUT_PATH}`);
