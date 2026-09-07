// Renders toy-world facts (toy_world.json) into valid Lojban sentences.
//
// Unlike Tier 1/2, this is NOT random PEG sampling -- a fact fixes the
// predicate and its exact arguments, so generation here means "construct a
// grammatical bridi asserting exactly this fact," with surface variation
// coming from syntactic restructuring (word order), never from picking
// different content. Every rendered string is still run through the real
// camxes.js parser (mandatory, same convention as Tier 1/2) -- but note
// that only checks GRAMMATICALITY, not that a sentence means what we
// intend. Getting the fact -> Lojban mapping semantically right is our own
// responsibility, via two argument-placement styles that are never mixed
// within one sentence (mixing untagged and FA-tagged terms invokes a
// "continue numbering after the last explicit tag" rule we don't need to
// reason about if we just avoid triggering it):
//   - "natural": leading term (untagged, so it defaults to x1) + the
//     predicate + remaining terms trailing in role order (untagged, so
//     x2, x3, ... by position) -- ordinary declarative word order.
//   - "explicit": no leading term; every argument trails the predicate,
//     each wearing its own FA tag (fa=x1, fe=x2, fi=x3, ...) so the terms
//     can appear in ANY order and still land in the right slot. One
//     variant per permutation of the argument list.
// Explicit terminators (cu, vau) are always present, matching the "no
// elided terminators in any Lojban corpus" project requirement carried
// over from Tier 1/2.

const path = require('path');
const camxes = require(path.join(__dirname, '../../vendor/ilmentufa/camxes.js'));
const preproc = require(path.join(__dirname, '../../vendor/ilmentufa/camxes_preproc.js'));
const world = require('./toy_world.json');

const FA_TAGS = ['fa', 'fe', 'fi', 'fo', 'fu'];

function nameTerm(entityId) {
    return `la ${entityId}`;
}

function isValid(text) {
    try {
        camxes.parse(preproc.preprocessing(text));
        return true;
    } catch (e) {
        return false;
    }
}

function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const p of permutations(rest)) result.push([arr[i], ...p]);
    }
    return result;
}

function clean(s) {
    return s.replace(/\s+/g, ' ').trim();
}

// Returns every surface-variant string for one fact (not yet filtered by
// camxes -- callers should validate, since this is a hand-built renderer,
// not a grammar-derived sampler, and mistakes are possible).
function renderVariants(fact) {
    const rel = world.relations[fact.relation];
    if (!rel) throw new Error(`Unknown relation: ${fact.relation}`);
    const { gismu } = rel;
    const { args } = fact;
    if (args.length > FA_TAGS.length) throw new Error(`renderFact: too many arguments for available FA tags (${args.length})`);

    const variants = [];

    // natural order
    variants.push(clean(`${nameTerm(args[0])} cu ${gismu} ${args.slice(1).map(nameTerm).join(' ')} vau`));

    // Every fully-explicit-tagged permutation. No leading "cu" here: `cu`
    // is only the separator between LEADING terms and the selbri (see
    // `sentence`'s optional `terms CU_elidible? ...` group in the grammar)
    // -- with no leading terms at all, the selbri simply starts the
    // bridi_tail directly.
    const indices = args.map((_, i) => i);
    for (const perm of permutations(indices)) {
        const tagged = perm.map((i) => `${FA_TAGS[i]} ${nameTerm(args[i])}`).join(' ');
        variants.push(clean(`${gismu} ${tagged} vau`));
    }

    return variants;
}

// Renders a chain of 1+ related facts (see chain.js) as one compound
// Lojban sentence: each fact's own randomly-chosen surface variant, joined
// by "i je" (sentence-connective "and") -- validated as a WHOLE string by
// the caller, same as any other candidate, since joining two independently
// grammatical sentences this way is itself part of the "text" grammar
// (multi-sentence discourse), not a special case.
function renderChain(chain, rng) {
    const clauses = chain.map((fact) => {
        const variants = renderVariants(fact);
        return variants[Math.floor(rng() * variants.length)];
    });
    return clauses.join(' i je ');
}

module.exports = { renderVariants, renderChain, isValid, world };
