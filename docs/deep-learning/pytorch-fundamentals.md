---
title: "PyTorch Fundamentals"
description: "Tensors, autograd, nn.Module, Dataset and DataLoader, training loops, GPU acceleration, model saving and loading, debugging techniques, and an end-to-end CIFAR-10 classifier."
tags: [pytorch, tensors, autograd, training-loop, deep-learning]
difficulty: intermediate
prerequisites: [deep-learning/neural-network-basics]
lastReviewed: "2026-03-25"
---

# PyTorch Fundamentals

PyTorch is the dominant deep learning framework in both research and production. This page covers everything you need to write, train, debug, and deploy models in PyTorch: tensors, automatic differentiation, the `nn.Module` API, data loading, GPU training, model serialization, and a complete CIFAR-10 classifier.

## Tensors

Tensors are multi-dimensional arrays, the fundamental data structure in PyTorch. They are conceptually identical to NumPy arrays but can run on GPUs and track gradients.

### Creating Tensors

```python
import torch

# From Python lists
a = torch.tensor([1, 2, 3])
b = torch.tensor([[1.0, 2.0], [3.0, 4.0]])

# Zeros, ones, random
zeros = torch.zeros(3, 4)          # Shape (3, 4)
ones = torch.ones(2, 3, dtype=torch.float32)
rand = torch.randn(2, 3)          # Standard normal
uniform = torch.rand(2, 3)        # Uniform [0, 1)

# Like another tensor (same shape, dtype, device)
x = torch.randn(3, 4)
y = torch.zeros_like(x)

# From NumPy (shared memory --- changes to one affect the other)
import numpy as np
np_arr = np.array([1.0, 2.0, 3.0])
t = torch.from_numpy(np_arr)
back_to_numpy = t.numpy()

# Ranges
seq = torch.arange(0, 10, 2)       # tensor([0, 2, 4, 6, 8])
lin = torch.linspace(0, 1, 5)      # tensor([0.00, 0.25, 0.50, 0.75, 1.00])
```

### Tensor Properties

```python
x = torch.randn(3, 4, 5)
print(x.shape)      # torch.Size([3, 4, 5])
print(x.dtype)      # torch.float32
print(x.device)     # cpu
print(x.ndim)       # 3
print(x.numel())    # 60 (total elements)
print(x.is_cuda)    # False
```

### Tensor Operations

```python
a = torch.randn(3, 4)
b = torch.randn(3, 4)

# Element-wise
c = a + b              # or torch.add(a, b)
d = a * b              # element-wise multiply
e = a ** 2             # element-wise square

# Matrix multiply
x = torch.randn(3, 4)
y = torch.randn(4, 5)
z = x @ y              # or torch.matmul(x, y) --- shape (3, 5)

# Batched matrix multiply
batch_a = torch.randn(32, 3, 4)
batch_b = torch.randn(32, 4, 5)
batch_c = torch.bmm(batch_a, batch_b)  # shape (32, 3, 5)

# Reduction
total = a.sum()
col_mean = a.mean(dim=0)    # Mean across rows
row_max = a.max(dim=1)      # Max across columns (returns values and indices)

# Reshaping
flat = a.view(-1)            # Flatten to 1D (12 elements)
reshaped = a.view(4, 3)     # Reshape (must have same total elements)
reshaped2 = a.reshape(2, 6) # Same but works with non-contiguous tensors
transposed = a.T             # Transpose
permuted = a.permute(1, 0)  # General dimension permutation

# Concatenation and stacking
cat = torch.cat([a, a], dim=0)    # Shape (6, 4) --- concat along dim 0
stacked = torch.stack([a, a])     # Shape (2, 3, 4) --- new dimension
```

### Broadcasting

PyTorch follows NumPy broadcasting rules. Tensors with different shapes can operate together if they are compatible:

```python
# (3, 4) + (4,) -> (3, 4) --- row vector broadcast
a = torch.randn(3, 4)
b = torch.randn(4)
c = a + b  # b is broadcast across rows

# (3, 1) + (1, 4) -> (3, 4)
d = torch.randn(3, 1)
e = torch.randn(1, 4)
f = d + e  # Both broadcast
```

