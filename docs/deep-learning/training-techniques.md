---
title: "Training Techniques"
description: "Batch normalization, dropout, weight initialization (Xavier and He), learning rate scheduling, gradient clipping, mixed precision training, early stopping, and data augmentation strategies."
tags: [training, batch-normalization, dropout, learning-rate, regularization]
difficulty: intermediate
prerequisites: [deep-learning/pytorch-fundamentals]
lastReviewed: "2026-03-25"
---

# Training Techniques

Getting a neural network to train well is as much art as science. The difference between a model that converges to 70% accuracy and one that reaches 95% often comes down to training techniques, not architecture. This page covers the essential toolkit: batch normalization, dropout, weight initialization, learning rate scheduling, gradient clipping, mixed precision, early stopping, and data augmentation.

## Batch Normalization

Batch normalization (Ioffe and Szegedy, 2015) normalizes the inputs to each layer, stabilizing training and enabling higher learning rates.

### The Math

For a mini-batch $\mathcal{B} = \{x_1, \ldots, x_m\}$:

**Step 1 --- Mini-batch mean:**

$$
\mu_\mathcal{B} = \frac{1}{m} \sum_{i=1}^{m} x_i
$$

**Step 2 --- Mini-batch variance:**

$$
\sigma_\mathcal{B}^2 = \frac{1}{m} \sum_{i=1}^{m} (x_i - \mu_\mathcal{B})^2
$$

**Step 3 --- Normalize:**

$$
\hat{x}_i = \frac{x_i - \mu_\mathcal{B}}{\sqrt{\sigma_\mathcal{B}^2 + \epsilon}}
$$

**Step 4 --- Scale and shift (learnable):**

$$
y_i = \gamma \hat{x}_i + \beta
$$

where $\gamma$ (scale) and $\beta$ (shift) are learnable parameters. The $\epsilon$ (typically $10^{-5}$) prevents division by zero.

::: details Worked Example — Batch Normalization Calculation

**Input:** Mini-batch of $m = 4$ values from one feature/channel: $\mathcal{B} = \{1.0, 3.0, 5.0, 7.0\}$

Learnable parameters: $\gamma = 1.2$, $\beta = 0.5$, $\epsilon = 10^{-5}$

**Step 1 --- Mean:**
$$\mu_\mathcal{B} = \frac{1 + 3 + 5 + 7}{4} = 4.0$$

**Step 2 --- Variance:**
$$\sigma_\mathcal{B}^2 = \frac{(1-4)^2 + (3-4)^2 + (5-4)^2 + (7-4)^2}{4} = \frac{9+1+1+9}{4} = 5.0$$

**Step 3 --- Normalize:**
| $x_i$ | $\hat{x}_i = \frac{x_i - 4}{\sqrt{5 + 10^{-5}}}$ |
|---|---|
| 1.0 | $-3 / 2.236 = -1.342$ |
| 3.0 | $-1 / 2.236 = -0.447$ |
| 5.0 | $1 / 2.236 = 0.447$ |
| 7.0 | $3 / 2.236 = 1.342$ |

**Step 4 --- Scale and shift:**
| $\hat{x}_i$ | $y_i = 1.2 \cdot \hat{x}_i + 0.5$ |
|---|---|
| -1.342 | $-1.110$ |
| -0.447 | $-0.037$ |
| 0.447 | $1.037$ |
| 1.342 | $2.110$ |

**Result:** The raw values $[1, 3, 5, 7]$ are normalized to zero mean and unit variance, then re-scaled by learned $\gamma, \beta$. The network can learn to undo BatchNorm ($\gamma = \sigma, \beta = \mu$) if needed, but the gradient landscape is smoother.

:::

### Why It Works

1. **Reduces internal covariate shift:** Each layer receives inputs with stable statistics, so it doesn't need to constantly readjust to shifting distributions.
2. **Allows higher learning rates:** Normalized inputs mean gradients are better behaved.
3. **Acts as regularization:** The noise from mini-batch statistics acts like a mild regularizer.
4. **Smooths the loss landscape:** Recent research shows BatchNorm makes the optimization landscape smoother (Santurkar et al., 2018).

### Training vs Inference

