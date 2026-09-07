"""Train one NanoGPT-scale character-level model on one corpus.

Usage:
    python train.py --corpus ../corpus/tier1/sample.jsonl --tokenizer runs/lojban_tokenizer.json --out runs/tier1

Architecture and every hyperparameter are fixed module-level constants
(see HYPERPARAMS below) so all four project-phase-6 runs are guaranteed
identical except for --corpus and --tokenizer, per the project plan
("architecture, learning rate, hyperparameters, and training steps held
identical across all four runs -- only the training corpus ... varies").
"""

import argparse
import json
import math
import os
import random
import sys
import time

import torch

sys.path.insert(0, os.path.dirname(__file__))
from model import GPT, GPTConfig
from tokenizer import CharTokenizer

# Held identical across all four phase-6 runs -- do not vary per corpus.
HYPERPARAMS = dict(
    block_size=64,
    n_layer=4,
    n_head=4,
    n_embd=128,
    dropout=0.1,
    batch_size=64,
    max_iters=3000,
    eval_interval=250,
    eval_iters=50,
    learning_rate=3e-4,
    warmup_iters=100,
    min_lr_ratio=0.1,
    weight_decay=0.01,
    grad_clip=1.0,
    seed=1337,
)


def load_corpus_text(path):
    texts = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            texts.append(json.loads(line)['text'])
    return texts


def make_splits(texts, val_frac=0.1, seed=1337):
    rng = random.Random(seed)
    shuffled = texts[:]
    rng.shuffle(shuffled)
    n_val = max(1, int(len(shuffled) * val_frac))
    val_texts = shuffled[:n_val]
    train_texts = shuffled[n_val:]
    return '\n'.join(train_texts), '\n'.join(val_texts)


def get_batch(data, block_size, batch_size, device):
    ix = torch.randint(len(data) - block_size - 1, (batch_size,))
    x = torch.stack([data[i:i + block_size] for i in ix])
    y = torch.stack([data[i + 1:i + block_size + 1] for i in ix])
    return x.to(device), y.to(device)


def lr_at(it, hp):
    if it < hp['warmup_iters']:
        return hp['learning_rate'] * (it + 1) / hp['warmup_iters']
    progress = (it - hp['warmup_iters']) / max(1, hp['max_iters'] - hp['warmup_iters'])
    coeff = 0.5 * (1.0 + math.cos(math.pi * min(progress, 1.0)))
    return hp['min_lr_ratio'] * hp['learning_rate'] + coeff * (1 - hp['min_lr_ratio']) * hp['learning_rate']


@torch.no_grad()
def estimate_loss(model, train_data, val_data, hp, device):
    model.eval()
    out = {}
    for name, data in [('train', train_data), ('val', val_data)]:
        losses = torch.zeros(hp['eval_iters'])
        for i in range(hp['eval_iters']):
            x, y = get_batch(data, hp['block_size'], hp['batch_size'], device)
            _, loss = model(x, y)
            losses[i] = loss.item()
        out[name] = losses.mean().item()
    model.train()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', required=True)
    ap.add_argument('--tokenizer', required=True, help='path to a tokenizer json; built and saved here if missing')
    ap.add_argument('--out', required=True, help='output directory for checkpoint + log')
    args = ap.parse_args()

    hp = HYPERPARAMS
    torch.manual_seed(hp['seed'])
    random.seed(hp['seed'])

    texts = load_corpus_text(args.corpus)
    train_text, val_text = make_splits(texts, seed=hp['seed'])

    if os.path.exists(args.tokenizer):
        tok = CharTokenizer.load(args.tokenizer)
    else:
        tok = CharTokenizer.build_from_texts(texts)
        os.makedirs(os.path.dirname(args.tokenizer) or '.', exist_ok=True)
        tok.save(args.tokenizer)

    train_data = torch.tensor(tok.encode(train_text), dtype=torch.long)
    val_data = torch.tensor(tok.encode(val_text), dtype=torch.long)

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    config = GPTConfig(
        vocab_size=tok.vocab_size,
        block_size=hp['block_size'],
        n_layer=hp['n_layer'],
        n_head=hp['n_head'],
        n_embd=hp['n_embd'],
        dropout=hp['dropout'],
    )
    model = GPT(config).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=hp['learning_rate'], weight_decay=hp['weight_decay'])

    print(f'device={device} vocab_size={tok.vocab_size} params={model.num_params()} '
          f'train_chars={len(train_data)} val_chars={len(val_data)}')

    log = {'hyperparams': hp, 'vocab_size': tok.vocab_size, 'params': model.num_params(), 'history': []}
    t0 = time.time()

    for it in range(hp['max_iters']):
        lr = lr_at(it, hp)
        for g in optimizer.param_groups:
            g['lr'] = lr

        x, y = get_batch(train_data, hp['block_size'], hp['batch_size'], device)
        _, loss = model(x, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), hp['grad_clip'])
        optimizer.step()

        if it % hp['eval_interval'] == 0 or it == hp['max_iters'] - 1:
            losses = estimate_loss(model, train_data, val_data, hp, device)
            bpc_val = losses['val'] / math.log(2)
            elapsed = time.time() - t0
            print(f"iter {it}: train_loss={losses['train']:.4f} val_loss={losses['val']:.4f} "
                  f"val_bpc={bpc_val:.4f} lr={lr:.2e} elapsed={elapsed:.1f}s")
            log['history'].append({'iter': it, 'train_loss': losses['train'], 'val_loss': losses['val'],
                                    'val_bpc': bpc_val, 'lr': lr, 'elapsed_s': elapsed})

    os.makedirs(args.out, exist_ok=True)
    torch.save({'model_state_dict': model.state_dict(), 'config': config.__dict__}, os.path.join(args.out, 'checkpoint.pt'))
    with open(os.path.join(args.out, 'log.json'), 'w', encoding='utf-8') as f:
        json.dump(log, f, indent=2)

    print(f"Done. Final val_bpc={log['history'][-1]['val_bpc']:.4f}. Saved to {args.out}")


if __name__ == '__main__':
    main()
