---
title: "BERT Family"
description: "BERT architecture and pre-training, fine-tuning for classification and NER, DistilBERT knowledge distillation, RoBERTa, DeBERTa, sentence-transformers, and practical HuggingFace examples on CoLA and NER datasets."
tags: [bert, fine-tuning, ner, sentence-transformers, huggingface]
difficulty: advanced
prerequisites: [deep-learning/transformers, deep-learning/language-models]
lastReviewed: "2026-03-25"
---

# BERT Family

BERT (Bidirectional Encoder Representations from Transformers) revolutionized NLP in 2018 by showing that bidirectional pre-training produces representations that transfer to virtually any NLP task. This page covers BERT's architecture and pre-training, fine-tuning for classification and NER, the evolution through RoBERTa and DeBERTa, knowledge distillation with DistilBERT, sentence embeddings, and hands-on examples with HuggingFace.

## BERT Architecture

BERT is a stack of transformer encoder layers. It processes the full input bidirectionally --- every token can attend to every other token.

### Model Sizes

| Model | Layers | Hidden | Heads | Parameters |
|-------|--------|--------|-------|-----------|
| BERT-base | 12 | 768 | 12 | 110M |
| BERT-large | 24 | 1024 | 16 | 340M |

### Input Representation

BERT's input is the sum of three embeddings:

$$
E_{\text{input}} = E_{\text{token}} + E_{\text{segment}} + E_{\text{position}}
$$

```
Input:    [CLS] the cat sat [SEP] it was happy [SEP]
Token:    E_CLS E_the E_cat E_sat E_SEP E_it E_was E_happy E_SEP
Segment:  E_A   E_A   E_A   E_A   E_A   E_B  E_B   E_B    E_B
Position: E_0   E_1   E_2   E_3   E_4   E_5  E_6   E_7    E_8
```

- `[CLS]`: special classification token (its final representation is used for classification tasks)
- `[SEP]`: separator between sentence pairs
- Segment embeddings: distinguish sentence A from sentence B

## Pre-Training Objectives

### Masked Language Modeling (MLM)

Randomly mask 15% of input tokens and predict them:

$$
\mathcal{L}_{\text{MLM}} = -\mathbb{E}\left[\sum_{i \in \mathcal{M}} \log P(w_i | \mathbf{w}_{\backslash \mathcal{M}})\right]
$$

Of the 15% selected for masking:
- 80% replaced with `[MASK]`
- 10% replaced with a random token
- 10% kept unchanged

This prevents the model from learning that `[MASK]` is special (since `[MASK]` never appears at fine-tuning time).

### Next Sentence Prediction (NSP)

Given two sentences, predict whether B actually follows A:

$$
P(\text{IsNext} | \text{[CLS] representation})
$$

50% of pairs are actual consecutive sentences, 50% are random pairs.

::: info NSP Controversy
RoBERTa showed that NSP does not help and can hurt performance. Modern BERT variants drop NSP entirely. ALBERT replaces it with sentence-order prediction (SOP).
:::

## Fine-Tuning BERT

The key insight: pre-trained BERT captures general language understanding. Fine-tuning adds a task-specific head and trains end-to-end on labeled data.

### Text Classification (CoLA)

CoLA (Corpus of Linguistic Acceptability) --- binary classification of whether a sentence is grammatically acceptable.

```python
from transformers import (
    AutoTokenizer, AutoModelForSequenceClassification,
    Trainer, TrainingArguments
)
from datasets import load_dataset
import numpy as np

# Load dataset
dataset = load_dataset('glue', 'cola')

# Tokenizer
tokenizer = AutoTokenizer.from_pretrained('bert-base-uncased')

def tokenize_function(examples):
    return tokenizer(
        examples['sentence'],
        padding='max_length',
        truncation=True,
        max_length=128,
    )

tokenized = dataset.map(tokenize_function, batched=True)

# Model
model = AutoModelForSequenceClassification.from_pretrained(
    'bert-base-uncased',
    num_labels=2,
)

# Training
training_args = TrainingArguments(
    output_dir='./results',
    num_train_epochs=3,
    per_device_train_batch_size=32,
    per_device_eval_batch_size=64,
    learning_rate=2e-5,
    weight_decay=0.01,
    eval_strategy='epoch',
    save_strategy='epoch',
    load_best_model_at_end=True,
    metric_for_best_model='matthews_correlation',
)

from sklearn.metrics import matthews_corrcoef

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    return {'matthews_correlation': matthews_corrcoef(labels, predictions)}

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized['train'],
    eval_dataset=tokenized['validation'],
    compute_metrics=compute_metrics,
)

trainer.train()
# Expected: MCC ~0.56-0.60 on CoLA validation
```

