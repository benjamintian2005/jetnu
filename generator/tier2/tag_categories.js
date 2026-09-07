// Applies the coarse category heuristic (categories.js) to every gismu's
// parsed place structure (place_structures.json), producing one category
// tag per numbered slot. This is the first-pass tagging step described in
// the project plan -- meant to be spot-checked, not treated as final.

const fs = require('fs');
const path = require('path');
const { categorize } = require('./categories');

const SRC = path.join(__dirname, '../lexicon/place_structures.json');
const OUT = path.join(__dirname, '../lexicon/gismu_categories.json');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const result = {};
const counts = {};

for (const [word, entry] of Object.entries(data)) {
    const slots = entry.slots.map((slot) => {
        const category = categorize(slot.text);
        counts[category] = (counts[category] || 0) + 1;
        return { x: slot.x, text: slot.text, category };
    });
    result[word] = { word, sentence: entry.sentence, slots, freq: entry.freq };
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`Tagged ${Object.keys(result).length} gismu -> ${OUT}`);
console.log('Category distribution across all slots:');
for (const [cat, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${n}`);
}
