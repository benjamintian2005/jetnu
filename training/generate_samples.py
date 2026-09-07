"""Generates a batch of sample lines from a trained checkpoint, for phase 7
evaluation (grammar-adherence, factual-faithfulness extraction, and
qualitative review all consume these rather than re-running the model
themselves).

Usage:
    python generate_samples.py --run runs/tier3 --tokenizer runs/lojban_tokenizer.json --chars 60000 --out runs/tier3/samples.json
"""

import argparse
import json
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(__file__))
from model import GPT, GPTConfig
from tokenizer import CharTokenizer

ap = argparse.ArgumentParser()
ap.add_argument('--run', required=True)
ap.add_argument('--tokenizer', required=True)
ap.add_argument('--chars', type=int, default=60000)
ap.add_argument('--temperature', type=float, default=0.8)
ap.add_argument('--top_k', type=int, default=20)
ap.add_argument('--seed', type=int, default=2024)
ap.add_argument('--out', required=True)
args = ap.parse_args()

torch.manual_seed(args.seed)
tok = CharTokenizer.load(args.tokenizer)
ckpt = torch.load(os.path.join(args.run, 'checkpoint.pt'), map_location='cpu')
config = GPTConfig(**ckpt['config'])
model = GPT(config)
model.load_state_dict(ckpt['model_state_dict'])
model.eval()

device = 'cuda' if torch.cuda.is_available() else 'cpu'
model.to(device)

idx = torch.tensor([tok.encode('\n')], dtype=torch.long, device=device)
out = model.generate(idx, max_new_tokens=args.chars, temperature=args.temperature, top_k=args.top_k)
text = tok.decode(out[0].tolist())

lines = [l.strip() for l in text.split('\n') if l.strip()]
# The very last line is likely cut off mid-generation (we stopped at a
# fixed character budget, not a line boundary) -- drop it so every kept
# line is a complete, fairly-generated sample.
if len(lines) > 1:
    lines = lines[:-1]

with open(args.out, 'w', encoding='utf-8') as f:
    json.dump(lines, f, ensure_ascii=False, indent=2)

print(f'Generated {len(lines)} lines ({len(text)} chars) -> {args.out}')