### In-Place Operations

Operations ending in `_` modify the tensor in place:

```python
x = torch.randn(3, 4)
x.add_(1)       # x = x + 1 (in-place)
x.zero_()       # Fill with zeros
x.fill_(42)     # Fill with 42
```

::: warning In-Place and Autograd
In-place operations can break gradient computation. Avoid them on tensors that require gradients. PyTorch will raise a `RuntimeError` if an in-place operation invalidates a needed gradient.
:::

## Autograd: Automatic Differentiation

Autograd is PyTorch's automatic differentiation engine. It records operations on tensors into a dynamic computation graph and computes gradients automatically.

### How It Works

```python
# Create a tensor that tracks gradients
x = torch.tensor([2.0, 3.0], requires_grad=True)

# Operations build the computation graph
y = x ** 2 + 3 * x + 1
z = y.sum()

# Backward pass computes gradients
z.backward()

# Gradients are stored in .grad
print(x.grad)  # tensor([7., 9.]) --- dy/dx = 2x + 3, evaluated at x=[2,3]
```

### Gradient Computation Details

When you call `z.backward()`, PyTorch:

1. Traverses the computation graph from `z` back to all leaf tensors with `requires_grad=True`
2. Applies the chain rule at each node
3. Accumulates gradients in each leaf tensor's `.grad` attribute

::: danger Gradients Accumulate
PyTorch accumulates gradients by default. You must call `optimizer.zero_grad()` (or `x.grad.zero_()`) before each backward pass, or gradients from previous iterations will be added to current gradients.
:::

```python
x = torch.tensor([1.0], requires_grad=True)

# First backward
y = x * 2
y.backward()
print(x.grad)  # tensor([2.])

# Second backward WITHOUT zeroing: gradients accumulate!
y = x * 3
y.backward()
print(x.grad)  # tensor([5.])  --- 2 + 3, NOT 3!

# Correct approach: zero gradients first
x.grad.zero_()
y = x * 3
y.backward()
print(x.grad)  # tensor([3.])
```

### Detaching and No-Grad Context

```python
# Stop tracking gradients for a tensor
x = torch.randn(3, requires_grad=True)
y = x.detach()           # y shares data but has no grad_fn
z = x.clone().detach()   # z is independent copy

# No-grad context: disable gradient tracking (for inference)
with torch.no_grad():
    y = model(x)  # No computation graph built --- faster, less memory

# Equivalent decorator
@torch.no_grad()
def inference(model, x):
    return model(x)
```

## nn.Module: Building Models

All PyTorch models inherit from `nn.Module`. It provides parameter management, GPU transfer, serialization, and a clean forward-pass API.

### Basic Module

```python
import torch.nn as nn

class SimpleNet(nn.Module):
    def __init__(self, input_dim, hidden_dim, output_dim):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_dim, output_dim)

    def forward(self, x):
        x = self.fc1(x)
        x = self.relu(x)
        x = self.fc2(x)
        return x

model = SimpleNet(784, 128, 10)
print(model)
# SimpleNet(
#   (fc1): Linear(in_features=784, out_features=128, bias=True)
#   (relu): ReLU()
#   (fc2): Linear(in_features=128, out_features=10, bias=True)
# )
```

### Using nn.Sequential

For simple feed-forward networks:

```python
model = nn.Sequential(
    nn.Linear(784, 256),
    nn.ReLU(),
    nn.Dropout(0.2),
    nn.Linear(256, 128),
    nn.ReLU(),
    nn.Dropout(0.2),
    nn.Linear(128, 10),
)
```

### Parameter Inspection

```python
# List all parameters
for name, param in model.named_parameters():
    print(f"{name}: {param.shape}")

# Total parameter count
total = sum(p.numel() for p in model.parameters())
trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"Total: {total:,}, Trainable: {trainable:,}")
```

