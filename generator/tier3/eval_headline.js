// Phase 7a: the HEADLINE RESULT. Cross-language factual-faithfulness
// comparison between the Lojban-Tier-3 model and the English-control
// model, using the SAME toy-world query function (query.js) both were
// designed around.
//
// SCOPE BOUNDARY (report this alongside the result, always): this
// compares hallucination rates in one small, fully-known, closed toy
// world. A result here says something about THIS setting only -- it does
// not extrapolate to real-world LLM training, and must never be described
// as if it did.
//
// Usage: node eval_headline.js <tier3-samples.json> <english-samples.json>

const fs = require('fs');
const { world, isTrue } = require('./query');
const {
    splitLojbanClauses, extractLojbanClaim,
    splitEnglishClauses, extractEnglishClaim,
} = require('./extract_claims');

function evaluate(samplesPath, splitFn, extractFn) {
    const lines = JSON.parse(fs.readFileSync(samplesPath, 'utf8'));
    let trueCount = 0, falseCount = 0, incompleteCount = 0, noRelationCount = 0;
    const falseExamples = [];

    for (const line of lines) {
        for (const clause of splitFn(line)) {
            const claim = extractFn(clause);
            if (!claim) { noRelationCount++; continue; }
            if (claim.incomplete) { incompleteCount++; continue; }
            if (isTrue(claim.relation, claim.args)) {
                trueCount++;
            } else {
                falseCount++;
                if (falseExamples.length < 8) falseExamples.push({ clause, claim });
            }
        }
    }

    const checkable = trueCount + falseCount;
    const totalClauses = trueCount + falseCount + incompleteCount + noRelationCount;
    return {
        lines: lines.length, totalClauses, trueCount, falseCount, incompleteCount, noRelationCount,
        hallucinationRate: checkable ? falseCount / checkable : null,
        extractionCoverage: totalClauses ? checkable / totalClauses : null,
        falseExamples,
    };
}

const [tier3Path, englishPath] = process.argv.slice(2);
if (!tier3Path || !englishPath) {
    console.error('Usage: node eval_headline.js <tier3-samples.json> <english-samples.json>');
    process.exit(1);
}

const lojban = evaluate(tier3Path, splitLojbanClauses, extractLojbanClaim);
const english = evaluate(englishPath, splitEnglishClauses, extractEnglishClaim);

function pct(x) { return x === null ? 'n/a' : (100 * x).toFixed(1) + '%'; }

console.log('='.repeat(70));
console.log('PHASE 7a HEADLINE RESULT -- cross-language factual-faithfulness');
console.log('SCOPE: this toy-world result does not extrapolate to real-world LLM');
console.log('training -- see project scope boundary.');
console.log('='.repeat(70));
console.log();
console.log(`Lojban Tier 3   : ${lojban.lines} generated lines, ${lojban.totalClauses} clauses`);
console.log(`  checkable claims: ${lojban.trueCount + lojban.falseCount} (true=${lojban.trueCount}, false=${lojban.falseCount})`);
console.log(`  HALLUCINATION RATE (false / checkable): ${pct(lojban.hallucinationRate)}`);
console.log(`  extraction coverage (checkable / all clauses): ${pct(lojban.extractionCoverage)}`);
console.log();
console.log(`English control : ${english.lines} generated lines, ${english.totalClauses} clauses`);
console.log(`  checkable claims: ${english.trueCount + english.falseCount} (true=${english.trueCount}, false=${english.falseCount})`);
console.log(`  HALLUCINATION RATE (false / checkable): ${pct(english.hallucinationRate)}`);
console.log(`  extraction coverage (checkable / all clauses): ${pct(english.extractionCoverage)}`);
console.log();
console.log('Example false (hallucinated) claims:');
console.log('  Lojban :', JSON.stringify(lojban.falseExamples.slice(0, 4), null, 0));
console.log('  English:', JSON.stringify(english.falseExamples.slice(0, 4), null, 0));
