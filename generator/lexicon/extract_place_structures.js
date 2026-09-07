// Extracts jbovlaste-derived place structures for gismu from the vendored
// gismu.txt dump (vendor/Lojban-Translator/gismu.txt), for Tier 2's
// selectional-restriction sampler. Confirmed with project owner
// (2026-09-06) that this vendored copy is an acceptable jbovlaste source --
// no separate jbovlaste fetch needed.
//
// gismu.txt rows are whitespace-column-formatted, not delimited, and column
// widths vary per row, so we locate fields by content pattern rather than
// fixed offsets:
//   <word> <rafsi...>? <keyword phrase>   x1 ... x2 ... [x3 ...]   <class> <freq>   [notes]
//
// A row's place-structure sentence always starts at its first "x1" token.
// Its end is wherever the trailing "<class> <freq>" column begins -- class
// is a short alphanumeric code (e.g. "1h", "aj", "a", "-") and freq is an
// integer, both set off from the sentence by a run of 2+ spaces.
//
// Slot text is assigned by the phrase immediately BEFORE each "xN" marker
// (its connector/preposition into that argument), except x1 which takes the
// phrase immediately AFTER "x1" (the predicate's core definition). This is
// a mechanical approximation of jbovlaste place-structure prose, not a
// semantic parse -- it's the raw material for the coarse semantic category
// tagging pass, not a substitute for it.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../vendor/Lojban-Translator/gismu.txt');
const OUT = path.join(__dirname, 'place_structures.json');

// The tail after the sentence is a run-of-whitespace-delimited "<class>
// <freq>  [notes]" block, but column widths (and thus how many spaces land
// between class and freq) aren't consistent -- sometimes they're two
// chunks, sometimes concatenated with no space at all (e.g. "1g1399"),
// rarely joined by a single space within one chunk (e.g. "1h 386"), and a
// few rows omit the class code entirely. Handle all of these from the
// generic whitespace-run split rather than a single fixed regex.
function parseClassFreq(chunks) {
    if (chunks.length < 2) return { classCode: '', freq: 0, notesStart: 1 };
    const c1 = chunks[1];

    let m = /^([a-zA-Z0-9-]{1,3})\s+(\d+)$/.exec(c1); // "1h 386" as one chunk
    if (m) return { classCode: m[1], freq: Number(m[2]), notesStart: 2 };

    m = /^(\d[a-zA-Z]|[a-zA-Z]{1,2}|-)(\d+)$/.exec(c1); // "1g1399" concatenated
    if (m) return { classCode: m[1], freq: Number(m[2]), notesStart: 2 };

    if (/^\d+$/.test(c1)) return { classCode: '', freq: Number(c1), notesStart: 2 }; // freq only

    if (/^[a-zA-Z0-9-]{1,3}$/.test(c1)) { // plain code, freq in next chunk
        const c2 = chunks[2];
        if (c2 && /^\d+$/.test(c2)) return { classCode: c1, freq: Number(c2), notesStart: 3 };
        return { classCode: c1, freq: 0, notesStart: 2 };
    }

    return { classCode: '', freq: 0, notesStart: 1 }; // unrecognized tail; treat it all as notes
}

// Words after which the text describes the connector into the NEXT slot
// rather than x1 itself (e.g. "comes/goes to destination" -- "to" onward
// is about x2, not x1). Truncating at the LAST such word (not the first)
// keeps compound x1 definitions intact, e.g. "is an expanse of sky/the
// heavens at place" -> cut at "at" (the real connector), not "of" (part
// of x1's own definition). Only applied when a following slot marker
// actually exists to leak from -- single-place gismu like "x1 is made
// of/contains/is a quantity of water" keep their full text.
const PREP_BREAK = /\b(to|from|of|for|using|via|with|in|on|at|towards|toward|into|onto|about|under|over|around|among|between|during|through|by)\b/g;

function lastPrepBreakIndex(text) {
    PREP_BREAK.lastIndex = 0;
    let m; let last = -1;
    while ((m = PREP_BREAK.exec(text))) last = m.index;
    return last;
}

function parsePlaces(sentence) {
    // Split on each xN marker, keeping the numbers.
    const parts = sentence.split(/x(\d)/);
    // parts = [pre, num1, text1, num2, text2, ..., numN, textN]
    const places = {};
    for (let i = 1; i < parts.length; i += 2) {
        const num = parts[i];
        places[num] = { before: null, after: null };
    }
    // "after" text for x1 = parts[2] (text right after first xN marker).
    // This span is shared with x2's "before" text below (there's only one
    // segment between the x1 and x2 markers) -- if an x2 marker actually
    // follows, truncate at the last preposition so x1's own tag isn't
    // driven by x2's connector phrase. No x2 marker means no leak risk,
    // so single-place gismu keep their full text.
    const x1RawAfter = parts.length >= 3 ? parts[2].trim() : null;
    // A real x2 marker must be a strictly higher number than x1's marker --
    // some jbovlaste glosses restate "x1" in a second clause (e.g. "x1 is
    // made of water; (adjective:) x1 is aqueous"), which isn't a new slot.
    const hasX2 = parts.length >= 5 && Number(parts[3]) > Number(parts[1]);
    if (x1RawAfter !== null) {
        const brkIdx = hasX2 ? lastPrepBreakIndex(x1RawAfter) : -1;
        places[parts[1]].after = brkIdx >= 0 ? x1RawAfter.slice(0, brkIdx).trim() : x1RawAfter;
    }
    // "before" text for each xN (N>=2) = the text segment preceding it,
    // i.e. parts[i-1] where parts[i] is that number. For x2 specifically
    // this is always the SAME raw span as x1's raw "after" text above (no
    // dedicated connector exists between just two markers) -- blank it out
    // rather than let x2 silently inherit x1's category.
    for (let i = 3; i < parts.length; i += 2) {
        const num = parts[i];
        const rawBefore = parts[i - 1].trim();
        places[num].before = (rawBefore === x1RawAfter) ? '' : rawBefore;
    }
    return places;
}

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const result = {};
let skipped = 0;

for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed) continue;

    const word = trimmed.split(/\s+/)[0];
    const x1Match = /\bx1\b/.exec(line);
    if (!x1Match) { skipped++; continue; }

    const rest = line.slice(x1Match.index);
    const chunks = rest.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    const sentence = chunks[0];
    const { classCode, freq, notesStart } = parseClassFreq(chunks);
    const notes = chunks.slice(notesStart).join(' ');
    const places = parsePlaces(sentence);

    // Build ordered slot descriptions: x1 uses its own (truncated)
    // definition; xN (N>1) uses its connector phrase, which is
    // deliberately '' rather than falling back to x1's text when no
    // dedicated connector text exists (see parsePlaces).
    const slots = Object.keys(places)
        .map(Number)
        .sort((a, b) => a - b)
        .map((n) => {
            const p = places[n];
            const text = n === 1 ? p.after : (p.before !== null ? p.before : p.after);
            return { x: n, text: text || '' };
        });

    if (!result[word]) {
        result[word] = {
            word,
            sentence,
            slots,
            classCode,
            freq: Number(freq),
            notes: notes ? notes.trim() : '',
        };
    }
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`Extracted place structures for ${Object.keys(result).length} words -> ${OUT} (skipped ${skipped} rows without a parseable place structure)`);