### Common Layers

| Layer | Purpose | Example |
|-------|---------|---------|
| `nn.Linear(in, out)` | Fully connected | Classification head |
| `nn.Conv2d(in_ch, out_ch, k)` | 2D convolution | Image feature extraction |
| `nn.LSTM(in, hidden)` | LSTM cell | Sequence modeling |
| `nn.Embedding(vocab, dim)` | Embedding lookup | Word vectors |
| `nn.BatchNorm1d(features)` | Batch normalization | Stabilize training |
| `nn.Dropout(p)` | Dropout regularization | Prevent overfitting |
| `nn.LayerNorm(shape)` | Layer normalization | Transformer layers |

## Dataset and DataLoader

PyTorch separates data storage (`Dataset`) from data loading (`DataLoader`).

### Custom Dataset

```python
from torch.utils.data import Dataset, DataLoader

class CustomDataset(Dataset):
    def __init__(self, X, y, transform=None):
        self.X = torch.FloatTensor(X)
        self.y = torch.LongTensor(y)
        self.transform = transform

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        x = self.X[idx]
        if self.transform:
            x = self.transform(x)
        return x, self.y[idx]
```

### DataLoader

```python
dataset = CustomDataset(X_train, y_train)

train_loader = DataLoader(
    dataset,
    batch_size=64,
    shuffle=True,          # Shuffle each epoch
    num_workers=4,         # Parallel data loading
    pin_memory=True,       # Faster GPU transfer
    drop_last=True,        # Drop incomplete last batch
)

for batch_x, batch_y in train_loader:
    # batch_x shape: (64, features)
    # batch_y shape: (64,)
    pass
```

### Using torchvision Datasets

```python
import torchvision
import torchvision.transforms as T

transform = T.Compose([
    T.RandomHorizontalFlip(),
    T.RandomCrop(32, padding=4),
    T.ToTensor(),
    T.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
])

train_dataset = torchvision.datasets.CIFAR10(
    root='./data', train=True, download=True, transform=transform
)
test_dataset = torchvision.datasets.CIFAR10(
    root='./data', train=False, download=True,
    transform=T.Compose([
        T.ToTensor(),
        T.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
    ])
)
```

## The Training Loop

The core training loop in PyTorch always follows the same pattern:

```python
import torch
import torch.nn as nn
import torch.optim as optim

# Setup
model = SimpleNet(784, 128, 10)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=1e-3)

# Training loop
model.train()
for epoch in range(num_epochs):
    running_loss = 0.0
    correct = 0
    total = 0

    for batch_x, batch_y in train_loader:
        # 1. Zero gradients
        optimizer.zero_grad()

        # 2. Forward pass
        outputs = model(batch_x)

        # 3. Compute loss
        loss = criterion(outputs, batch_y)

        # 4. Backward pass
        loss.backward()

        # 5. Update weights
        optimizer.step()

        # Track metrics
        running_loss += loss.item()
        _, predicted = outputs.max(1)
        total += batch_y.size(0)
        correct += predicted.eq(batch_y).sum().item()

    train_acc = 100.0 * correct / total
    avg_loss = running_loss / len(train_loader)
    print(f"Epoch {epoch + 1}: Loss={avg_loss:.4f}, Acc={train_acc:.2f}%")
```

### Validation Loop

```python
model.eval()  # Disable dropout, use running stats for BatchNorm
with torch.no_grad():  # No gradient computation
    val_loss = 0.0
    correct = 0
    total = 0

    for batch_x, batch_y in val_loader:
        outputs = model(batch_x)
        loss = criterion(outputs, batch_y)

        val_loss += loss.item()
        _, predicted = outputs.max(1)
        total += batch_y.size(0)
        correct += predicted.eq(batch_y).sum().item()

    val_acc = 100.0 * correct / total
    print(f"Validation: Loss={val_loss / len(val_loader):.4f}, Acc={val_acc:.2f}%")
```

