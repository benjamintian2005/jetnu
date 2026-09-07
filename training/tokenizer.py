"""Character-level tokenizer.

Character-level rather than BPE: the project plan calls for "a single
shared tokenizer across the three Lojban tiers" (needed for the phase 7c
internal bits-per-character comparison) plus a separately-sized English
tokenizer. Since bits-per-character is the actual eval metric (not
bits-per-token), a char-level vocabulary makes that conversion exact and
trivial -- one token IS one character, so validation cross-entropy in nats
divided by ln(2) is already bits-per-character, no token-length weighting
needed. It also matches Karpathy's own canonical minimal nanoGPT recipe
(char-level Shakespeare), which is the closest real precedent for
"NanoGPT-scale" at this corpus size (~300K characters per tier -- smaller
than Shakespeare's ~1MB, so a full BPE pipeline would be overkill).
"""

import json


class CharTokenizer:
    def __init__(self, chars):
        self.chars = list(chars)
        self.stoi = {c: i for i, c in enumerate(self.chars)}
        self.itos = {i: c for i, c in enumerate(self.chars)}

    @property
    def vocab_size(self):
        return len(self.chars)

    def encode(self, s):
        return [self.stoi[c] for c in s]

    def decode(self, ids):
        return ''.join(self.itos[i] for i in ids)

    def save(self, path):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump({'chars': self.chars}, f, ensure_ascii=False)

    @staticmethod
    def load(path):
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        return CharTokenizer(data['chars'])

    @staticmethod
    def build_from_texts(texts):
        # '\n' is always included even though no single corpus line contains
        # one -- train.py joins lines with '\n' as a document separator, so
        # it needs to be in-vocabulary regardless of what building script
        # extracted the character set.
        chars = sorted(set(''.join(texts)) | {'\n'})
        return CharTokenizer(chars)