### Named Entity Recognition (NER)

NER labels each token with an entity type (PER, ORG, LOC, MISC, O):

```python
from transformers import AutoModelForTokenClassification
from datasets import load_dataset

# Load CoNLL-2003
dataset = load_dataset('conll2003')
label_names = dataset['train'].features['ner_tags'].feature.names
num_labels = len(label_names)

tokenizer = AutoTokenizer.from_pretrained('bert-base-uncased')

def tokenize_and_align(examples):
    tokenized = tokenizer(
        examples['tokens'],
        truncation=True,
        is_split_into_words=True,
        padding='max_length',
        max_length=128,
    )
    labels = []
    for i, label in enumerate(examples['ner_tags']):
        word_ids = tokenized.word_ids(batch_index=i)
        label_ids = []
        previous_word_id = None
        for word_id in word_ids:
            if word_id is None:
                label_ids.append(-100)  # Special tokens
            elif word_id != previous_word_id:
                label_ids.append(label[word_id])
            else:
                label_ids.append(-100)  # Subword tokens
            previous_word_id = word_id
        labels.append(label_ids)
    tokenized['labels'] = labels
    return tokenized

tokenized = dataset.map(tokenize_and_align, batched=True)

model = AutoModelForTokenClassification.from_pretrained(
    'bert-base-uncased',
    num_labels=num_labels,
)

# Use seqeval for NER metrics
import evaluate
seqeval = evaluate.load('seqeval')

def compute_ner_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)

    true_labels = []
    true_predictions = []
    for pred, label in zip(predictions, labels):
        t_labels = []
        t_preds = []
        for p, l in zip(pred, label):
            if l != -100:
                t_labels.append(label_names[l])
                t_preds.append(label_names[p])
        true_labels.append(t_labels)
        true_predictions.append(t_preds)

    results = seqeval.compute(predictions=true_predictions, references=true_labels)
    return {
        'precision': results['overall_precision'],
        'recall': results['overall_recall'],
        'f1': results['overall_f1'],
    }

# Expected F1: ~91-92% on CoNLL-2003
```

## BERT Variants

### RoBERTa (Robustly Optimized BERT)

Liu et al. (2019) showed BERT was significantly undertrained. RoBERTa improvements:

1. **Remove NSP** --- it hurts performance
2. **Dynamic masking** --- different mask each epoch (BERT uses static masking)
3. **Larger batches** --- 8K instead of 256
4. **More data** --- 160GB text (BERT used 16GB)
5. **Longer training** --- 500K steps (BERT used 1M but smaller batches)

Result: significant improvements on all GLUE benchmarks.

### DeBERTa (Decoupled Attention)

He et al. (2021) introduced two innovations:

1. **Disentangled attention:** Separate content and position embeddings in attention:

$$
A_{ij} = \{H_i^c, P_{i|j}^c\} \times \{H_j^c, P_{j|i}^c\}^T
$$

where content-to-content, content-to-position, and position-to-content interactions are computed separately.

2. **Enhanced mask decoder:** Use absolute positions only in the decoder layer (after all transformer layers), not in every layer.

DeBERTa-v3 is the current best encoder-only model for many NLP tasks.

### ALBERT (A Lite BERT)

Reduces parameters through:
- **Factorized embedding:** $V \times H \to V \times E + E \times H$ (decouple vocab embedding from hidden size)
- **Cross-layer parameter sharing:** All layers share the same weights

ALBERT-xxlarge has 235M parameters but performs like BERT-large with 12x fewer parameters.

### DistilBERT: Knowledge Distillation

DistilBERT (Sanh et al., 2019) compresses BERT through knowledge distillation.

**Distillation loss:**

$$
\mathcal{L}_{\text{distill}} = \alpha T^2 \cdot D_{KL}\left(\text{softmax}\left(\frac{z_s}{T}\right) \| \text{softmax}\left(\frac{z_t}{T}\right)\right) + (1 - \alpha) \mathcal{L}_{\text{CE}}
$$