::: warning train() vs eval()
Always call `model.train()` before training and `model.eval()` before validation/inference. These modes affect Dropout (disabled in eval) and BatchNorm (uses running statistics in eval). Forgetting this is one of the most common PyTorch bugs.
:::

## GPU Training

### Device Management

```python
# Best practice: define device once
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")

# Move model and data to device
model = model.to(device)

for batch_x, batch_y in train_loader:
    batch_x = batch_x.to(device)
    batch_y = batch_y.to(device)
    outputs = model(batch_x)
    # ...
```

### Multi-GPU with DataParallel

```python
if torch.cuda.device_count() > 1:
    print(f"Using {torch.cuda.device_count()} GPUs")
    model = nn.DataParallel(model)
model = model.to(device)
```

### DistributedDataParallel (DDP)

For serious multi-GPU training, DDP is faster than DataParallel:

```python
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP

def setup(rank, world_size):
    dist.init_process_group("nccl", rank=rank, world_size=world_size)

def train(rank, world_size):
    setup(rank, world_size)
    model = SimpleNet(784, 128, 10).to(rank)
    ddp_model = DDP(model, device_ids=[rank])

    # Training loop uses ddp_model instead of model
    # Each process handles a slice of the data
```

## Saving and Loading Models

### Save/Load State Dict (Recommended)

```python
# Save
torch.save(model.state_dict(), 'model_weights.pth')

# Load
model = SimpleNet(784, 128, 10)
model.load_state_dict(torch.load('model_weights.pth', weights_only=True))
model.eval()
```

### Save Full Checkpoint (for resuming training)

```python
# Save checkpoint
checkpoint = {
    'epoch': epoch,
    'model_state_dict': model.state_dict(),
    'optimizer_state_dict': optimizer.state_dict(),
    'loss': loss,
    'best_acc': best_acc,
}
torch.save(checkpoint, 'checkpoint.pth')

# Load checkpoint
checkpoint = torch.load('checkpoint.pth', weights_only=False)
model.load_state_dict(checkpoint['model_state_dict'])
optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
start_epoch = checkpoint['epoch']
best_acc = checkpoint['best_acc']
```

### Export for Production

```python
# TorchScript (trace-based)
model.eval()
example_input = torch.randn(1, 784)
traced = torch.jit.trace(model, example_input)
traced.save('model_traced.pt')

# ONNX export
torch.onnx.export(
    model, example_input, 'model.onnx',
    input_names=['input'], output_names=['output'],
    dynamic_axes={&#8203;{'input': {0: 'batch'}, 'output': {0: 'batch'}}&#8203;}
)
```

## Debugging Techniques

### Shape Debugging

```python
class DebugNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 256)
        self.fc2 = nn.Linear(256, 10)

    def forward(self, x):
        print(f"Input: {x.shape}")
        x = self.fc1(x)
        print(f"After fc1: {x.shape}")
        x = torch.relu(x)
        x = self.fc2(x)
        print(f"After fc2: {x.shape}")
        return x
```

### Gradient Checking

```python
# Check for vanishing/exploding gradients
for name, param in model.named_parameters():
    if param.grad is not None:
        grad_norm = param.grad.norm()
        print(f"{name}: grad_norm={grad_norm:.6f}")
        if grad_norm < 1e-7:
            print(f"  WARNING: vanishing gradient!")
        if grad_norm > 1000:
            print(f"  WARNING: exploding gradient!")
```

### Anomaly Detection

```python
# Enable anomaly detection (slower but catches NaN sources)
with torch.autograd.detect_anomaly():
    output = model(input)
    loss = criterion(output, target)
    loss.backward()  # Will print traceback if NaN detected
```

### Common Debugging Checklist

| Issue | Symptom | Fix |
|-------|---------|-----|
| Forgot `zero_grad()` | Loss doesn't decrease properly | Add `optimizer.zero_grad()` |
| Wrong `train()/eval()` mode | Validation accuracy fluctuates | Call `model.eval()` before validation |
| Data not on GPU | RuntimeError about device mismatch | Move both model AND data to device |
| Learning rate too high | Loss is NaN or inf | Reduce LR by 10x |
| Mismatched dimensions | RuntimeError about shapes | Print shapes at each layer |
| Label dtype wrong | CrossEntropy expects Long | Use `labels.long()` |

