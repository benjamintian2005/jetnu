// Phase 7b: grammar-adherence rate. Feeds a trained Lojban model's
// generated output through the real camxes.js parser and reports the
// percentage that parses successfully. Per the project plan, this is a
// PURE SYNTAX metric -- evidence the model learned Lojban's surface
// grammar, not evidence of semantic sense -- and is kept separate from any
// coherence/factual judgment (see eval_headline.js for that).
//
// Usage: node eval_grammar.js <samples.json...>

const fs = require('fs');
const path = require('path');
const camxes = require(path.join(__dirname, '../vendor/ilmentufa/camxes.js'));
const preproc = require(path.join(__dirname, '../vendor/ilmentufa/camxes_preproc.js'));

function isValid(text) {
    try {
        camxes.parse(preproc.preprocessing(text));
        return true;
    } catch (e) {
        return false;
    }
}

const files = process.argv.slice(2);
if (files.length === 0) {
    console.error('Usage: node eval_grammar.js <samples.json...>');
    process.exit(1);
}

for (const file of files) {
    const lines = JSON.parse(fs.readFileSync(file, 'utf8'));
    let valid = 0;
    const failExamples = [];
    for (const line of lines) {
        if (isValid(line)) {
            valid++;
        } else if (failExamples.length < 5) {
            failExamples.push(line);
        }
    }
    const rate = lines.length ? (100 * valid / lines.length) : 0;
    console.log(`${file}: ${valid}/${lines.length} valid (${rate.toFixed(1)}%)`);
    if (failExamples.length) {
        console.log('  example rejects:', JSON.stringify(failExamples.slice(0, 3)));
    }
}
