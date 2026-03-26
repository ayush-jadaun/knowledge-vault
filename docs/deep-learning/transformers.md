---
title: "Transformers"
description: "Self-attention mechanism with full derivation, multi-head attention, positional encoding, encoder-decoder architecture, complete Attention Is All You Need walkthrough, from-scratch implementation, and analysis of why transformers scale."
tags: [transformers, self-attention, positional-encoding, encoder-decoder, deep-learning]
difficulty: advanced
prerequisites: [deep-learning/rnn-lstm]
lastReviewed: "2026-03-25"
---

# Transformers

The transformer architecture (Vaswani et al., 2017) replaced recurrence with self-attention, enabling parallel training and capturing long-range dependencies without the vanishing gradient problem. Every major language model (GPT, BERT, T5, LLaMA), vision model (ViT, DINO), and multimodal model (CLIP, Stable Diffusion) is built on transformers. This page derives every component from first principles, implements a transformer from scratch, and explains why the architecture scales so effectively.

## Why Self-Attention?

RNNs process sequences one token at a time --- to connect token 1 to token 100, information must flow through 99 hidden states. Transformers connect every token to every other token directly through attention.

| Property | RNN | Transformer |
|----------|-----|-------------|
| Parallelization | Sequential (slow) | Fully parallel (fast) |
| Long-range dependencies | Signal degrades over distance | Direct O(1) connection |
| Maximum path length | O(n) | O(1) |
| Computation per layer | O(n) | O(n^2) (attention matrix) |
| Training speed | Slow | Fast on GPUs |

## Scaled Dot-Product Attention

### The Core Equation

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right) V
$$

where:
- $Q \in \mathbb{R}^{n \times d_k}$ are queries ("what am I looking for?")
- $K \in \mathbb{R}^{m \times d_k}$ are keys ("what do I contain?")
- $V \in \mathbb{R}^{m \times d_v}$ are values ("what information do I provide?")
- $d_k$ is the dimension of keys/queries

### Step-by-Step Derivation

**Step 1 --- Compute attention scores:**

$$
S = QK^T \in \mathbb{R}^{n \times m}
$$

$S_{ij}$ measures how much query $i$ should attend to key $j$. This is a dot product: $S_{ij} = q_i \cdot k_j$.

**Step 2 --- Scale:**

$$
S_{\text{scaled}} = \frac{S}{\sqrt{d_k}}
$$

Without scaling, when $d_k$ is large, dot products grow in magnitude, pushing softmax into saturation (where gradients are near zero). If $q$ and $k$ are independent with zero mean and unit variance:

$$
\text{Var}(q \cdot k) = \sum_{i=1}^{d_k} \text{Var}(q_i k_i) = d_k
$$

Dividing by $\sqrt{d_k}$ normalizes the variance back to 1.

**Step 3 --- Softmax:**

$$
\alpha_{ij} = \frac{\exp(S_{ij} / \sqrt{d_k})}{\sum_{l=1}^{m} \exp(S_{il} / \sqrt{d_k})}
$$

Each row of the attention weights sums to 1. $\alpha_{ij}$ is the fraction of attention that position $i$ pays to position $j$.

**Step 4 --- Weighted sum:**

$$
\text{output}_i = \sum_{j=1}^{m} \alpha_{ij} v_j
$$

Each output is a weighted combination of value vectors, where the weights come from the attention scores.

### Implementation

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

def scaled_dot_product_attention(Q, K, V, mask=None):
    """
    Q: (batch, heads, seq_q, d_k)
    K: (batch, heads, seq_k, d_k)
    V: (batch, heads, seq_k, d_v)
    mask: (batch, 1, 1, seq_k) or (batch, 1, seq_q, seq_k)
    """
    d_k = Q.size(-1)
    scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(d_k)

    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))

    attn_weights = F.softmax(scores, dim=-1)
    output = torch.matmul(attn_weights, V)
    return output, attn_weights
