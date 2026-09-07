// Tier 2 corpus generation CLI -- identical validation pipeline to Tier 1
// (see ../tier1/generate.js for why "sentence" is the start rule and why
// camxes.parse() is a debugging check, not a research finding), swapped
// onto Tier 2's selectional-restriction-constrained sampler.
//
// Usage: node generate.js [count] [seed] [startRule]

const fs = require('fs');
const path = require('path');
const { createSampler } = require('./sampler');

const camxes = require(path.join(__dirname, '../../vendor/ilmentufa/camxes.js'));
const preproc = require(path.join(__dirname, '../../vendor/ilmentufa/camxes_preproc.js'));

const TARGET_COUNT = parseInt(process.argv[2] || '50', 10);
const SEED = parseInt(process.argv[3] || '1', 10);
const START_RULE = process.argv[4] || 'sentence';
const OUT_PATH = path.join(__dirname, '../../corpus/tier2/sample.jsonl');
const MAX_ATTEMPTS = TARGET_COUNT * 200;

const sampler = createSampler({ seed: SEED });

function isValid(text) {
    try {
        camxes.parse(preproc.preprocessing(text));
        return true;
    } catch (e) {
        return false;
    }
}

const accepted = [];
let attempts = 0;
let tooDeep = 0;
let parseRejects = 0;

while (accepted.length < TARGET_COUNT && attempts < MAX_ATTEMPTS) {
    attempts++;
    const text = sampler.sample(START_RULE);
    if (text === null) { tooDeep++; continue; }
    if (!text) continue;
    if (isValid(text)) {
        accepted.push(text);
    } else {
        parseRejects++;
    }
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, accepted.map(t => JSON.stringify({ text: t })).join('\n') + '\n');

console.log(`Accepted: ${accepted.length}/${TARGET_COUNT} requested`);
console.log(`Attempts: ${attempts} (too-deep: ${tooDeep}, parse-rejected: ${parseRejects})`);
console.log(`Acceptance rate: ${(accepted.length / attempts * 100).toFixed(1)}%`);
console.log(`Written to ${OUT_PATH}`);