where $z_s$ and $z_t$ are student and teacher logits, $T$ is the temperature, and $\alpha$ balances distillation and hard-label losses.

| Model | Layers | Parameters | GLUE Score | Speed |
|-------|--------|-----------|------------|-------|
| BERT-base | 12 | 110M | 79.6 | 1x |
| DistilBERT | 6 | 66M | 77.0 | 1.6x |
| TinyBERT | 4 | 14.5M | 74.4 | 4x |

## Sentence Transformers

Standard BERT produces token-level embeddings. For sentence similarity, we need fixed-size sentence embeddings.

### Mean Pooling

Average all token embeddings (ignoring padding):

```python
def mean_pooling(model_output, attention_mask):
    token_embeddings = model_output.last_hidden_state
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size())
    sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
    sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
    return sum_embeddings / sum_mask
```

### Sentence-BERT (SBERT)

Reimers and Gurevych (2019) fine-tuned BERT with a siamese architecture for sentence similarity:

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')

sentences = [
    "The cat sits on the mat",
    "A feline rests on the rug",
    "The stock market crashed today",
]

embeddings = model.encode(sentences)

# Compute cosine similarity
from sklearn.metrics.pairwise import cosine_similarity
sims = cosine_similarity(embeddings)
print(sims)
# [[1.0, 0.82, 0.05],
#  [0.82, 1.0, 0.03],
#  [0.05, 0.03, 1.0]]
```

### Use Cases for Sentence Embeddings

| Task | Approach |
|------|----------|
| Semantic search | Encode query + documents, find nearest |
| Clustering | Encode sentences, apply k-means |
| Deduplication | Find pairs above similarity threshold |
| RAG retrieval | Encode chunks, retrieve by query similarity |

## Fine-Tuning Best Practices

| Hyperparameter | BERT-base | BERT-large |
|---------------|-----------|------------|
| Learning rate | 2e-5 to 5e-5 | 1e-5 to 3e-5 |
| Batch size | 16 or 32 | 16 |
| Epochs | 3-5 | 2-4 |
| Warmup | 6-10% of steps | 6-10% |
| Weight decay | 0.01 | 0.01 |
| Max seq length | 128 or 512 | 128 or 512 |

### Gradual Unfreezing

```python
# Freeze all layers
for param in model.bert.parameters():
    param.requires_grad = False

# Only train classifier head first (1-2 epochs)
# Then unfreeze all layers with lower LR
for param in model.bert.parameters():
    param.requires_grad = True

optimizer = torch.optim.AdamW([
    {'params': model.bert.parameters(), 'lr': 1e-5},
    {'params': model.classifier.parameters(), 'lr': 5e-5},
])
```

## When to Use Which BERT Variant

| Scenario | Recommended Model |
|----------|------------------|
| General NLU tasks | DeBERTa-v3-base |
| Low latency needed | DistilBERT or TinyBERT |
| Sentence similarity | all-MiniLM-L6-v2 (SBERT) |
| Multilingual | XLM-RoBERTa |
| Biomedical text | PubMedBERT |
| Legal text | Legal-BERT |
| Code understanding | CodeBERT |

## BERT Internal Representations

### What Does Each Layer Learn?

Research (Jawahar et al., 2019; Tenney et al., 2019) shows BERT layers learn a hierarchy:

| Layer Range | What It Captures | Evidence |
|------------|-----------------|----------|
| Layers 1-3 | Surface features (POS tagging, word identity) | High probing accuracy for POS |
| Layers 4-8 | Syntactic features (parsing, dependencies) | High probing accuracy for syntax |
| Layers 9-12 | Semantic features (NER, SRL, coreference) | High probing accuracy for semantics |

### Attention Pattern Visualization

```python
from transformers import AutoTokenizer, AutoModel
import torch

tokenizer = AutoTokenizer.from_pretrained('bert-base-uncased')
model = AutoModel.from_pretrained('bert-base-uncased', output_attentions=True)

text = "The cat sat on the mat"
inputs = tokenizer(text, return_tensors='pt')

with torch.no_grad():
    outputs = model(**inputs)