```

## Multi-Head Attention

Instead of one attention function, run $h$ attention heads in parallel, each with different learned projections:

$$
\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h) W^O
$$

where each head is:

$$
\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)
$$

with $W_i^Q \in \mathbb{R}^{d_{\text{model}} \times d_k}$, $W_i^K \in \mathbb{R}^{d_{\text{model}} \times d_k}$, $W_i^V \in \mathbb{R}^{d_{\text{model}} \times d_v}$, and $W^O \in \mathbb{R}^{hd_v \times d_{\text{model}}}$.

Typically $d_k = d_v = d_{\text{model}} / h$. With $d_{\text{model}} = 512$ and $h = 8$, each head has $d_k = 64$.

**Why multiple heads?** Different heads can learn different types of relationships: syntactic (subject-verb), semantic (co-reference), positional (adjacent tokens), etc.

```python
class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, n_heads):
        super().__init__()
        assert d_model % n_heads == 0
        self.d_k = d_model // n_heads
        self.n_heads = n_heads

        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)

    def forward(self, Q, K, V, mask=None):
        batch_size = Q.size(0)

        # Linear projections and reshape to (batch, heads, seq, d_k)
        Q = self.W_q(Q).view(batch_size, -1, self.n_heads, self.d_k).transpose(1, 2)
        K = self.W_k(K).view(batch_size, -1, self.n_heads, self.d_k).transpose(1, 2)
        V = self.W_v(V).view(batch_size, -1, self.n_heads, self.d_k).transpose(1, 2)

        # Scaled dot-product attention
        attn_output, attn_weights = scaled_dot_product_attention(Q, K, V, mask)

        # Concatenate heads and project
        attn_output = attn_output.transpose(1, 2).contiguous().view(
            batch_size, -1, self.n_heads * self.d_k
        )
        return self.W_o(attn_output)
```

## Positional Encoding

Since attention is permutation-equivariant (no notion of order), we must inject position information.

### Sinusoidal Positional Encoding

$$
PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right)
$$

$$
PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right)
$$

**Why sinusoidal?** For any fixed offset $k$, $PE_{pos+k}$ can be represented as a linear function of $PE_{pos}$. This lets the model learn to attend to relative positions:

$$
PE_{pos+k} = A_k \cdot PE_{pos}
$$

where $A_k$ is a rotation matrix (in each 2D sinusoidal subspace).

```python
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000, dropout=0.1):
        super().__init__()
        self.dropout = nn.Dropout(dropout)

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        self.register_buffer('pe', pe)

    def forward(self, x):
        """x: (batch, seq_len, d_model)"""
        x = x + self.pe[:, :x.size(1)]
        return self.dropout(x)
```

### Learned Positional Embeddings

Modern models (GPT, BERT) often use learned positional embeddings:

```python
self.pos_embedding = nn.Embedding(max_seq_len, d_model)
# Usage: x = x + self.pos_embedding(torch.arange(seq_len, device=x.device))
```

### Rotary Position Embedding (RoPE)

Used in LLaMA, Mistral, and most modern LLMs. Encodes position by rotating the query and key vectors:

$$
f(x, pos) = x e^{i \cdot pos \cdot \theta}
$$

This directly encodes relative position in the dot product: $\langle f(q, m), f(k, n) \rangle$ depends only on $m - n$.

## Feed-Forward Network

Each transformer layer contains a position-wise feed-forward network (applied identically to each position):

$$
\text{FFN}(x) = \max(0, xW_1 + b_1)W_2 + b_2
$$

The inner dimension is typically $4 \times d_{\text{model}}$:

```python
class FeedForward(nn.Module):
    def __init__(self, d_model, d_ff, dropout=0.1):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = nn.GELU()

    def forward(self, x):
        return self.linear2(self.dropout(self.activation(self.linear1(x))))
```

## Encoder Layer

```python
class EncoderLayer(nn.Module):
    def __init__(self, d_model, n_heads, d_ff, dropout=0.1):
        super().__init__()
        self.self_attn = MultiHeadAttention(d_model, n_heads)
        self.feed_forward = FeedForward(d_model, d_ff, dropout)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, mask=None):
        # Self-attention with residual connection and layer norm
        attn_out = self.self_attn(x, x, x, mask)
        x = self.norm1(x + self.dropout(attn_out))

        # Feed-forward with residual connection and layer norm
        ff_out = self.feed_forward(x)
        x = self.norm2(x + self.dropout(ff_out))
        return x
```

## Decoder Layer

The decoder adds masked self-attention (causal mask) and cross-attention to the encoder output:

```python
class DecoderLayer(nn.Module):
    def __init__(self, d_model, n_heads, d_ff, dropout=0.1):
        super().__init__()
        self.self_attn = MultiHeadAttention(d_model, n_heads)
        self.cross_attn = MultiHeadAttention(d_model, n_heads)
        self.feed_forward = FeedForward(d_model, d_ff, dropout)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.norm3 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, encoder_output, src_mask=None, tgt_mask=None):
        # Masked self-attention
        attn_out = self.self_attn(x, x, x, tgt_mask)
        x = self.norm1(x + self.dropout(attn_out))

        # Cross-attention (queries from decoder, keys/values from encoder)
        cross_out = self.cross_attn(x, encoder_output, encoder_output, src_mask)
        x = self.norm2(x + self.dropout(cross_out))

        # Feed-forward
        ff_out = self.feed_forward(x)
        x = self.norm3(x + self.dropout(ff_out))
        return x
