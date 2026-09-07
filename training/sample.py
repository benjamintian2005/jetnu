"""Quick qualitative sanity check: load a trained checkpoint and generate
text from it. Not part of the phase 7 eval pipeline (that needs its own
tooling against the toy-world query function) -- just a smoke test that a
model learned corpus structure rather than noise.

Usage: python sample.py --run runs/tier1 --tokenizer runs/lojban_tokenizer.json
"""

import argparse
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(__file__))
from model import GPT, GPTConfig
from tokenizer import CharTokenizer

ap = argparse.ArgumentParser()
ap.add_argument('--run', required=True)
ap.add_argument('--tokenizer', required=True)
ap.add_argument('--n', type=int, default=300)
ap.add_argument('--prompt', default='\n')
args = ap.parse_args()

tok = CharTokenizer.load(args.tokenizer)
ckpt = torch.load(os.path.join(args.run, 'checkpoint.pt'), map_location='cpu')
config = GPTConfig(**ckpt['config'])
model = GPT(config)
model.load_state_dict(ckpt['model_state_dict'])
model.eval()

idx = torch.tensor([tok.encode(args.prompt)], dtype=torch.long)
out = model.generate(idx, max_new_tokens=args.n, temperature=0.8, top_k=20)
print(tok.decode(out[0].tolist()))
