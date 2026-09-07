"""Builds the two tokenizers project phase 6 calls for: one CharTokenizer
shared across all three Lojban tiers (built from their combined text, so
every character any tier uses is in-vocabulary for all three -- required
for the phase 7c internal bits-per-character comparison to be meaningful),
and one separate CharTokenizer sized to the English control corpus alone.

Usage: python build_tokenizers.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from tokenizer import CharTokenizer

ROOT = os.path.join(os.path.dirname(__file__), '..')
RUNS_DIR = os.path.join(os.path.dirname(__file__), 'runs')


def load_texts(path):
    texts = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            texts.append(json.loads(line)['text'])
    return texts


def main():
    os.makedirs(RUNS_DIR, exist_ok=True)

    lojban_texts = []
    for tier in ['tier1', 'tier2', 'tier3']:
        lojban_texts += load_texts(os.path.join(ROOT, 'corpus', tier, 'sample.jsonl'))
    lojban_tok = CharTokenizer.build_from_texts(lojban_texts)
    lojban_tok.save(os.path.join(RUNS_DIR, 'lojban_tokenizer.json'))
    print(f'Lojban shared tokenizer: vocab_size={lojban_tok.vocab_size} chars={"".join(lojban_tok.chars)!r}')

    english_texts = load_texts(os.path.join(ROOT, 'corpus', 'english_control', 'sample.jsonl'))
    english_tok = CharTokenizer.build_from_texts(english_texts)
    english_tok.save(os.path.join(RUNS_DIR, 'english_tokenizer.json'))
    print(f'English tokenizer: vocab_size={english_tok.vocab_size} chars={"".join(english_tok.chars)!r}')


if __name__ == '__main__':
    main()