## Complete Example: CIFAR-10 Classifier

```python
import torch
import torch.nn as nn
import torch.optim as optim
import torchvision
import torchvision.transforms as T
from torch.utils.data import DataLoader

# ── Hyperparameters ──────────────────────────────────────────────────
BATCH_SIZE = 128
EPOCHS = 30
LR = 1e-3
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ── Data ─────────────────────────────────────────────────────────────
train_transform = T.Compose([
    T.RandomHorizontalFlip(),
    T.RandomCrop(32, padding=4),
    T.ToTensor(),
    T.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
])
test_transform = T.Compose([
    T.ToTensor(),
    T.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
])

train_set = torchvision.datasets.CIFAR10(
    './data', train=True, download=True, transform=train_transform
)
test_set = torchvision.datasets.CIFAR10(
    './data', train=False, download=True, transform=test_transform
)

train_loader = DataLoader(train_set, BATCH_SIZE, shuffle=True, num_workers=2)
test_loader = DataLoader(test_set, BATCH_SIZE, shuffle=False, num_workers=2)

CLASSES = ('plane', 'car', 'bird', 'cat', 'deer',
           'dog', 'frog', 'horse', 'ship', 'truck')

# ── Model ────────────────────────────────────────────────────────────
class CIFAR10Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            nn.Dropout2d(0.25),

            nn.Conv2d(64, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            nn.Dropout2d(0.25),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 8 * 8, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.5),
            nn.Linear(512, 10),
        )

    def forward(self, x):
        x = self.features(x)
        x = self.classifier(x)
        return x

model = CIFAR10Net().to(DEVICE)
criterion = nn.CrossEntropyLoss()
optimizer = optim.AdamW(model.parameters(), lr=LR, weight_decay=1e-4)
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

# ── Training ─────────────────────────────────────────────────────────
best_acc = 0.0

for epoch in range(EPOCHS):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for inputs, targets in train_loader:
        inputs, targets = inputs.to(DEVICE), targets.to(DEVICE)

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()

        running_loss += loss.item()
        _, predicted = outputs.max(1)
        total += targets.size(0)
        correct += predicted.eq(targets).sum().item()

    scheduler.step()
    train_acc = 100.0 * correct / total

    # Validation
    model.eval()
    test_correct = 0
    test_total = 0
    with torch.no_grad():
        for inputs, targets in test_loader:
            inputs, targets = inputs.to(DEVICE), targets.to(DEVICE)
            outputs = model(inputs)
            _, predicted = outputs.max(1)
            test_total += targets.size(0)
            test_correct += predicted.eq(targets).sum().item()

    test_acc = 100.0 * test_correct / test_total

    if test_acc > best_acc:
        best_acc = test_acc
        torch.save(model.state_dict(), 'best_cifar10.pth')

    print(
        f"Epoch {epoch + 1:2d}/{EPOCHS} | "
        f"LR: {scheduler.get_last_lr()[0]:.6f} | "
        f"Train Acc: {train_acc:.2f}% | "
        f"Test Acc: {test_acc:.2f}%"
    )

print(f"\nBest Test Accuracy: {best_acc:.2f}%")
# Expected: ~91-93% after 30 epochs
```

## Cross-References

- **Math behind it:** [Neural Network Basics](/deep-learning/neural-network-basics) --- manual backprop derivation
- **Training recipes:** [Training Techniques](/deep-learning/training-techniques) --- BatchNorm, dropout, LR scheduling in depth
- **First real architecture:** [CNN](/deep-learning/cnn) --- convolutional networks for images
- **NLP models:** [Transformers](/deep-learning/transformers) --- the architecture behind LLMs
- **Optimization for deployment:** [Model Optimization](/deep-learning/model-optimization) --- quantization, pruning, ONNX
