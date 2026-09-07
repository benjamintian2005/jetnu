// Renders toy-world facts (toy_world.json) into English via simple
// deterministic templates -- the project's English control (phase 4b).
// Deliberately NOT freely composed text: fixed templates keep the English
// side exactly as checkable against ground truth as the Lojban side, and
// avoid introducing English's own ambiguity as an uncontrolled variable in
// the eventual Lojban-vs-English comparison (project phase 7a). Multiple
// templates per relation provide the "surface variation, not verbatim
// repetition" the project plan calls for when size-matching corpora later
// (phase 5) -- not done here, this just emits one rendering per template
// per fact.

const world = require('./toy_world.json');

function getEntity(id) {
    const e = world.entities.find((e) => e.id === id);
    if (!e) throw new Error(`Unknown entity id: ${id}`);
    return e;
}

function name(id) {
    return getEntity(id).english;
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// One entry per relation; each template is a function of the fact's raw
// entity ids (in the relation's declared role order) returning a full
// sentence. Every relation has 3 templates so each fact yields exactly 3
// English sentences, mirroring the fixed variety Tier 3's "natural" +
// permutation styles give the Lojban side, without English needing a
// grammatical hook as flexible as FA tags.
const TEMPLATES = {
    owns: [
        ([a, b]) => `${name(a)} owns ${name(b)}.`,
        ([a, b]) => `${capitalize(name(b))} belongs to ${name(a)}.`,
        ([a, b]) => `${name(a)} has ${name(b)}.`,
    ],
    likes: [
        ([a, b]) => `${name(a)} likes ${name(b)}.`,
        ([a, b]) => `${capitalize(name(b))} is liked by ${name(a)}.`,
        ([a, b]) => `${name(a)} is fond of ${name(b)}.`,
    ],
    gives: [
        ([a, b, c]) => `${name(a)} gives ${name(b)} to ${name(c)}.`,
        ([a, b, c]) => `${capitalize(name(c))} receives ${name(b)} from ${name(a)}.`,
        ([a, b, c]) => `${name(a)} gave ${name(b)} to ${name(c)}.`,
    ],
    livesIn: [
        ([a, b]) => `${name(a)} lives in ${name(b)}.`,
        ([a, b]) => `${capitalize(name(b))} is where ${name(a)} lives.`,
        ([a, b]) => `${name(a)} calls ${name(b)} home.`,
    ],
};

function renderVariants(fact) {
    const templates = TEMPLATES[fact.relation];
    if (!templates) throw new Error(`No English templates for relation: ${fact.relation}`);
    return templates.map((tpl) => tpl(fact.args));
}

// Renders a chain of 1+ related facts (see chain.js) as one compound
// English sentence, joined with ", and " -- mirroring the Lojban side's
// "i je" chaining (see lojban_render.js) so both languages get the same
// compound-sentence surface variation, not just Lojban.
function renderChain(chain, rng) {
    const clauses = chain.map((fact, i) => {
        const variants = renderVariants(fact);
        let s = variants[Math.floor(rng() * variants.length)];
        s = s.replace(/\.$/, '');
        if (i > 0 && s.startsWith('The ')) s = 'the ' + s.slice(4);
        return s;
    });
    return clauses.join(', and ') + '.';
}

module.exports = { renderVariants, renderChain, world };
