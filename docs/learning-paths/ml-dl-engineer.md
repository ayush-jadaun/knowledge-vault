---
title: "ML/DL Engineer Learning Path"
description: "A 16-week structured study plan for ML and deep learning engineers covering math foundations, PyTorch, all DL architectures, generative models, model optimization, and deployment with cross-references to EDA and data pipeline pages"
tags: [learning-path, machine-learning, deep-learning, pytorch, neural-networks]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-25"
---

# ML/DL Engineer Learning Path

This 16-week study plan takes you from mathematical foundations to deployment-ready deep learning engineer. Each week has specific readings from the Archon knowledge base, hands-on exercises, and a milestone. Budget 15-20 hours per week. This path cross-references the 69 EDA pages, 25 data pipeline pages, and AI engineering pages for complete coverage.

## Who This Is For

- Computer science graduates starting ML/DL careers
- Software engineers pivoting into ML research engineering
- Data scientists who want deeper understanding of neural network internals
- Anyone who wants to implement architectures from scratch, not just call APIs

## Prerequisites

- Python programming (comfortable with classes, list comprehensions, decorators)
- Basic linear algebra (vectors, matrices, dot products)
- Basic calculus (derivatives, chain rule)
- Basic probability (Bayes' theorem, distributions)

**Total estimated time**: ~250 hours across 16 weeks (15-20 hrs/week)

## Overview

```mermaid
graph LR
    subgraph "Phase 1: Foundations (Weeks 1-4)"
        W1["Week 1: Math + Python"]
        W2["Week 2: Neural Networks"]
        W3["Week 3: PyTorch"]
        W4["Week 4: Training Mastery"]
    end

    subgraph "Phase 2: Architectures (Weeks 5-8)"
        W5["Week 5: CNNs"]
        W6["Week 6: RNNs"]
        W7["Week 7: Transformers"]
        W8["Week 8: NLP"]
    end

    subgraph "Phase 3: Advanced (Weeks 9-12)"
        W9["Week 9: Generative"]
        W10["Week 10: CV Advanced"]
        W11["Week 11: LLMs"]
        W12["Week 12: Multimodal + RL"]
    end

    subgraph "Phase 4: Production (Weeks 13-16)"
        W13["Week 13: Optimization"]
        W14["Week 14: Deployment"]
        W15["Week 15: Capstone"]
        W16["Week 16: Portfolio"]
    end

    W1 --> W2 --> W3 --> W4
    W4 --> W5 --> W6 --> W7 --> W8
    W8 --> W9 --> W10 --> W11 --> W12
    W12 --> W13 --> W14 --> W15 --> W16
```

## Phase 1: Foundations (Weeks 1-4)

### Week 1: Mathematical Foundations and Python for ML

**Read:**
- [Deep Learning Overview](/deep-learning/) -- understand the landscape
- [Math Foundations](/machine-learning/math-foundations) -- linear algebra, calculus, probability for ML
- [Python ML Ecosystem](/machine-learning/python-ml-ecosystem) -- NumPy, pandas, scikit-learn overview
- [NumPy](/eda/numpy) -- array operations, broadcasting, vectorization

**EDA cross-reference (for data intuition):**
- [Data Types Deep Dive](/eda/data-types-deep-dive) -- understand data before modeling
- [Understanding Distributions](/eda/understanding-distributions) -- probability distributions in practice

**Exercise:**
- Implement matrix multiplication from scratch in Python
- Implement gradient descent for linear regression using only NumPy

**Milestone:** You can explain the chain rule, compute matrix products, and write vectorized NumPy code.

---

### Week 2: Neural Network Basics

**Read:**
- [Neural Network Basics](/deep-learning/neural-network-basics) -- perceptrons, activations, backprop, optimizers
- [Architecture Selection Guide](/deep-learning/architecture-selection-guide) -- overview of all architectures

**ML foundations cross-reference:**
- [Linear Regression](/machine-learning/linear-regression) -- the simplest model
- [Logistic Regression](/machine-learning/logistic-regression) -- classification foundations
- [Evaluation Metrics](/machine-learning/evaluation-metrics) -- how to measure model quality

**Exercise:**
- Implement a 2-layer MLP on MNIST from scratch with NumPy
- Achieve >97% accuracy by tuning learning rate and architecture

**Milestone:** You can derive backpropagation by hand and implement a working MLP from scratch.

---

### Week 3: PyTorch Fundamentals

**Read:**
- [PyTorch Fundamentals](/deep-learning/pytorch-fundamentals) -- tensors, autograd, nn.Module, DataLoader

**Exercise:**
- Rewrite your NumPy MLP in PyTorch using nn.Module
- Train CIFAR-10 classifier

**Milestone:** You can write a complete PyTorch training loop from memory.

---

### Week 4: Training Techniques

**Read:**
- [Training Techniques](/deep-learning/training-techniques) -- BatchNorm, dropout, weight init, LR scheduling, mixed precision
- [DL Checklist](/deep-learning/dl-checklist) -- 40-item project checklist
- [Cross-Validation](/machine-learning/cross-validation) -- proper evaluation methodology
- [Hyperparameter Tuning](/machine-learning/hyperparameter-tuning) -- grid, random, Bayesian

**Exercise:**
- Systematically add BatchNorm, dropout, data augmentation, cosine LR schedule to CIFAR-10
- Measure improvement from each technique

**Milestone:** You can apply every standard training technique and understand when each helps.

## Phase 2: Architectures (Weeks 5-8)

### Week 5: Convolutional Neural Networks

**Read:**
- [CNN](/deep-learning/cnn) -- convolution math, LeNet to ResNet to EfficientNet
- [Image Classification](/deep-learning/image-classification) -- augmentation, ViT, transfer learning

**EDA cross-reference:**
- [Image & Audio EDA](/eda/image-audio-eda) -- understanding image data

**Exercise:**
- Implement ResNet-18 from scratch
- Fine-tune pretrained EfficientNet on a custom dataset

**Milestone:** You can implement ResNet from scratch and apply transfer learning.

---

### Week 6: Sequences: RNNs and LSTMs

**Read:**
- [RNN and LSTM](/deep-learning/rnn-lstm) -- RNN equations, vanishing gradients, LSTM gates, GRU
- [NLP Fundamentals](/deep-learning/nlp-fundamentals) -- tokenization, Word2Vec, embeddings

**EDA cross-reference:**
- [Text Features](/eda/text-features) -- text data exploration
- [Text Preprocessing](/data-pipeline/text-preprocessing) -- cleaning text for NLP

**Exercise:**
- Implement LSTM from scratch in PyTorch
- Train sentiment classifier on IMDB -- target >87%

**Milestone:** You can implement LSTM from scratch and explain why it solves vanishing gradients.

---

### Week 7: Transformers

**Read:**
- [Transformers](/deep-learning/transformers) -- self-attention, multi-head attention, positional encoding

**Exercise:**
- Implement a transformer from scratch (attention, multi-head, encoder, decoder)
- Visualize attention patterns

**Milestone:** You can implement a transformer from scratch and explain every component.

---

### Week 8: NLP with Transformers

**Read:**
- [Language Models](/deep-learning/language-models) -- n-gram to GPT, pre-training, scaling laws
- [BERT Family](/deep-learning/bert-family) -- BERT, RoBERTa, DeBERTa, sentence-transformers
- [Text Generation](/deep-learning/text-generation) -- decoding strategies, RLHF, DPO

**Exercise:**
- Fine-tune BERT on CoLA and measure Matthews correlation
- Build a semantic search engine with sentence-transformers

**Milestone:** You can fine-tune any HuggingFace model for classification, NER, or generation.

## Phase 3: Advanced Topics (Weeks 9-12)

### Week 9: Generative Models

**Read:**
- [Autoencoders](/deep-learning/autoencoders) -- vanilla AE, VAE, ELBO, reparameterization trick
- [GANs](/deep-learning/gans) -- minimax, mode collapse, WGAN-GP, conditional GAN
- [Diffusion Models](/deep-learning/diffusion-models) -- DDPM, Stable Diffusion, LoRA

**Exercise:**
- Implement VAE from scratch on MNIST
- Fine-tune Stable Diffusion with LoRA

**Milestone:** You can implement VAE and GAN from scratch and explain diffusion math.

---

### Week 10: Advanced Computer Vision

**Read:**
- [Object Detection](/deep-learning/object-detection) -- R-CNN family, YOLO, DETR, mAP
- [Image Segmentation](/deep-learning/image-segmentation) -- U-Net, DeepLab, Mask R-CNN, SAM
- [Transfer Learning](/deep-learning/transfer-learning) -- feature extraction, fine-tuning, CLIP, few-shot

**Exercise:**
- Train YOLOv8 on a custom dataset
- Implement U-Net from scratch for medical imaging

**Milestone:** You can train object detectors and segmentation models on custom data.

---

### Week 11: Large Language Models and Alignment

**Read:**
- [Language Models](/deep-learning/language-models) (revisit scaling laws)
- [Text Generation](/deep-learning/text-generation) (revisit RLHF and DPO)
- [Papers Reading List](/deep-learning/papers-reading-list) -- read Transformer through DPO papers

**AI engineering cross-reference:**
- [Fine-Tuning](/ai-ml-engineering/fine-tuning) -- practical fine-tuning guide
- [AI Guardrails](/ai-ml-engineering/ai-guardrails) -- safety and alignment in practice

**Exercise:**
- Fine-tune an open LLM with LoRA on a custom instruction dataset
- Implement DPO on a small preference dataset

**Milestone:** You can train a small LM from scratch and fine-tune open LLMs with LoRA/DPO.

---

### Week 12: Multimodal Models and Reinforcement Learning

**Read:**
- [Multimodal Models](/deep-learning/multimodal-models) -- CLIP, VQA, image captioning
- [Reinforcement Learning](/deep-learning/reinforcement-learning) -- MDP, Q-learning, DQN, PPO
- [Graph Neural Networks](/deep-learning/graph-neural-networks) -- message passing, GCN, GAT

**Exercise:**
- Build an image search system with CLIP
- Train DQN on CartPole

**Milestone:** You can build multimodal systems and train RL agents.

## Phase 4: Production (Weeks 13-16)

### Week 13: Model Optimization

**Read:**
- [Model Optimization](/deep-learning/model-optimization) -- pruning, quantization, distillation, ONNX, TensorRT

**Data pipeline cross-reference:**
- [Preprocessing Pipeline](/data-pipeline/preprocessing-pipeline) -- production data preprocessing
- [Data Contracts](/data-pipeline/data-contracts) -- schema contracts for ML pipelines

**Exercise:**
- Quantize BERT to INT8 and measure speedup vs accuracy
- Export a model to ONNX and benchmark inference speed

**Milestone:** You can optimize a model for production (2-4x speedup with minimal quality loss).

---

### Week 14: Deployment and MLOps

**Read:**
- [DL Checklist](/deep-learning/dl-checklist) (revisit deployment sections)
- [Model Serving](/infrastructure/ai-infrastructure/model-serving) -- TorchServe, Triton, FastAPI
- [GPU Kubernetes](/infrastructure/ai-infrastructure/gpu-kubernetes) -- GPU scheduling
- [ML Pipelines](/ai-ml-engineering/ml-pipelines) -- end-to-end ML pipeline design
- [AI Testing](/ai-ml-engineering/ai-testing) -- testing ML systems

**EDA cross-reference:**
- [Data Drift](/eda/data-drift) -- detecting distribution shifts in production
- [Data Quality Validation](/eda/data-quality-validation) -- automated quality checks

**Data pipeline cross-reference:**
- [Pipeline Monitoring](/data-pipeline/pipeline-monitoring) -- monitoring data pipelines
- [Great Expectations](/data-pipeline/great-expectations) -- data validation framework

**Exercise:**
- Wrap a model in FastAPI, containerize with Docker, deploy
- Set up model versioning with MLflow

**Milestone:** You can deploy a model as an API endpoint with monitoring.

---

### Week 15: Capstone Project

Choose one end-to-end project:

**Option A: Image Classification Pipeline**
1. Collect custom dataset
2. Train CNN or ViT with full training recipe
3. Optimize (quantize + prune)
4. Deploy as web API with monitoring

**Option B: NLP Pipeline**
1. Fine-tune BERT for real-world classification
2. Build semantic search with sentence-transformers
3. Quantize for production
4. Deploy with FastAPI + monitoring

**Option C: Generative AI**
1. Fine-tune LLM with LoRA
2. Add safety filters
3. Deploy as chat API
4. Evaluate with human preferences

---

### Week 16: Portfolio and Interview Prep

**Read:**
- [Papers Reading List](/deep-learning/papers-reading-list) -- review 30 must-read papers
- [Architecture Selection Guide](/deep-learning/architecture-selection-guide) -- justify architecture choices
- [Algorithm Selection Guide](/machine-learning/algorithm-selection-guide) -- classical ML decisions
- [ML Checklist](/machine-learning/ml-checklist) -- production ML checklist
- [ML Interpretability](/machine-learning/ml-interpretability) -- explaining model decisions

**Activities:**
- Write up capstone project
- Create portfolio with 3-5 projects
- Practice explaining projects in 2 minutes

---

## What You Will Be Able to Do After This Path

- Implement any neural network architecture from scratch in PyTorch
- Train and fine-tune models for vision, NLP, and multimodal tasks
- Apply model optimization (quantization, pruning, distillation) for production
- Deploy models with monitoring, versioning, and automated retraining
- Read and implement research papers
- Build end-to-end ML pipelines from data to deployment

## Cross-References to Related Paths

- **[AI/ML Engineer Path](/learning-paths/ai-ml-engineer)** -- LLM integration, LangChain, RAG, agents
- **[Data Scientist Path](/learning-paths/data-scientist)** -- Math foundations, EDA (69 pages), statistics
- **[Data Engineer Path](/learning-paths/data-engineer)** -- Data pipelines (25 pages), orchestration, quality
- **[Backend Engineer Path](/learning-paths/backend-engineer)** -- APIs and infrastructure for ML systems
- **All Deep Learning pages:** [Deep Learning Overview](/deep-learning/) -- index of all 25 topics
- **All Machine Learning pages:** [Machine Learning Overview](/machine-learning/) -- index of all 30 topics
- **All EDA pages:** [EDA Overview](/eda/) -- index of all 69 topics
- **All Data Pipeline pages:** [Data Pipeline Overview](/data-pipeline/) -- index of all 25 topics
