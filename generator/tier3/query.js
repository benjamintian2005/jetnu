// Language-agnostic query interface over the toy world (toy_world.json).
//
// This is the SAME module both the Lojban-Tier-3 and English-control
// evaluation (project phase 7a, the headline result) query against -- it
// operates purely on entity ids and relation/role names, with no notion of
// which language a sentence describing a fact was rendered in. Truth here
// is exactly the committed fact list; nothing else is true by definition.

const world = require('./toy_world.json');

function getEntity(id) {
    const e = world.entities.find((e) => e.id === id);
    if (!e) throw new Error(`Unknown entity id: ${id}`);
    return e;
}

function getRelation(name) {
    const r = world.relations[name];
    if (!r) throw new Error(`Unknown relation: ${name}`);
    return r;
}

// All facts of `relation` where the entity in role `roleName` is `entityId`.
function factsWhere(relation, roleName, entityId) {
    const rel = getRelation(relation);
    const idx = rel.roles.indexOf(roleName);
    if (idx === -1) throw new Error(`Relation '${relation}' has no role '${roleName}'`);
    return world.facts.filter((f) => f.relation === relation && f.args[idx] === entityId);
}

// The canonical "ask a question of the toy world" primitive, e.g.
// ask('owns', 'owner', 'alis', 'possession') === ['rovr', 'buk', 'bonr']
// answering "what does alice own?" as a plain array of entity ids -- ground
// truth for the eval described in project phase 7a, regardless of which
// language a model's answer needs to be checked against.
function ask(relation, roleName, entityId, answerRole) {
    const rel = getRelation(relation);
    const answerIdx = rel.roles.indexOf(answerRole);
    if (answerIdx === -1) throw new Error(`Relation '${relation}' has no role '${answerRole}'`);
    return factsWhere(relation, roleName, entityId).map((f) => f.args[answerIdx]);
}

// Every fact touching `entityId` in any role, across all relations --
// useful for glossing/context during qualitative review (phase 7d).
function factsAbout(entityId) {
    return world.facts.filter((f) => f.args.includes(entityId));
}

// True iff `args` (in relation-defined role order) is a committed fact.
// The other half of closed-world evaluation: not just "what's true" but
// "is this specific claim true", for checking a model-generated statement.
function isTrue(relation, args) {
    return world.facts.some(
        (f) => f.relation === relation && f.args.length === args.length && f.args.every((a, i) => a === args[i])
    );
}

module.exports = { world, getEntity, getRelation, factsWhere, ask, factsAbout, isTrue };
