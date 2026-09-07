// Phase 7a support: extracts structured (relation, args) claims from raw
// generated text, for both languages, so both can be checked against the
// SAME toy-world ground truth (query.js). This is deliberately tolerant/
// best-effort -- a tiny char-level model's output won't always exactly
// match a training-set sentence, and a claim that can't be confidently
// extracted is its own bucket (not silently dropped), since "how often
// does the model even produce a checkable claim" is useful context
// alongside the headline hallucination rate.

const { world } = require('./query');

const RELATION_BY_GISMU = {};
for (const [name, rel] of Object.entries(world.relations)) RELATION_BY_GISMU[rel.gismu] = name;

const ENTITY_IDS = new Set(world.entities.map((e) => e.id));
const ENTITY_ENGLISH_TO_ID = new Map(world.entities.map((e) => [e.english.toLowerCase(), e.id]));

const FA_SLOT = { fa: 0, fe: 1, fi: 2, fo: 3, fu: 4 };

// Splits a full generated Lojban string into individual-bridi clauses on
// the "i" / "i je" sentence connective (see lojban_render.js's renderChain)
// -- tolerant of the model dropping "je" or mangling spacing around it.
function splitLojbanClauses(text) {
    return text.split(/\bi\b(?:\s+je\b)?/).map((s) => s.trim()).filter(Boolean);
}

// Returns { relation, args } if a complete claim (every role filled) could
// be extracted, otherwise { relation, args, incomplete: true } if a
// relation word was found but not all its roles, or null if no known
// relation word appears at all.
function extractLojbanClaim(clause) {
    let relation = null;
    for (const [gismu, name] of Object.entries(RELATION_BY_GISMU)) {
        if (new RegExp(`\\b${gismu}\\b`).test(clause)) { relation = name; break; }
    }
    if (!relation) return null;

    const rel = world.relations[relation];
    const args = new Array(rel.roles.length).fill(null);
    let nextDefaultSlot = 0;

    const termRe = /\b(fa|fe|fi|fo|fu)?\s*la\s+([a-z']+)/g;
    let m;
    while ((m = termRe.exec(clause))) {
        const [, tag, name] = m;
        if (!ENTITY_IDS.has(name)) continue;
        const slot = tag ? FA_SLOT[tag] : nextDefaultSlot++;
        if (slot < args.length) args[slot] = name;
    }

    if (args.every((a) => a !== null)) return { relation, args };
    return { relation, args, incomplete: true };
}

function splitEnglishClauses(text) {
    // english_render.js joins clauses with ", and " and ends the whole
    // sentence with one trailing period.
    return text.replace(/\.$/, '').split(/,\s*and\s+/).map((s) => s.trim()).filter(Boolean);
}

function lookupEntity(phrase) {
    const id = ENTITY_ENGLISH_TO_ID.get(phrase.trim().toLowerCase());
    return id || null;
}

// One regex per template in english_render.js's TEMPLATES, each mapped to
// (matchGroups) => args in the relation's declared role order.
const ENGLISH_PATTERNS = [
    { relation: 'owns', re: /^(.+?) owns (.+?)$/i, map: (m) => [m[1], m[2]] },
    { relation: 'owns', re: /^(.+?) belongs to (.+?)$/i, map: (m) => [m[2], m[1]] },
    { relation: 'owns', re: /^(.+?) has (.+?)$/i, map: (m) => [m[1], m[2]] },
    { relation: 'likes', re: /^(.+?) likes (.+?)$/i, map: (m) => [m[1], m[2]] },
    { relation: 'likes', re: /^(.+?) is liked by (.+?)$/i, map: (m) => [m[2], m[1]] },
    { relation: 'likes', re: /^(.+?) is fond of (.+?)$/i, map: (m) => [m[1], m[2]] },
    { relation: 'gives', re: /^(.+?) gives (.+?) to (.+?)$/i, map: (m) => [m[1], m[2], m[3]] },
    { relation: 'gives', re: /^(.+?) receives (.+?) from (.+?)$/i, map: (m) => [m[3], m[2], m[1]] },
    { relation: 'gives', re: /^(.+?) gave (.+?) to (.+?)$/i, map: (m) => [m[1], m[2], m[3]] },
    { relation: 'livesIn', re: /^(.+?) lives in (.+?)$/i, map: (m) => [m[1], m[2]] },
    { relation: 'livesIn', re: /^(.+?) is where (.+?) lives$/i, map: (m) => [m[2], m[1]] },
    { relation: 'livesIn', re: /^(.+?) calls (.+?) home$/i, map: (m) => [m[1], m[2]] },
];

function extractEnglishClaim(clause) {
    for (const { relation, re, map } of ENGLISH_PATTERNS) {
        const m = re.exec(clause);
        if (!m) continue;
        const phrases = map(m);
        const ids = phrases.map(lookupEntity);
        if (ids.every((id) => id !== null)) return { relation, args: ids };
        return { relation, args: ids, incomplete: true };
    }
    return null;
}

module.exports = { splitLojbanClauses, extractLojbanClaim, splitEnglishClauses, extractEnglishClaim };
