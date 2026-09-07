// Coarse semantic category taxonomy for Tier 2 selectional restrictions.
//
// Key design point: in Lojban, `lo broda` always denotes broda's x1. So a
// gismu's own "kind" (the category it belongs to when used as a filler
// word, e.g. "lo gerku" = ANIMAL) IS its x1 slot's category -- there's no
// separate "what is this gismu" tag distinct from "what fills its x1".
// So tagging is just: for each gismu, one category per numbered place
// (x1..xN), stored against place_structures.json's already-parsed slots.
//
// This is a coarse, keyword-heuristic first pass over free-text jbovlaste
// glosses (see extract_place_structures.js) -- approximate by nature, to
// be spot-checked, per project decision (confirmed 2026-09-06) rather than
// hand-tagged from scratch or run through an unreachable/off-target tool.

const CATEGORIES = [
    'PERSON', 'ANIMAL', 'PLANT', 'BODY_PART', 'SUBSTANCE', 'ARTIFACT',
    'VEHICLE', 'PLACE', 'TIME', 'ABSTRACT', 'GROUP', 'LANGUAGE', 'NUMBER',
    'ANY', // unrestricted / no confident signal -- always a safe filler
];

// Ordered rule list: first matching category wins. Order matters -- more
// specific categories are listed before broader ones so e.g. "vehicle"
// beats "artifact", and explicit dual-purpose markers route straight to
// ANY rather than a wrong specific guess.
const RULES = [
    // Explicit dual/ambiguous markers in jbovlaste prose -> don't guess.
    { category: 'ANY', keywords: ['object/state', 'event/object', 'object/event', '(object)', 'entity', 'anything', 'whatever'] },

    { category: 'PERSON', keywords: ['person', 'human', '\\bindividual\\b', '\\bman\\b', '\\bwoman\\b', 'child(?!hood)', 'baby', 'people', 'friend', 'lover', 'parent', 'father', 'mother', 'brother', 'sister', '\\bson\\b', 'daughter', 'husband', 'wife', '\\bking\\b', 'queen', 'doctor', 'student', 'teacher', 'worker', 'citizen', 'stranger', 'guest', '\\bhost\\b', 'enemy', '\\bally\\b', 'name of person', 'personal name'] },

    { category: 'ANIMAL', keywords: ['animal', 'creature', 'mammal', '\\bbird\\b', '\\bfish\\b', 'insect', 'reptile', '\\bdog\\b', 'canine', '\\bcat\\b', 'feline', 'cattle', 'bovine', '\\bhorse\\b', 'livestock', '\\bpet\\b', 'wildlife', 'rodent', 'predator', '\\bprey\\b'] },

    { category: 'PLANT', keywords: ['\\bplant\\b', '\\btree\\b', 'flower', '\\bleaf\\b', '\\bseed\\b', 'vegetable', '\\bgrain\\b', 'forest', 'fruit'] },

    { category: 'BODY_PART', keywords: ['body part', '\\blimb\\b', '\\bhand\\b', '\\bfoot\\b', '\\bfeet\\b', '\\bhead\\b', '\\bhair\\b', '\\bskin\\b', '\\bbone\\b', '\\borgan\\b', '\\bheart\\b', '\\beye\\b', '\\bear\\b', '\\bnose\\b', '\\bmouth\\b', '\\barm\\b', '\\bleg\\b', 'finger', '\\btooth\\b', 'teeth'] },

    { category: 'VEHICLE', keywords: ['vehicle', '\\bcar\\b', '\\bboat\\b', '\\bship\\b', '\\bplane\\b', 'aircraft', 'vessel \\[?transport', 'transport'] },

    { category: 'PLACE', keywords: ['\\bplace\\b', 'location', '\\bregion\\b', '\\barea\\b', '\\bcountry\\b', '\\bcity\\b', 'building', '\\bhouse\\b', '\\broom\\b', '\\bland\\b', 'territory', '\\bsite\\b', 'market', '\\broad\\b', '\\bpath\\b', 'route', 'border', 'mountain', '\\briver\\b', '\\bsea\\b', 'ocean', '\\bsky\\b', 'ground', 'destination', '\\borigin\\b', '\\bworld\\b'] },

    { category: 'TIME', keywords: ['\\btime\\b', 'moment', '\\bday\\b', '\\bmonth\\b', '\\byear\\b', '\\bhour\\b', 'minute', 'second\\b', 'duration', '\\bperiod\\b', '\\bera\\b', '\\bdate\\b', 'season', '\\bweek\\b', 'interval'] },

    { category: 'GROUP', keywords: ['\\bgroup\\b', 'organization', '\\bteam\\b', 'society', 'community', '\\bnation\\b', '\\btribe\\b', 'company', 'government', 'committee', 'collective', 'mass of'] },

    { category: 'LANGUAGE', keywords: ['language', '\\bword\\b', 'sentence', '\\btext\\b', 'speech', 'utterance', 'symbol', '\\bsign\\b', 'message', '\\bstory\\b'] },

    { category: 'NUMBER', keywords: ['number', 'quantity', '\\bamount\\b', '\\bcount\\b', 'digit', 'numeral', '\\brate\\b', 'ratio', 'percentage', 'measurement'] },

    { category: 'SUBSTANCE', keywords: ['liquid', '\\bgas\\b', 'material', 'substance', 'metal', '\\bwater\\b', 'fluid', 'quantity of', 'mass of', 'made of', '\\bstuff\\b', 'chemical', '\\bstone\\b', '\\brock\\b', '\\bclay\\b', 'powder', 'food\\b'] },

    { category: 'ARTIFACT', keywords: ['\\btool\\b', 'instrument', '\\bdevice\\b', 'machine', 'container', 'structure', 'furniture', 'weapon', 'garment', 'clothing', '\\bbook\\b'] },
];

const COMPILED_RULES = RULES.map((r) => ({
    category: r.category,
    regexes: r.keywords.map((k) => new RegExp(k, 'i')),
}));

function matchRules(text) {
    for (const rule of COMPILED_RULES) {
        if (rule.regexes.some((re) => re.test(text))) return rule.category;
    }
    return 'ANY';
}

const OF_WORD = /\bof\b/gi;

// jbovlaste mass-noun glosses commonly read "is a quantity/expanse/mass of
// X" -- X (the head noun after the LAST "of") is what actually determines
// category (e.g. djacu "is made of/contains/is a quantity/expanse of
// water" should be SUBSTANCE via "water", not NUMBER via "quantity", which
// would otherwise win by appearing earlier in the text and the rule list).
function lastOfTail(text) {
    let m; let last = null;
    OF_WORD.lastIndex = 0;
    while ((m = OF_WORD.exec(text))) last = m;
    if (!last) return null;
    const tail = text.slice(last.index + last[0].length).trim();
    return tail || null;
}

function categorize(text) {
    if (!text) return 'ANY';
    const tail = lastOfTail(text);
    if (tail) {
        const tailCategory = matchRules(tail);
        if (tailCategory !== 'ANY') return tailCategory;
    }
    return matchRules(text);
}

module.exports = { CATEGORIES, categorize };