During training, BatchNorm uses the current mini-batch statistics ($\mu_\mathcal{B}, \sigma_\mathcal{B}^2$). During inference, it uses running averages accumulated during training:

$$
\mu_{\text{running}} = (1 - \alpha) \mu_{\text{running}} + \alpha \mu_\mathcal{B}
$$

$$
\sigma^2_{\text{running}} = (1 - \alpha) \sigma^2_{\text{running}} + \alpha \sigma^2_\mathcal{B}
$$

where $\alpha$ (momentum) is typically 0.1.

::: warning model.eval() Is Critical
If you forget to call `model.eval()` before inference, BatchNorm will use batch statistics instead of running statistics, causing inconsistent results --- especially with batch size 1.
:::

### PyTorch Implementation

```python
import torch.nn as nn

# For fully connected layers
bn1d = nn.BatchNorm1d(num_features=256)

# For convolutional layers (normalizes per channel)
bn2d = nn.BatchNorm2d(num_features=64)

# In a model
class ResBlock(nn.Module):
    def __init__(self, channels):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        residual = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += residual
        out = self.relu(out)
        return out
```

### Layer Normalization vs Batch Normalization

| Feature | BatchNorm | LayerNorm |
|---------|-----------|-----------|
| Normalizes across | Batch dimension | Feature dimension |
| Depends on batch size | Yes | No |
| Works with small batches | Poorly | Well |
| Used in | CNNs | Transformers, RNNs |
| Training/inference difference | Yes (running stats) | No |

LayerNorm formula (for a single sample):

$$
\hat{x}_i = \frac{x_i - \mu}{\sqrt{\sigma^2 + \epsilon}}, \quad \mu = \frac{1}{H} \sum_{i=1}^{H} x_i, \quad \sigma^2 = \frac{1}{H} \sum_{i=1}^{H} (x_i - \mu)^2
$$

where $H$ is the number of features.

## Dropout

Dropout (Srivastava et al., 2014) randomly sets neuron activations to zero during training. This prevents co-adaptation --- neurons cannot rely on specific other neurons being present.

### The Math

During training, each neuron's output is set to zero with probability $p$:

$$
h_i^{\text{dropped}} = \begin{cases} 0 & \text{with probability } p \\ \frac{h_i}{1 - p} & \text{with probability } 1 - p \end{cases}
$$

The $\frac{1}{1-p}$ scaling (inverted dropout) ensures the expected value is unchanged: $\mathbb{E}[h_i^{\text{dropped}}] = h_i$.

::: details Worked Example — Dropout with Inverted Scaling

**Input:** Hidden activations $h = [0.8, 1.2, 0.5, 2.0]$, dropout rate $p = 0.5$

**Step 1:** Generate random mask (sample: keep neurons 0, 2; drop neurons 1, 3)
$$\text{mask} = [1, 0, 1, 0]$$

**Step 2:** Apply mask and scale by $\frac{1}{1-p} = \frac{1}{0.5} = 2$
$$h^{\text{dropped}} = [0.8 \times 2, \; 0, \; 0.5 \times 2, \; 0] = [1.6, \; 0, \; 1.0, \; 0]$$

**Verify expected value:**
- $\mathbb{E}[h_0^{\text{dropped}}] = 0.5 \times \frac{0.8}{0.5} + 0.5 \times 0 = 0.8$ (equals original $h_0$)

**During inference:** No dropout, use raw $h = [0.8, 1.2, 0.5, 2.0]$ directly (no scaling needed because inverted dropout already compensated during training).

**Result:** The scaling factor of 2 ensures that the sum of activations at training time has the same expected value as at inference time, so the next layer receives consistent input magnitudes.

:::

During inference, dropout is disabled and all neurons are active (no scaling needed because of inverted dropout).

### Where to Place Dropout

```python
class ClassifierWithDropout(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Linear(784, 512),
            nn.ReLU(),
            nn.Dropout(0.5),       # After activation, before next layer
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Dropout(0.3),       # Can vary rates by layer
            nn.Linear(256, 10),    # No dropout before output layer
        )

    def forward(self, x):
        return self.features(x)
```

### Dropout Rates by Architecture

