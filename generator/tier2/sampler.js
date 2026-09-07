// Tier 2 top-down PEG sampler: Tier 1's sampler (see ../tier1/sampler.js,
// whose header explains the shared PEG-walking mechanics -- depth-aware
// forced-shortest termination, SI/SA exclusion, explicit terminators) plus
// selectional-restriction-constrained argument filling using
// ../lexicon/gismu_categories.json.
//
// DESIGN: how a predicate's place structure gets attached to its arguments
// ---------------------------------------------------------------------
// The grammar's relevant shape is:
//   bridi_tail_3 = selbri tail_terms / gek_sentence
//   sumti_tail_1 = selbri relative_clauses? / ...   (the "lo/le SELBRI" case)
// i.e. the exact same `selbri` rule is used both to introduce a sentence's
// main predicate AND, later, to describe any argument filled by a
// description sumti ("lo gerku" bottoms out at `selbri` too). Since
// `selbri` is walked BEFORE `tail_terms` in generation order, by the time
// we're filling an argument we already know what the predicate word was --
// no lookahead needed. Three structural hooks (see structuralHooks below)
// thread that fact through the shared, otherwise-generic `walk()`:
//   - `sentence`: pushes/pops a per-sentence frame {predicate, slotCounter}
//     onto ctx.frames, so nested sentences (relative clauses, logical
//     connectives' subsentences) each get their own independent frame and
//     naturally restore the outer one afterward.
//   - `bridi_tail_3`: reimplemented by hand (not delegated to the generic
//     choice walker) so it can flip a one-shot `ctx.window` flag to
//     'predicate-capture' for exactly the `selbri` sub-walk of the first
//     alternative -- during that window the gismu/BRIVLA override just
//     picks normally (Tier 2 doesn't try to bias WHICH predicate appears)
//     but also records the word into the frame. The `gek_sentence`
//     alternative is left as a generic, unconstrained walk (see caveat
//     below).
//   - `term`: sets `ctx.window = 'argument'` and `ctx.currentSlot` to the
//     frame's running slot counter before walking a term, then increments
//     the counter after. Explicit FA-tag slot reassignment (fa/fe/fi/fo/fu)
//     is NOT modeled -- slots are assigned by plain left-to-right order,
//     a coarse-but-honest simplification given this is Tier 2, not a full
//     semantic layer.
//
// KNOWN COARSENESS (disclosed, not bugs):
//   - Leading terms (before the predicate, e.g. "mi" in "mi klama") are
//     generated BEFORE the predicate is chosen, so they can't be
//     constrained by it -- they stay uniform, same as Tier 1. Only
//     tail_terms (the more information-bearing slots in practice: klama's
//     destination/origin/route/vehicle, dunda's recipient, etc.) are
//     constrained.
//   - Compound tanru selbri (e.g. "gerku zdani") let each successive gismu
//     picked during the predicate-capture window overwrite the frame's
//     recorded predicate -- the LAST tanru component wins, which matches
//     the loose convention that a tanru borrows its rightmost component's
//     place structure, though real Lojban tanru semantics is far vaguer
//     than that. Coarse by design.
//   - `gek_sentence` (logical-connective compound bridi) and CEhE-joined
//     extra terms are walked generically with no active predicate window
//     -- their own embedded subsentences still get correctly-scoped fresh
//     frames via the `sentence` hook, so nothing breaks, but their
//     immediate arguments (if any sit outside a nested subsentence) are
//     unconstrained.
//   - A target category with zero matching candidate words (rare given
//     the tag distribution, see generator/tier2/categories.js) or an
//     ANY-tagged / untagged slot falls back to a uniform pick over the
//     full gismu list -- generation never fails just because a category
//     is sparse or unknown.

const { rulesByName } = require('../tier1/grammar');
const cmavo = require('../lexicon/cmavo.json');
const gismu = require('../lexicon/gismu.json');
const names = require('../lexicon/names.json');
const gismuCategories = require('../lexicon/gismu_categories.json');

class TooDeepError extends Error {}
class AvoidBranch extends Error {}

const ZERO_WIDTH = new Set(['simple_and', 'simple_not', 'semantic_and', 'semantic_not']);

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

// --- Selectional-restriction indexes, built once from gismu_categories.json ---

// word -> { x: category }, e.g. klama -> {1:'ANY',2:'ANY',3:'PLACE',4:'PLACE',5:'VEHICLE'}
const slotCategoryByWord = {};
// category -> [words whose OWN x1 is tagged that category] -- since `lo
// broda` always denotes broda's x1, this is the candidate pool for "fill
// this argument with something of category C".
const wordsByCategory = {};

for (const [word, entry] of Object.entries(gismuCategories)) {
    const byX = {};
    for (const slot of entry.slots) byX[slot.x] = slot.category;
    slotCategoryByWord[word] = byX;

    const ownCategory = byX[1] || 'ANY';
    if (ownCategory !== 'ANY') {
        (wordsByCategory[ownCategory] = wordsByCategory[ownCategory] || []).push(word);
    }
}

const EXCLUDED_SELMAHO = new Set(['SI', 'SA']);