# outputs.attentions is a tuple of (batch, heads, seq, seq) tensors
# One per layer (12 layers, 12 heads each)
attentions = outputs.attentions

# Examine attention from [CLS] to all tokens in layer 11, head 0
layer_11_head_0 = attentions[11][0, 0]  # (seq, seq)
cls_attention = layer_11_head_0[0]       # Attention FROM [CLS]
tokens = tokenizer.convert_ids_to_tokens(inputs['input_ids'][0])

for token, weight in zip(tokens, cls_attention):
    print(f"  {token:12s}: {weight:.4f}")
```

### Common Attention Patterns

Researchers have identified recurring attention head patterns:

1. **Positional heads:** Attend to the previous/next token
2. **Delimiter heads:** Attend to `[SEP]` or `[CLS]`
3. **Syntactic heads:** Attend to syntactic dependencies (subject to verb)
4. **Coreference heads:** Attend to coreferent mentions
5. **Rare word heads:** Attend to infrequent tokens

## Question Answering with BERT

Extractive QA: given a passage and question, find the answer span.

```python
from transformers import pipeline

qa_pipeline = pipeline(
    "question-answering",
    model="deepset/roberta-base-squad2",
    tokenizer="deepset/roberta-base-squad2",
)

result = qa_pipeline(
    question="What is the capital of France?",
    context="France is a country in Western Europe. Its capital city is Paris, "
            "which is known for the Eiffel Tower."
)
print(f"Answer: {result['answer']}")      # Paris
print(f"Score:  {result['score']:.4f}")    # ~0.98
print(f"Start:  {result['start']}")        # character offset
```

### How Extractive QA Works

BERT outputs start and end logits for each token. The answer span is the token range with the highest combined score:

$$
\text{score}(i, j) = S_{\text{start}}(i) + S_{\text{end}}(j), \quad i \leq j
$$

```python
from transformers import AutoModelForQuestionAnswering

model = AutoModelForQuestionAnswering.from_pretrained("deepset/roberta-base-squad2")

inputs = tokenizer(question, context, return_tensors='pt')
with torch.no_grad():
    outputs = model(**inputs)

start_logits = outputs.start_logits[0]
end_logits = outputs.end_logits[0]

# Find best start and end positions
start_idx = start_logits.argmax()
end_idx = end_logits.argmax()

answer_tokens = inputs['input_ids'][0][start_idx:end_idx + 1]
answer = tokenizer.decode(answer_tokens)
```

## Semantic Textual Similarity

Measure how similar two sentences are using sentence-transformers:

```python
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer('all-MiniLM-L6-v2')

sentences = [
    "The weather is lovely today.",
    "It is a beautiful day.",
    "He drives a fast car.",
]

embeddings = model.encode(sentences, convert_to_tensor=True)
cosine_scores = util.cos_sim(embeddings, embeddings)

for i in range(len(sentences)):
    for j in range(i + 1, len(sentences)):
        print(f"  [{i}] vs [{j}]: {cosine_scores[i][j]:.4f}")
# [0] vs [1]: 0.82  (similar meaning)
# [0] vs [2]: 0.05  (different topics)
# [1] vs [2]: 0.03  (different topics)
```

## Common BERT Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Token indices sequence length longer than max` | Input exceeds 512 tokens | Truncate or use Longformer |
| Validation accuracy stuck at ~50% | Forgot to call `model.eval()` | Add `model.eval()` before validation |
| CUDA out of memory | Batch too large or seq too long | Reduce batch size, enable gradient checkpointing |
| Poor NER performance | Misaligned subword labels | Use `word_ids()` for label alignment |
| Fine-tuning degrades performance | Learning rate too high | Use 2e-5, not 2e-3 |

## Cross-References

- **Architecture:** [Transformers](/deep-learning/transformers) --- encoder layers, attention
- **Pre-training:** [Language Models](/deep-learning/language-models) --- MLM, CLM, scaling
- **Generation:** [Text Generation](/deep-learning/text-generation) --- decoder-only models
- **Embeddings:** [NLP Fundamentals](/deep-learning/nlp-fundamentals) --- Word2Vec context
- **Optimization:** [Model Optimization](/deep-learning/model-optimization) --- distillation, quantization
- **Multimodal:** [Multimodal Models](/deep-learning/multimodal-models) --- CLIP combines vision + text