| Architecture | Typical Dropout Rate |
|-------------|---------------------|
| MLP hidden layers | 0.5 |
| CNN after conv blocks | 0.25 |
| CNN classifier head | 0.5 |
| Transformer attention | 0.1 |
| Transformer FFN | 0.1 |
| RNN (between layers) | 0.2--0.5 |

## Weight Initialization

Proper initialization prevents vanishing and exploding gradients at the start of training. The variance of activations should remain roughly constant across layers.

### Xavier/Glorot Initialization

For layers with sigmoid or tanh activations:

$$
W \sim \mathcal{U}\left(-\sqrt{\frac{6}{n_{in} + n_{out}}}, \sqrt{\frac{6}{n_{in} + n_{out}}}\right)
$$

or the normal variant:

$$
W \sim \mathcal{N}\left(0, \frac{2}{n_{in} + n_{out}}\right)
$$

**Derivation sketch:** For the variance of the output to equal the variance of the input, we need $\text{Var}(W) = \frac{2}{n_{in} + n_{out}}$, which accounts for both forward and backward passes.

### He/Kaiming Initialization

For layers with ReLU activations (He et al., 2015):

$$
W \sim \mathcal{N}\left(0, \frac{2}{n_{in}}\right)
$$

ReLU zeros out half the values, so the variance needs to be doubled compared to Xavier. This is the default for modern networks with ReLU.

### PyTorch Initialization

```python
def init_weights(m):
    if isinstance(m, nn.Linear):
        nn.init.kaiming_normal_(m.weight, mode='fan_in', nonlinearity='relu')
        if m.bias is not None:
            nn.init.zeros_(m.bias)
    elif isinstance(m, nn.Conv2d):
        nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
        if m.bias is not None:
            nn.init.zeros_(m.bias)
    elif isinstance(m, nn.BatchNorm2d):
        nn.init.ones_(m.weight)
        nn.init.zeros_(m.bias)

model.apply(init_weights)
```

### Initialization Summary

| Activation | Initialization | Variance |
|-----------|---------------|----------|
| Sigmoid/Tanh | Xavier (Glorot) | $\frac{2}{n_{in} + n_{out}}$ |
| ReLU | He (Kaiming) | $\frac{2}{n_{in}}$ |
| SELU | LeCun | $\frac{1}{n_{in}}$ |
| Any (output layer) | Xavier | $\frac{2}{n_{in} + n_{out}}$ |

## Learning Rate Scheduling

The learning rate is the most important hyperparameter. A fixed LR is rarely optimal --- scheduling the LR during training almost always improves results.

### Step Decay

$$
\eta_t = \eta_0 \cdot \gamma^{\lfloor t / s \rfloor}
$$

where $\gamma$ (e.g., 0.1) is the decay factor and $s$ is the step size in epochs.

::: details Worked Example — Step Decay Learning Rate

**Setup:** $\eta_0 = 0.01$, $\gamma = 0.1$, step size $s = 30$ epochs

| Epoch | $\lfloor t/s \rfloor$ | $\eta_t = 0.01 \times 0.1^{\lfloor t/30 \rfloor}$ |
|---|---|---|
| 1 | 0 | $0.01 \times 1 = 0.01$ |
| 29 | 0 | $0.01$ |
| 30 | 1 | $0.01 \times 0.1 = 0.001$ |
| 59 | 1 | $0.001$ |
| 60 | 2 | $0.01 \times 0.01 = 0.0001$ |

**Result:** The LR drops by 10x at epochs 30 and 60. This is the "multi-step" schedule commonly used in ResNet papers.

:::

### Cosine Annealing

$$
\eta_t = \eta_{min} + \frac{1}{2}(\eta_{max} - \eta_{min})\left(1 + \cos\left(\frac{t}{T}\pi\right)\right)
$$

Smoothly decays the learning rate from $\eta_{max}$ to $\eta_{min}$ over $T$ steps. No sharp drops. Used in most modern training recipes.

::: details Worked Example — Cosine Annealing Schedule

**Setup:** $\eta_{\max} = 0.01$, $\eta_{\min} = 0.0001$, $T = 100$ epochs

$$\eta_t = 0.0001 + \frac{1}{2}(0.01 - 0.0001)\left(1 + \cos\left(\frac{t}{100}\pi\right)\right)$$

