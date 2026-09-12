# Results

Evaluation of the four trained models (`training/runs/{tier1,tier2,tier3,english_control}/`),
generated 2026-09-06. Reproduce with:

```bash
node generator/eval_grammar.js training/runs/<tier>/samples.json
node generator/tier3/eval_headline.js training/runs/tier3/samples.json training/runs/english_control/samples.json
```

## Scope boundary

This does not test whether Lojban, or this method, is "better for training LLMs" in
general. It tests one narrow, checkable question: given a tiny, fully known toy world
(18 entities, 4 relations, 50 facts — see `generator/tier3/toy_world.json`), does a model
trained on Lojban descriptions of that world hallucinate less against those facts than a
model trained on English descriptions of the same facts? Any result here is evidence about
this small-scale closed-world setting only — it does not extrapolate to real-world LLM
training, in either direction.

## 7a — Headline result: cross-language factual-faithfulness

Both models were sampled, their output split into clauses, and each clause parsed back
into a structured claim (`relation`, `args`) via `generator/tier3/extract_claims.js`. Each
extracted claim was checked against the toy world's ground truth (`query.js`).

| | Lojban Tier 3 | English control |
|---|---|---|
| Generated lines sampled | 918 | 993 |
| Checkable claims | 2,115 | 2,749 |
| Extraction coverage | 99.5% | 99.6% |
| **Hallucination rate (false / checkable)** | **10.9%** | **1.7%** |

**The English control model hallucinated less than the Lojban Tier 3 model** — the
opposite direction from this project's motivating hypothesis. This was manually
spot-checked, not just trusted from the extractor: e.g. one flagged Lojban "hallucination"
is the model generating `dunda fi la sam fa la alis fe la balr vau` ("gives, from=sam,
to=alis, gift=balr" → giver=alis, gift=balr, recipient=sam once FA-tags are resolved) when
the real fact is the reverse — Sam gives the ball to Alice, not Alice to Sam. That's a
genuine argument-direction error, not an extraction artifact.

**Plausible explanation (not verified, worth further investigation):** Lojban's FA-tag
system (`fa`/`fe`/`fi`/`fo`/`fu`, marking argument roles explicitly and independent of word
order) may be a harder binding task for an ~806K-parameter model than English's rigid,
highly repetitive 3-templates-per-relation scheme. The Lojban renderer's larger surface
variant space (up to 7 word-order permutations per fact vs. English's fixed 3) also spreads
training signal thinner per fact. Both are hypotheses about *this specific toy setup*, not
claims about Lojban or FA-tagging in general.

## 7b — Grammar-adherence rate

Pure syntax metric: does a Lojban model's output parse under the real `camxes.js` grammar?
Not evidence of semantic sense, kept separate from 7a/7d. (Meaningless for the English
control, which isn't Lojban — English text obviously fails a Lojban parser, so it's
excluded here.)

| Tier 1 | Tier 2 | Tier 3 |
|---|---|---|
| 64.5% (1128/1748) | 61.3% (1031/1682) | 99.5% (913/918) |

Tier 3's much higher adherence tracks its much lower bits-per-character (7c) — its
compound sentences are built from a small, repetitive fact set and are far more
memorizable than Tier 1/2's free grammatical sampling, which pulls from open-class
gismu/cmavo choices at nearly every node.

## 7c — Bits-per-character

Char-level tokenization (1 token = 1 char) makes this exact, no token-length weighting.
Final validation bits/char from each run's `log.json` (3000 iters, ~806K-param model,
identical hyperparameters across all four runs):

| Tier 1 | Tier 2 | Tier 3 | English control |
|---|---|---|---|
| 1.4772 | 1.4783 | 0.2926 | 0.3279 |

Tier 3 and English control compress far better than Tier 1/2 because they're built from
only 50 underlying toy-world facts (plus fixed templates / bounded word-order variants)
rather than open-ended grammatical sampling — expected and consistent with 7b, not an
anomaly.

## 7d — Qualitative

No automated glossing tool was available (`lojbantrans` unreachable — see project tool
notes); reviewed via manual read-through of `training/runs/*/samples.json` instead.

- **Tier 1 / Tier 2** outputs look structurally similar to each other — both dominated by
  attitudinals and `gek_sentence` logical-connective noise. Consistent with Tier 2's
  selectional restrictions only constraining the minority of predicate slots that both
  carry a non-`ANY` category tag *and* actually get filled by a description sumti.
- **Tier 3 / English control** outputs read as coherent (if sometimes factually wrong)
  toy-world mini-narratives, correctly reusing real entity names and relations, e.g.:
  - Tier 3: `dunda fi la bab fe la bonr fa la alis vau i je dunda fi la sam fa la alis fe la balr vau`
  - English: `Sam receives the blanket from Paul, and Floppy belongs to Paul.`

## Known gaps (disclosed, not blocking)

- **Phase 2's independent-parser cross-check** (validating Tier 1/2/3 output against the
  second parser in `vendor/Lojban-Translator`, not just `camxes.js`) was skipped — that
  tool requires Python 2.7 (EOL) plus an unmaintained `easy_install camxes` package.
  Decided not worth standing up legacy Python for; revisit only if `camxes.js` itself
  becomes suspect.
- **7d has no automated tooling** — `lojbantrans` was unreachable when this was run, so
  qualitative review above is manual read-through rather than automated glossing.

## Summary

The pipeline runs end-to-end and reproduces exactly (corpus sizes, bits/char, grammar
adherence, hallucination rates) as recorded above. The headline result (7a) is a genuine
negative result for the motivating hypothesis *in this toy setting*: the English control
model was more factually faithful than the Lojban Tier 3 model, not less. Report this
result together with the scope boundary above — it is evidence about a tiny closed-world,
tiny-model setup only.