```

## Causal Mask

For autoregressive generation, position $i$ should only attend to positions $\leq i$:

```python
def create_causal_mask(seq_len):
    """Upper-triangular mask: 1 = allowed, 0 = masked."""
    mask = torch.tril(torch.ones(seq_len, seq_len))
    return mask.unsqueeze(0).unsqueeze(0)  # (1, 1, seq, seq)
```

## Full Transformer

```python
class Transformer(nn.Module):
    def __init__(self, src_vocab, tgt_vocab, d_model=512, n_heads=8,
                 n_enc_layers=6, n_dec_layers=6, d_ff=2048,
                 max_len=5000, dropout=0.1):
        super().__init__()
        self.d_model = d_model

        # Embeddings
        self.src_embed = nn.Embedding(src_vocab, d_model)
        self.tgt_embed = nn.Embedding(tgt_vocab, d_model)
        self.pos_encoding = PositionalEncoding(d_model, max_len, dropout)

        # Encoder and decoder stacks
        self.encoder_layers = nn.ModuleList([
            EncoderLayer(d_model, n_heads, d_ff, dropout)
            for _ in range(n_enc_layers)
        ])
        self.decoder_layers = nn.ModuleList([
            DecoderLayer(d_model, n_heads, d_ff, dropout)
            for _ in range(n_dec_layers)
        ])

        # Output projection
        self.output_proj = nn.Linear(d_model, tgt_vocab)

    def encode(self, src, src_mask=None):
        x = self.pos_encoding(self.src_embed(src) * math.sqrt(self.d_model))
        for layer in self.encoder_layers:
            x = layer(x, src_mask)
        return x

    def decode(self, tgt, encoder_output, src_mask=None, tgt_mask=None):
        x = self.pos_encoding(self.tgt_embed(tgt) * math.sqrt(self.d_model))
        for layer in self.decoder_layers:
            x = layer(x, encoder_output, src_mask, tgt_mask)
        return x

    def forward(self, src, tgt, src_mask=None, tgt_mask=None):
        enc_output = self.encode(src, src_mask)
        dec_output = self.decode(tgt, enc_output, src_mask, tgt_mask)
        return self.output_proj(dec_output)
```

## "Attention Is All You Need" --- Paper Walkthrough

The original transformer paper introduced:

1. **No recurrence, no convolution** --- purely attention-based
2. **Encoder-decoder structure** with 6 layers each
3. **Multi-head self-attention** with 8 heads, $d_{\text{model}} = 512$
4. **Positional encoding** via sinusoidal functions
5. **Residual connections + LayerNorm** around each sub-layer
6. **Label smoothing** ($\epsilon = 0.1$) for training
7. **Warmup + inverse square root decay** learning rate schedule

**Training details:**
- WMT 2014 English-German: 4.5M sentence pairs
- 8 NVIDIA P100 GPUs, 3.5 days
- BLEU score: 28.4 (new SOTA)

**The learning rate schedule:**

$$
lr = d_{\text{model}}^{-0.5} \cdot \min(\text{step}^{-0.5}, \text{step} \cdot \text{warmup}^{-1.5})
$$

This increases linearly during warmup, then decays with the inverse square root.

## Why Transformers Scale

### Parallelization

RNNs must process tokens sequentially ($T$ serial steps). Transformers process all tokens simultaneously --- a single matrix multiplication. GPU utilization jumps from ~30% (RNN) to ~90% (transformer).

### Compute-Data Scaling Laws

Kaplan et al. (2020) showed that transformer loss follows power laws:

$$
L(N) \propto N^{-\alpha_N}, \quad L(D) \propto D^{-\alpha_D}, \quad L(C) \propto C^{-\alpha_C}
$$

where $N$ is parameters, $D$ is data, and $C$ is compute. This predictability lets teams plan training runs.

### Attention as a Learned Index

Self-attention lets the model dynamically route information based on content, not fixed connectivity. This is a form of learned conditional computation that scales gracefully with model size.

## Attention Complexity and Optimization

Standard self-attention is $O(n^2)$ in sequence length, which limits context windows. Solutions:

| Method | Complexity | Approach |
|--------|-----------|----------|
| Standard | $O(n^2)$ | Full attention matrix |
| Flash Attention | $O(n^2)$ time, $O(n)$ memory | Tiled computation, no materialization |
| Multi-Query Attention | $O(n^2)$ but faster | Shared K, V across heads |
| Grouped-Query Attention | $O(n^2)$ but faster | Groups of heads share K, V |
| Sliding Window | $O(n \cdot w)$ | Local attention window |
| Ring Attention | $O(n^2)$ distributed | Distribute across devices |

## Pre-Norm vs Post-Norm

The original paper uses post-norm (normalize after the residual):

$$
x = \text{LayerNorm}(x + \text{SubLayer}(x)) \quad \text{(post-norm)}
$$

Modern models use pre-norm (normalize before the sublayer):

$$
x = x + \text{SubLayer}(\text{LayerNorm}(x)) \quad \text{(pre-norm)}
$$

Pre-norm is more stable for deep networks and requires no learning rate warmup.

## KV Cache for Efficient Inference

During autoregressive generation, naive attention recomputes keys and values for all previous tokens at each step. The KV cache stores previously computed keys and values, reducing per-step computation from $O(n^2)$ to $O(n)$:

```python
class CachedAttention(nn.Module):
    def __init__(self, d_model, n_heads):
        super().__init__()
        self.n_heads = n_heads
        self.d_k = d_model // n_heads
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)

    def forward(self, x, kv_cache=None):
        B, T, C = x.shape
        q = self.W_q(x).view(B, T, self.n_heads, self.d_k).transpose(1, 2)
        k = self.W_k(x).view(B, T, self.n_heads, self.d_k).transpose(1, 2)
        v = self.W_v(x).view(B, T, self.n_heads, self.d_k).transpose(1, 2)

        if kv_cache is not None:
            # Append to cached keys and values
            prev_k, prev_v = kv_cache
            k = torch.cat([prev_k, k], dim=2)
            v = torch.cat([prev_v, v], dim=2)

        new_cache = (k, v)

        # Attention with full K, V but only new Q
        att = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_k)
        att = F.softmax(att, dim=-1)
        y = att @ v

        y = y.transpose(1, 2).contiguous().view(B, T, C)
        return self.W_o(y), new_cache
