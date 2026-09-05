// Tier 1 top-down PEG sampler.
//
// Walks the camxes.pegjs rule AST (see grammar.js) from a start rule,
// making a random choice at every `choice` node and a random repeat-count
// at every `*`/`+` node, all the way down to terminals -- except that
// certain rule names are intercepted and resolved from real word lists
// instead of being expanded letter-by-letter (see OVERRIDES below), and
// `*_elidible` rules are forced to keep their terminator when
// `explicitTerminators` is on (project requirement: no elided terminators
// in any Lojban corpus).
//
// Syntactic predicates (&/!) are treated as zero-width and always "pass"
// during generation -- we don't attempt to make the sampler predicate-aware.
// Whatever a predicate would have ruled out is instead caught by the
// mandatory camxes.parse() validation pass every generated string goes
// through afterwards (see generate.js). This is a deliberate scope
// decision, confirmed with the project owner.
//
// RECURSION: this grammar has real unbounded self-recursion reachable via
// plain `choice` (not just `*`/`+`) -- e.g. `gek_sentence`'s third
// alternative is `NA_clause free* gek_sentence`, and `free` has a branch
// (`TO_clause text TOI_elidible`) that re-enters the *entire* top-level
// `text` rule. Under uniform random choice these compound multiplicatively
// with no decreasing budget: an early version of this sampler that only
// capped total node-visits (not recursion depth) ran away to the cap on
// 100% of attempts. The fix is a depth-aware forced-termination guarantee:
// past HARD_DEPTH_CAP, every choice/repeat/optional decision switches from
// random to deterministically-shortest (via a precomputed minimum-
// derivation-length table, the standard CFG "shortest string" fixed-point
// algorithm), which is guaranteed finite and terminates quickly. Below the
// cap, sampling stays random for output diversity.

const { rulesByName } = require('./grammar');
const cmavo = require('../lexicon/cmavo.json');
const gismu = require('../lexicon/gismu.json');
const names = require('../lexicon/names.json');

class TooDeepError extends Error {}

// Thrown by the SI/SA overrides (see buildOverrides) and caught by the
// nearest enclosing choice/optional/repeat, which retries a different
// alternative or backs off to "absent" instead. SI/SA (verbal self-
// correction/erasure markers) are excluded from Tier 1 per project
// decision -- they're meta-linguistic editing conventions, not content,
// and are woven into more than a dozen different structural "recovery"
// rules throughout the grammar (sentence_sa, bridi_tail_sa, term_sa, ...),
// so excluding them by name-matching every call site isn't practical.
// Excluding them at the point they'd actually be emitted, and letting the
// exception propagate to whichever choice/repeat decision enabled that
// path, is the general mechanism.
class AvoidBranch extends Error {}

const ZERO_WIDTH = new Set(['simple_and', 'simple_not', 'semantic_and', 'semantic_not']);

// Small seedable PRNG (mulberry32) so a given seed reproduces the same corpus.
function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
}

