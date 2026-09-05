// Mechanically extracts the complete cmavo lexicon from camxes.pegjs by
// walking the real pegjs grammar AST (via PEG.parser.parse), reconstructing
// each selma'o's word alternatives from its letter-level rule_ref sequences.
// This keeps the cmavo list exactly in sync with whichever camxes build we
// vendor, instead of hand-copying a wordlist that could drift from the grammar.

const fs = require('fs');
const path = require('path');
const PEG = require(path.join(__dirname, '../../vendor/ilmentufa/node_modules/pegjs'));

const GRAMMAR_PATH = path.join(__dirname, '../../vendor/ilmentufa/camxes.pegjs');
const OUT_PATH = path.join(__dirname, 'cmavo.json');

// Single-letter phoneme rules -> canonical character. 'h' is the
// apostrophe/glottal rule (`h <- comma* ['h] &nucleus`); we render it as
// apostrophe, the standard Lojban orthography.
const LETTER_MAP = {
    a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', y: 'y',
    l: 'l', m: 'm', n: 'n', r: 'r', b: 'b', d: 'd', g: 'g', v: 'v',
    j: 'j', z: 'z', s: 's', c: 'c', x: 'x', k: 'k', f: 'f', p: 'p', t: 't',
    h: "'",
};

const src = fs.readFileSync(GRAMMAR_PATH, 'utf8');
const ast = PEG.parser.parse(src);
const rulesByName = new Map(ast.rules.map(r => [r.name, r.expression]));

function classChars(node) {
    // pegjs 'class' node: parts is an array of chars or [start,end] pairs.
    const chars = [];
    for (const part of node.parts) {
        if (Array.isArray(part)) {
            for (let c = part[0].charCodeAt(0); c <= part[1].charCodeAt(0); c++) {
                chars.push(String.fromCharCode(c));
            }
        } else {
            chars.push(part);
        }
    }
    return chars;
}

// Returns an array of possible canonical strings this node can produce,
// ignoring zero-width predicates (&/!) and always taking zero repetitions
// for */? (these are only ever pronunciation-aid noise like `comma*` at
// this level of the grammar, never meaningful word content).
function expand(node, seen) {
    switch (node.type) {
        case 'action':
        case 'labeled':
            return expand(node.expression, seen);
        case 'sequence': {
            let acc = [''];
            for (const el of node.elements) {
                if (el.type === 'simple_and' || el.type === 'simple_not') continue;
                const options = expand(el, seen);
                const next = [];
                for (const prefix of acc) for (const opt of options) next.push(prefix + opt);
                acc = next;
            }
            return acc;
        }
        case 'choice': {
            let acc = [];
            for (const alt of node.alternatives) acc = acc.concat(expand(alt, seen));
            return acc;
        }
        case 'optional':
            return expand(node.expression, seen); // letters are never truly optional inside a word
        case 'zero_or_more':
            return ['']; // comma*-style noise only, at this grammar depth
        case 'one_or_more':
            return expand(node.expression, seen); // minimal valid case: exactly one repetition
        case 'simple_and':
        case 'simple_not':
            return [''];
        case 'literal':
            return [node.value];
        case 'class':
            return classChars(node);
        case 'rule_ref': {
            if (LETTER_MAP[node.name]) return [LETTER_MAP[node.name]];
            if (seen.has(node.name)) return ['']; // guard against accidental recursion
            seen.add(node.name);
            const target = rulesByName.get(node.name);
            if (!target) throw new Error(`Unknown rule_ref: ${node.name}`);
            return expand(target, seen);
        }
        default:
            throw new Error(`Unhandled node type in cmavo extraction: ${node.type}`);
    }
}

// selma'o rules are the ALL-CAPS (with optional digits/h) top-level rules,
// excluding the *_clause wrappers (those just add pre/post spacing, not
// new word content) and non-lexeme helper rules.
const EXCLUDE_SUFFIXES = ['_clause', '_pre', '_post', '_sa', '_elidible'];
// BRIVLA and CMEVLA are open-class shape rules (gismu/lujvo/fu'ivla and
// cmene morphology), not finite word lists -- our generic letter-sequence
// walker would produce nonsense truncations if run on them. EOF is a
// zero-width end marker, not a word. These are handled separately by the
// sampler (real gismu dictionary / toy-world name pool), not extracted here.
const OPEN_CLASS_EXCLUDE = new Set(['BRIVLA', 'CMEVLA', 'EOF']);
const selmaoRules = ast.rules.filter(r =>
    /^[A-Z][A-Za-z0-9]*$/.test(r.name) &&
    !EXCLUDE_SUFFIXES.some(suf => r.name.endsWith(suf)) &&
    !OPEN_CLASS_EXCLUDE.has(r.name)
);

const lexicon = {};
const errors = [];
for (const rule of selmaoRules) {
    try {
        const words = [...new Set(expand(rule.expression, new Set()))].filter(w => w.length > 0);
        lexicon[rule.name] = words;
    } catch (e) {
        errors.push(`${rule.name}: ${e.message}`);
    }
}

fs.writeFileSync(OUT_PATH, JSON.stringify(lexicon, null, 2));
const totalWords = new Set(Object.values(lexicon).flat()).size;
console.log(`Extracted ${Object.keys(lexicon).length} selma'o, ${totalWords} unique cmavo -> ${OUT_PATH}`);
if (errors.length) {
    console.log(`${errors.length} rules failed extraction:`);
    errors.forEach(e => console.log('  ' + e));
}