```

### Memory Savings from KV Cache

Without cache: generating $n$ tokens requires $O(n^2)$ total computation.
With cache: generating $n$ tokens requires $O(n)$ total computation (each step is $O(1)$ for the cached keys/values).

The trade-off is memory: the KV cache grows linearly with sequence length. For a model with $L$ layers, $h$ heads, and $d_k$ per head:

$$
\text{KV cache memory} = 2 \times L \times n \times h \times d_k \times \text{bytes\_per\_element}
$$

For LLaMA 70B at 4096 tokens with FP16: approximately 5 GB of KV cache.

## Grouped-Query and Multi-Query Attention

Standard multi-head attention uses separate K, V projections per head. This makes the KV cache large.

**Multi-Query Attention (MQA):** All heads share the same K and V. KV cache shrinks by $h\times$.

**Grouped-Query Attention (GQA):** Groups of heads share K, V. A compromise between MHA and MQA.

| Method | K, V per head | KV Cache Size | Quality |
|--------|--------------|---------------|---------|
| MHA | Unique per head | Large ($h \times d_k$) | Best |
| GQA | Shared per group | Medium ($g \times d_k$) | Near-MHA |
| MQA | Single shared | Small ($d_k$) | Slightly worse |

LLaMA 2 70B uses GQA with 8 KV heads (vs 64 query heads).

## Flash Attention

Flash Attention (Dao et al., 2022) computes exact attention without materializing the full $n \times n$ attention matrix, reducing memory from $O(n^2)$ to $O(n)$:

1. Split Q, K, V into blocks that fit in SRAM
2. Compute attention block-by-block using online softmax
3. Never write the full attention matrix to GPU HBM

**Results:** 2-4x speedup and 5-20x memory reduction, with exact (not approximate) computation.

```python
# PyTorch 2.0+ has built-in Flash Attention
from torch.nn.functional import scaled_dot_product_attention

# This automatically uses Flash Attention when available
output = scaled_dot_product_attention(Q, K, V, is_causal=True)
```

## Transformer Debugging Tips

| Issue | Symptom | Fix |
|-------|---------|-----|
| Attention to wrong positions | Model ignores relevant tokens | Check causal mask is applied correctly |
| Positional encoding missing | Model treats input as a bag of tokens | Add positional encoding/embedding |
| Post-norm instability | Loss spikes during training | Switch to pre-norm |
| Attention overflow | NaN in attention weights | Use scaled dot-product ($\sqrt{d_k}$) |
| Embedding scale | Poor early training | Multiply embeddings by $\sqrt{d_{\text{model}}}$ |

## Cross-References

- **Predecessors:** [RNN and LSTM](/deep-learning/rnn-lstm) --- what transformers replaced
- **NLP applications:** [Language Models](/deep-learning/language-models) --- GPT, BERT, T5
- **Vision application:** [Image Classification](/deep-learning/image-classification) --- ViT
- **Generative:** [Text Generation](/deep-learning/text-generation) --- decoding strategies
- **BERT family:** [BERT Family](/deep-learning/bert-family) --- encoder-only transformers
- **Scaling:** [Model Optimization](/deep-learning/model-optimization) --- making transformers efficient