| Epoch $t$ | $\cos(t\pi/100)$ | $\eta_t$ |
|---|---|---|
| 0 | $\cos(0) = 1.0$ | $0.0001 + 0.00495 \times 2.0 = 0.0100$ |
| 25 | $\cos(\pi/4) = 0.707$ | $0.0001 + 0.00495 \times 1.707 = 0.0086$ |
| 50 | $\cos(\pi/2) = 0$ | $0.0001 + 0.00495 \times 1.0 = 0.0051$ |
| 75 | $\cos(3\pi/4) = -0.707$ | $0.0001 + 0.00495 \times 0.293 = 0.0016$ |
| 100 | $\cos(\pi) = -1$ | $0.0001 + 0.00495 \times 0 = 0.0001$ |

**Result:** The LR starts at 0.01 and smoothly decays to 0.0001 following a cosine curve. Unlike step decay, there are no abrupt drops. Most of the decay happens in the second half --- at epoch 50, the LR is still 51% of initial.

:::

### Cosine Annealing with Warm Restarts

$$
\eta_t = \eta_{min} + \frac{1}{2}(\eta_{max} - \eta_{min})\left(1 + \cos\left(\frac{T_{cur}}{T_i}\pi\right)\right)
$$

Periodically resets the LR, allowing the optimizer to escape local minima.

### Warmup + Cosine Decay

Start with a small LR and linearly increase to the target LR over a warmup period, then cosine decay:

```python
import torch.optim as optim

optimizer = optim.AdamW(model.parameters(), lr=1e-3)

# Warmup for 5 epochs, then cosine decay for remaining epochs
warmup_epochs = 5
total_epochs = 100

def lr_lambda(epoch):
    if epoch < warmup_epochs:
        return epoch / warmup_epochs  # Linear warmup
    else:
        # Cosine decay
        progress = (epoch - warmup_epochs) / (total_epochs - warmup_epochs)
        return 0.5 * (1 + np.cos(np.pi * progress))

scheduler = optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
```

### One-Cycle Policy

```python
scheduler = optim.lr_scheduler.OneCycleLR(
    optimizer,
    max_lr=0.01,
    steps_per_epoch=len(train_loader),
    epochs=total_epochs,
    pct_start=0.3,       # 30% of training is warmup
    anneal_strategy='cos',
)

# Call scheduler.step() after each BATCH, not each epoch
for epoch in range(total_epochs):
    for batch in train_loader:
        # ... training step ...
        scheduler.step()
```

### LR Finder

Find the optimal learning rate by training with exponentially increasing LR and plotting loss:

```python
def lr_finder(model, train_loader, criterion, start_lr=1e-7, end_lr=1, num_steps=100):
    optimizer = optim.SGD(model.parameters(), lr=start_lr)
    lr_mult = (end_lr / start_lr) ** (1 / num_steps)

    lrs, losses = [], []
    best_loss = float('inf')

    for i, (inputs, targets) in enumerate(train_loader):
        if i >= num_steps:
            break

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()

        current_lr = start_lr * (lr_mult ** i)
        for pg in optimizer.param_groups:
            pg['lr'] = current_lr

        lrs.append(current_lr)
        losses.append(loss.item())

        if loss.item() > 4 * best_loss:
            break
        best_loss = min(best_loss, loss.item())

    # Plot and pick LR where loss decreases fastest
    import matplotlib.pyplot as plt
    plt.semilogx(lrs, losses)
    plt.xlabel('Learning Rate')
    plt.ylabel('Loss')
    plt.title('LR Finder')
    plt.show()
```

## Gradient Clipping

Prevents exploding gradients by capping the gradient norm. Essential for RNNs and helpful for any deep network.

### By Norm (Recommended)

$$
\text{if } \|g\| > \tau: \quad g \leftarrow \frac{\tau}{\|g\|} g
$$

```python
# Clip gradients to max norm of 1.0
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

# Usage in training loop:
loss.backward()
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
optimizer.step()
```

### By Value

Clips each gradient element independently:

```python
torch.nn.utils.clip_grad_value_(model.parameters(), clip_value=0.5)
```

### Monitoring Gradient Norms