function shuffle(rng, arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function argmin(items, keyFn) {
    let best = items[0], bestKey = keyFn(items[0]);
    for (let i = 1; i < items.length; i++) {
        const k = keyFn(items[i]);
        if (k < bestKey) { best = items[i]; bestKey = k; }
    }
    return best;
}

// rule_ref names resolved from real word lists instead of grammar expansion.
// Each returns a complete word plus a trailing space (words are the unit of
// concatenation in this sampler; syntax-level nodes just concatenate the
// strings their children produce).
const EXCLUDED_SELMAHO = new Set(['SI', 'SA']); // verbal self-correction/erasure markers -- see AvoidBranch

function buildOverrides(rng) {
    const allCmavo = Object.entries(cmavo)
        .filter(([selmaho]) => !EXCLUDED_SELMAHO.has(selmaho))
        .flatMap(([, words]) => words);
    const avoid = () => { throw new AvoidBranch(); };
    return {
        gismu: () => pick(rng, gismu) + ' ',
        BRIVLA: () => pick(rng, gismu) + ' ', // BRIVLA <- gismu / lujvo / fuhivla; we only sample the gismu branch (confirmed scope)
        CMEVLA: () => pick(rng, names) + ' ', // Tier 1 placeholder name pool; Tier 3 will use toy-world entity names instead
        CMAVO: () => pick(rng, allCmavo) + ' ', // generic umbrella rule, not expected to be hit in normal generation but handled defensively
        ...Object.fromEntries(
            Object.entries(cmavo).map(([selmaho, words]) => [selmaho, () => pick(rng, words) + ' '])
        ),
        SI: avoid,
        SA: avoid,
    };
}

function isElidibleRuleName(name) {
    return name.endsWith('_elidible');
}

// Unwrap the action/labeled wrapper an _elidible rule is always built as
// (`X_elidible <- X_clause?` compiles to action(labeled(optional(rule_ref)))),
// then return the optional's inner expression (its "present" branch).
function forcePresent(expr) {
    let node = expr;
    while (node.type === 'action' || node.type === 'labeled') node = node.expression;
    if (node.type !== 'optional') {
        throw new Error(`Expected an 'optional' node inside an _elidible rule, got '${node.type}'`);
    }
    return node.expression;
}

function classChars(node) {
    const chars = [];
    for (const part of node.parts) {
        if (Array.isArray(part)) {
            for (let c = part[0].charCodeAt(0); c <= part[1].charCodeAt(0); c++) chars.push(String.fromCharCode(c));
        } else {
            chars.push(part);
        }
    }
    return chars;
}

// Standard CFG "shortest derivable string length" fixed-point computation,
// adapted to this AST. Override rule names are seeded at a fixed length of
// 1 (a single word token) since the sampler never walks their real grammar
// body. `_elidible` rules are computed as their forced-present form, to
// match actual runtime behavior when explicitTerminators is on.
function buildMinLengthTable(overrideNames, explicitTerminators) {
    const ruleMinLen = new Map();
    for (const name of rulesByName.keys()) ruleMinLen.set(name, Infinity);
    for (const name of overrideNames) ruleMinLen.set(name, 1);

    function nodeMinLen(node) {
        switch (node.type) {
            case 'rule': case 'named': case 'action': case 'labeled':
                return nodeMinLen(node.expression);
            case 'sequence':
                return node.elements.reduce((sum, el) => sum + (ZERO_WIDTH.has(el.type) ? 0 : nodeMinLen(el)), 0);
            case 'choice':
                return Math.min(...node.alternatives.map(nodeMinLen));
            case 'optional':
            case 'zero_or_more':
                return 0;
            case 'one_or_more':
                return nodeMinLen(node.expression);
            case 'literal':
                return node.value.length > 0 ? 1 : 0;
            case 'class':
            case 'any':
                return 1;
            case 'rule_ref': {
                if (explicitTerminators && isElidibleRuleName(node.name)) {
                    const rule = rulesByName.get(node.name);
                    return nodeMinLen(forcePresent(rule));
                }
                const v = ruleMinLen.get(node.name);
                return v === undefined ? 1 : v;
            }
            default:
                return 1;
        }
    }

    let changed = true, iterations = 0;
    while (changed && iterations < rulesByName.size + 5) {
        changed = false;
        iterations++;
        for (const [name, expr] of rulesByName) {
            if (overrideNames.has(name)) continue;
            const val = nodeMinLen(expr);
            if (val < ruleMinLen.get(name)) {
                ruleMinLen.set(name, val);
                changed = true;
            }
        }
    }
    return ruleMinLen;
}

function createSampler(opts = {}) {
    const rng = makeRng(opts.seed ?? Date.now());
    const overrides = buildOverrides(rng);
    const maxSteps = opts.maxSteps ?? 20000;
    const maxRepeat = opts.maxRepeat ?? 6;
    const repeatContinueProb = opts.repeatContinueProb ?? 0.35;
    const optionalProb = opts.optionalProb ?? 0.5;
    const explicitTerminators = opts.explicitTerminators ?? true;
    const hardDepthCap = opts.hardDepthCap ?? 28;
    const softStepBudget = opts.softStepBudget ?? 150;

    const ruleMinLen = buildMinLengthTable(new Set(Object.keys(overrides)), explicitTerminators);

    function minLenOf(node) {
        // Only used post hard-cap for deterministic shortest-choice; recompute
        // locally via the same rules as buildMinLengthTable but reading the
        // now-converged ruleMinLen table (cheap, no fixed-point needed here).
        switch (node.type) {
            case 'rule': case 'named': case 'action': case 'labeled':
                return minLenOf(node.expression);
            case 'sequence':
                return node.elements.reduce((sum, el) => sum + (ZERO_WIDTH.has(el.type) ? 0 : minLenOf(el)), 0);
            case 'choice':
                return Math.min(...node.alternatives.map(minLenOf));
            case 'optional':
            case 'zero_or_more':
                return 0;
            case 'one_or_more':
                return minLenOf(node.expression);
            case 'literal':
                return node.value.length > 0 ? 1 : 0;
            case 'class':
            case 'any':
                return 1;
            case 'rule_ref': {
                if (explicitTerminators && isElidibleRuleName(node.name)) {
                    return minLenOf(forcePresent(rulesByName.get(node.name)));
                }
                const v = ruleMinLen.get(node.name);
                return v === undefined ? 1 : v;
            }
            default:
                return 1;
        }
    }

    function walk(node, ctx) {
        ctx.steps++;
        if (ctx.steps > maxSteps) throw new TooDeepError();
        // ctx.depth is push/popped like a call stack, so on its own it only
        // bounds a single nested excursion (e.g. one `free` modifier), not
        // the total sentence: many independent repeat/free sites occur at
        // shallow depth throughout one sentence, each getting a fresh random
        // chance to explode. ctx.steps is monotonic and never resets, so once
        // it crosses softStepBudget we latch into forced-shortest permanently
        // (ctx.forced), which is what actually bounds total output size.
        if (ctx.steps > softStepBudget) ctx.forced = true;
        const forceShortest = ctx.forced || ctx.depth > hardDepthCap;

        switch (node.type) {
            case 'rule':
            case 'named':
            case 'action':
            case 'labeled':
                return walk(node.expression, ctx);

            case 'sequence':
                return node.elements.map(el => walk(el, ctx)).join('');

            case 'choice': {
                // Try alternatives until one doesn't hit an excluded selma'o
                // (AvoidBranch) -- forceShortest tries shortest-first, random
                // mode tries a random permutation, so the common (no-avoid)
                // case still returns after exactly one attempt.
                const order = forceShortest
                    ? [...node.alternatives].sort((a, b) => minLenOf(a) - minLenOf(b))
                    : shuffle(rng, node.alternatives);
                for (const alt of order) {
                    try {
                        return walk(alt, ctx);
                    } catch (e) {
                        if (!(e instanceof AvoidBranch)) throw e;
                    }
                }
                throw new AvoidBranch();
            }

            case 'optional':
                if (forceShortest) return '';
                if (rng() < optionalProb) {
                    try {
                        return walk(node.expression, ctx);
                    } catch (e) {
                        if (!(e instanceof AvoidBranch)) throw e;
                    }
                }
                return '';

            case 'zero_or_more':
                return forceShortest ? '' : repeat(node.expression, ctx, 0);

            case 'one_or_more':
                return repeat(node.expression, ctx, 1, forceShortest);

            case 'simple_and':
            case 'simple_not':
            case 'semantic_and':
            case 'semantic_not':
                return ''; // zero-width predicates: ignored during generation (see file header)

            case 'literal':
                return node.value;

            case 'class':
                return pick(rng, classChars(node));

            case 'any':
                return 'a'; // should not be reachable given our overrides cover every open class

            case 'rule_ref': {
                if (explicitTerminators && isElidibleRuleName(node.name)) {
                    const rule = rulesByName.get(node.name);
                    if (!rule) throw new Error(`Unknown rule_ref: ${node.name}`);
                    return walk(forcePresent(rule), ctx);
                }
                if (overrides[node.name]) return overrides[node.name]();
                const rule = rulesByName.get(node.name);
                if (!rule) throw new Error(`Unknown rule_ref: ${node.name}`);
                ctx.depth++;
                try {
                    return walk(rule, ctx);
                } finally {
                    ctx.depth--;
                }
            }

            default:
                throw new Error(`Unhandled node type in sampler: ${node.type}`);
        }
    }

    function repeat(expr, ctx, minCount, forceShortest = false) {
        let out = '';
        let count = 0;
        while (count < minCount) {
            out += walk(expr, ctx);
            count++;
        }
        if (forceShortest) return out;
        while (count < maxRepeat && rng() < repeatContinueProb) {
            try {
                out += walk(expr, ctx);
                count++;
            } catch (e) {
                if (e instanceof AvoidBranch) break; // treat as "stop repeating here"
                throw e;
            }
        }
        return out;
    }

    // Sample one string from the given start rule. Returns null (instead of
    // throwing) if generation still ran away past maxSteps -- callers should
    // treat that as "discard and resample", same as a camxes.parse() rejection.
    // With the depth-aware forced-shortest guarantee this should be rare to
    // nonexistent; maxSteps is kept as a defensive fallback only.
    function sample(startRule) {
        const rule = rulesByName.get(startRule);
        if (!rule) throw new Error(`Unknown start rule: ${startRule}`);
        const ctx = { steps: 0, depth: 0, forced: false };
        try {
            const raw = walk(rule, ctx);
            return raw.replace(/\s+/g, ' ').trim();
        } catch (e) {
            if (e instanceof TooDeepError || e instanceof AvoidBranch) return null;
            throw e;
        }
    }

    return { sample };
}

module.exports = { createSampler, TooDeepError };
