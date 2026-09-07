// Builds "chains" of 1-3 related, true toy-world facts to render as one
// compound sentence -- the phase 5 size-matching lever (see project memory
// / conversation: permutation-only rendering hits a hard combinatorial
// ceiling per fact, far short of Tier 1/2's corpus size; chaining true
// facts together is combinatorially much richer while staying fully
// truth-preserving, since a conjunction of true facts is still true).
//
// Two link types connect consecutive facts in a chain, both narratively
// natural:
//   - "continuation": the next fact has the SAME subject (args[0]) as the
//     current one, e.g. "alis owns rovr" -> "alis livesIn gardn" (still
//     talking about Alice).
//   - "handoff": the next fact's subject is SOME entity mentioned anywhere
//     in the current fact, e.g. "alis owns rovr" -> "rovr likes bonr"
//     (the topic hands off from Alice to Rover).
// A fact is never reused within the same chain.

const world = require('./toy_world.json');

function candidateNextIndices(chain, usedIdx) {
    const last = chain[chain.length - 1];
    const candidates = [];
    for (let i = 0; i < world.facts.length; i++) {
        if (usedIdx.has(i)) continue;
        const f = world.facts[i];
        if (f.args[0] === last.args[0] || last.args.includes(f.args[0])) {
            candidates.push(i);
        }
    }
    return candidates;
}

// Returns an array of { relation, args, _idx } objects, length <=
// targetLength (shorter if the chain hits a dead end -- entities with no
// outgoing facts, e.g. most OBJECT/PLACE entities, naturally terminate a
// chain rather than erroring).
function randomChain(rng, targetLength) {
    const startIdx = Math.floor(rng() * world.facts.length);
    const usedIdx = new Set([startIdx]);
    const chain = [{ ...world.facts[startIdx], _idx: startIdx }];

    while (chain.length < targetLength) {
        const candidates = candidateNextIndices(chain, usedIdx);
        if (candidates.length === 0) break;
        const nextIdx = candidates[Math.floor(rng() * candidates.length)];
        usedIdx.add(nextIdx);
        chain.push({ ...world.facts[nextIdx], _idx: nextIdx });
    }
    return chain;
}

// Weighted so most sentences are 2-3 facts long (more characters per
// sentence, so fewer total sentences needed to hit a size target) while
// still including some single-fact sentences for variety.
function weightedChainLength(rng) {
    const r = rng();
    if (r < 0.15) return 1;
    if (r < 0.55) return 2;
    return 3;
}

module.exports = { randomChain, weightedChainLength, world };