```python
def get_grad_norm(model):
    total_norm = 0.0
    for p in model.parameters():
        if p.grad is not None:
            total_norm += p.grad.data.norm(2).item() ** 2
    return total_norm ** 0.5

# Log this during training to decide clipping threshold
grad_norm = get_grad_norm(model)
print(f"Gradient norm: {grad_norm:.4f}")
```

## Mixed Precision Training

Mixed precision uses float16 for most operations and float32 for numerically sensitive ones (loss computation, gradient accumulation). This doubles throughput and halves memory on modern GPUs.

### PyTorch AMP (Automatic Mixed Precision)

```python
from torch.amp import autocast, GradScaler

scaler = GradScaler('cuda')

for inputs, targets in train_loader:
    inputs, targets = inputs.to(device), targets.to(device)

    optimizer.zero_grad()

    # Forward pass in mixed precision
    with autocast('cuda'):
        outputs = model(inputs)
        loss = criterion(outputs, targets)

    # Backward pass with gradient scaling
    scaler.scale(loss).backward()
    scaler.step(optimizer)
    scaler.update()
```

### Why Gradient Scaling?

Float16 has a limited range ($6 \times 10^{-8}$ to $6.5 \times 10^4$). Small gradients can underflow to zero. The `GradScaler`:

1. Scales the loss by a large factor before `backward()` (prevents underflow)
2. Unscales gradients before `optimizer.step()`
3. Dynamically adjusts the scale factor (reduces it if overflow/NaN detected)

### Memory Savings

| Precision | Model Memory | Gradient Memory | Typical Speedup |
|-----------|-------------|-----------------|-----------------|
| FP32 | 4 bytes/param | 4 bytes/param | 1x |
| Mixed (AMP) | 2 bytes/param (mostly) | 4 bytes/param | 1.5--2x |
| BF16 | 2 bytes/param | 2 bytes/param | 1.5--2x |

## Early Stopping

Stop training when validation loss stops improving to prevent overfitting.

```python
class EarlyStopping:
    def __init__(self, patience=10, min_delta=0.001):
        self.patience = patience
        self.min_delta = min_delta
        self.counter = 0
        self.best_loss = None
        self.should_stop = False

    def __call__(self, val_loss):
        if self.best_loss is None:
            self.best_loss = val_loss
        elif val_loss > self.best_loss - self.min_delta:
            self.counter += 1
            if self.counter >= self.patience:
                self.should_stop = True
        else:
            self.best_loss = val_loss
            self.counter = 0

# Usage
early_stop = EarlyStopping(patience=10)

for epoch in range(max_epochs):
    train_one_epoch(model, train_loader)
    val_loss = evaluate(model, val_loader)

    early_stop(val_loss)
    if early_stop.should_stop:
        print(f"Early stopping at epoch {epoch}")
        break
```

## Data Augmentation

Data augmentation artificially increases the training set by applying random transformations. It is the cheapest and most effective regularizer.

### Image Augmentation

```python
import torchvision.transforms as T

train_transform = T.Compose([
    T.RandomResizedCrop(224, scale=(0.8, 1.0)),
    T.RandomHorizontalFlip(p=0.5),
    T.RandomRotation(15),
    T.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),
    T.RandomAffine(degrees=0, translate=(0.1, 0.1)),
    T.RandomErasing(p=0.2),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])
```

### Advanced Augmentation: Mixup

Mixup creates virtual training examples by linearly interpolating pairs:

$$
\tilde{x} = \lambda x_i + (1 - \lambda) x_j
$$

$$
\tilde{y} = \lambda y_i + (1 - \lambda) y_j
$$

where $\lambda \sim \text{Beta}(\alpha, \alpha)$ with $\alpha = 0.2$.

```python
def mixup_data(x, y, alpha=0.2):
    lam = np.random.beta(alpha, alpha)
    batch_size = x.size(0)
    index = torch.randperm(batch_size, device=x.device)
    mixed_x = lam * x + (1 - lam) * x[index]
    y_a, y_b = y, y[index]
    return mixed_x, y_a, y_b, lam

def mixup_criterion(criterion, pred, y_a, y_b, lam):
    return lam * criterion(pred, y_a) + (1 - lam) * criterion(pred, y_b)
```

### Advanced Augmentation: CutMix

