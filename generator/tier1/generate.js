// Tier 1 corpus generation CLI.
//
// Samples from the "sentence" rule -- the actual terms+selbri bridi
// grammar -- rather than the full "text" start rule camxes.js itself is
// restricted to. "text" wraps sentences in a much larger discourse/editing
// layer (si_clause/sa_clause text-editing erasure marks, bare pause
// fillers, empty paragraphs) that are individually rare in real usage but,
// under uniform random choice at each grammar branch, dominate the output:
// an earlier version of this script sampling from "text" produced >95%
// junk like "si y ,fa'o y y a". "sentence" targets real bridi content
// directly. Every candidate is still validated through the real vendored
// camxes.js parser (which parses from "text" -- a bare sentence is valid
// "text" too), and only parses are kept. Rejects are expected (see
// sampler.js's header on why predicates are ignored during generation)
// and the reject rate is reported as a diagnostic, per the project plan's
// own framing of camxes.parse() as "a debugging check, not a research
// finding."
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
const OUT_PATH = path.join(__dirname, '../../corpus/tier1/sample.jsonl');
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