function buildOverrides(rng) {
    const allCmavo = Object.entries(cmavo)
        .filter(([selmaho]) => !EXCLUDED_SELMAHO.has(selmaho))
        .flatMap(([, words]) => words);
    const avoid = () => { throw new AvoidBranch(); };

    function currentFrame(ctx) {
        return ctx.frames[ctx.frames.length - 1] || null;
    }

    // Shared by the `gismu` and `BRIVLA` overrides (Tier 1 only samples
    // BRIVLA's gismu branch, same scope decision carried over -- see
    // ../tier1/sampler.js).
    function pickGismuWord(ctx) {
        const frame = currentFrame(ctx);

        if (ctx.window === 'predicate-capture' && frame) {
            const word = pick(rng, gismu);
            frame.predicate = word; // last write wins for compound tanru -- see file header
            return word;
        }

        if (ctx.window === 'argument' && frame && frame.predicate) {
            const byX = slotCategoryByWord[frame.predicate];
            const targetCategory = byX && byX[ctx.currentSlot];
            const candidates = targetCategory && targetCategory !== 'ANY' ? wordsByCategory[targetCategory] : null;
            if (candidates && candidates.length) {
                const word = pick(rng, candidates);
                if (ctx.trace) ctx.trace.push({ slot: ctx.currentSlot, word, targetCategory, constrained: true });
                return word;
            }
            if (ctx.trace) ctx.trace.push({ slot: ctx.currentSlot, targetCategory: targetCategory || null, constrained: false });
        }

        return pick(rng, gismu);
    }

    return {
        gismu: (ctx) => pickGismuWord(ctx) + ' ',
        BRIVLA: (ctx) => pickGismuWord(ctx) + ' ',
        CMEVLA: () => pick(rng, names) + ' ', // Tier 1 placeholder name pool; Tier 3 replaces with toy-world entity names
        CMAVO: () => pick(rng, allCmavo) + ' ',
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
                return '';

            case 'literal':
                return node.value;

            case 'class':
                return pick(rng, classChars(node));

            case 'any':
                return 'a';

            case 'rule_ref': {
                if (explicitTerminators && isElidibleRuleName(node.name)) {
                    const rule = rulesByName.get(node.name);
                    if (!rule) throw new Error(`Unknown rule_ref: ${node.name}`);
                    return walk(forcePresent(rule), ctx);
                }
                if (structuralHooks[node.name]) return structuralHooks[node.name](ctx);
                if (overrides[node.name]) return overrides[node.name](ctx);
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
                if (e instanceof AvoidBranch) break;
                throw e;
            }
        }
        return out;
    }

    // Named-rule dispatch used by structuralHooks, mirroring exactly what
    // the generic rule_ref case above does for depth tracking (see there).
    function walkNamedRule(name, ctx) {
        const rule = rulesByName.get(name);
        if (!rule) throw new Error(`Unknown rule_ref: ${name}`);
        ctx.depth++;
        try {
            return walk(rule, ctx);
        } finally {
            ctx.depth--;
        }
    }

    // See file header for what each hook does and why. Only these three
    // rule names need bespoke handling; everything else goes through the
    // generic engine above unchanged.
    const structuralHooks = {
        sentence(ctx) {
            ctx.frames.push({ predicate: null, slotCounter: 1 });
            try {
                return walkNamedRule('sentence', ctx);
            } finally {
                ctx.frames.pop();
            }
        },

        bridi_tail_3(ctx) {
            const forceShortest = ctx.forced || ctx.depth > hardDepthCap;
            const lens = {
                selbri_tail_terms: minLenOf(rulesByName.get('selbri')) + minLenOf(rulesByName.get('tail_terms')),
                gek_sentence: minLenOf(rulesByName.get('gek_sentence')),
            };
            const alts = ['selbri_tail_terms', 'gek_sentence'];
            const order = forceShortest ? [...alts].sort((a, b) => lens[a] - lens[b]) : shuffle(rng, alts);

            for (const alt of order) {
                try {
                    if (alt === 'gek_sentence') return walkNamedRule('gek_sentence', ctx);

                    const prevWindow = ctx.window;
                    ctx.window = 'predicate-capture';
                    const selbriStr = walkNamedRule('selbri', ctx);
                    ctx.window = prevWindow;
                    const tailStr = walkNamedRule('tail_terms', ctx);
                    return selbriStr + tailStr;
                } catch (e) {
                    if (!(e instanceof AvoidBranch)) throw e;
                }
            }
            throw new AvoidBranch();
        },

        term(ctx) {
            const frame = ctx.frames[ctx.frames.length - 1];
            const prevWindow = ctx.window;
            const prevSlot = ctx.currentSlot;
            if (frame) {
                ctx.window = 'argument';
                ctx.currentSlot = frame.slotCounter;
            }
            try {
                return walkNamedRule('term', ctx);
            } finally {
                ctx.window = prevWindow;
                ctx.currentSlot = prevSlot;
                if (frame) frame.slotCounter++;
            }
        },
    };

    // `initialFrames` lets tests exercise the constrained-argument path
    // directly (e.g. sampling `tail_terms` with a pre-seeded {predicate,
    // slotCounter} frame) instead of relying on a full "sentence" sample
    // happening to land on both a categorized predicate and a description
    // sumti argument, which is a rare combination among sumti_6's ~9
    // alternatives. Not used by generate.js.
    function sample(startRule, { initialFrames, trace } = {}) {
        const rule = rulesByName.get(startRule);
        if (!rule) throw new Error(`Unknown start rule: ${startRule}`);
        const ctx = { steps: 0, depth: 0, forced: false, frames: initialFrames || [], window: null, currentSlot: null, trace };
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