CutMix replaces a random rectangular region with a patch from another image:

```python
def cutmix_data(x, y, alpha=1.0):
    lam = np.random.beta(alpha, alpha)
    batch_size = x.size(0)
    index = torch.randperm(batch_size, device=x.device)

    # Generate random bounding box
    W, H = x.size(2), x.size(3)
    cut_ratio = np.sqrt(1 - lam)
    cut_w = int(W * cut_ratio)
    cut_h = int(H * cut_ratio)

    cx = np.random.randint(W)
    cy = np.random.randint(H)
    x1 = np.clip(cx - cut_w // 2, 0, W)
    y1 = np.clip(cy - cut_h // 2, 0, H)
    x2 = np.clip(cx + cut_w // 2, 0, W)
    y2 = np.clip(cy + cut_h // 2, 0, H)

    x[:, :, x1:x2, y1:y2] = x[index, :, x1:x2, y1:y2]
    lam = 1 - (x2 - x1) * (y2 - y1) / (W * H)  # Adjust lambda

    return x, y, y[index], lam
```

### Text Augmentation

```python
# Common text augmentation techniques
import random

def synonym_replacement(words, n=1):
    """Replace n random words with synonyms (using WordNet)."""
    # Implementation depends on nltk/wordnet
    pass

def random_insertion(words, n=1):
    """Insert n random synonyms at random positions."""
    pass

def random_deletion(words, p=0.1):
    """Delete each word with probability p."""
    return [w for w in words if random.random() > p]

def back_translation(text, src='en', pivot='de'):
    """Translate to another language and back."""
    pass
```

## Putting It All Together: Training Recipe

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.amp import autocast, GradScaler

def train_model(model, train_loader, val_loader, config):
    device = config['device']
    model = model.to(device)

    # Weight init
    model.apply(init_weights)

    # Optimizer
    optimizer = optim.AdamW(
        model.parameters(),
        lr=config['lr'],
        weight_decay=config['weight_decay'],
    )

    # Scheduler
    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=config['epochs']
    )

    # Mixed precision
    scaler = GradScaler('cuda')

    # Early stopping
    early_stop = EarlyStopping(patience=config['patience'])

    criterion = nn.CrossEntropyLoss()
    best_acc = 0.0

    for epoch in range(config['epochs']):
        # ── Train ────────────────────────────────────────────────
        model.train()
        for inputs, targets in train_loader:
            inputs, targets = inputs.to(device), targets.to(device)

            # Mixup
            if config.get('mixup', False):
                inputs, targets_a, targets_b, lam = mixup_data(inputs, targets)

            optimizer.zero_grad()
            with autocast('cuda'):
                outputs = model(inputs)
                if config.get('mixup', False):
                    loss = mixup_criterion(criterion, outputs, targets_a, targets_b, lam)
                else:
                    loss = criterion(outputs, targets)

            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()

        scheduler.step()

        # ── Validate ─────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        correct = 0
        total = 0
        with torch.no_grad():
            for inputs, targets in val_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                outputs = model(inputs)
                val_loss += criterion(outputs, targets).item()
                _, predicted = outputs.max(1)
                total += targets.size(0)
                correct += predicted.eq(targets).sum().item()

        val_acc = 100.0 * correct / total
        avg_val_loss = val_loss / len(val_loader)

        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(model.state_dict(), 'best_model.pth')

        early_stop(avg_val_loss)
        if early_stop.should_stop:
            print(f"Early stopping at epoch {epoch + 1}")
            break

    return best_acc
```

## Cross-References

- **Foundations:** [Neural Network Basics](/deep-learning/neural-network-basics) --- activations, backprop, optimizers
- **PyTorch API:** [PyTorch Fundamentals](/deep-learning/pytorch-fundamentals) --- tensors, modules, training loop
- **Apply to vision:** [CNN](/deep-learning/cnn) and [Image Classification](/deep-learning/image-classification)
- **Apply to NLP:** [Transformers](/deep-learning/transformers) --- LayerNorm, dropout in attention
- **Deployment:** [Model Optimization](/deep-learning/model-optimization) --- quantization, pruning, distillation
- **Checklist:** [DL Checklist](/deep-learning/dl-checklist) --- 40-item project checklist
