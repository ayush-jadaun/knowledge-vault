---
title: "Image Classification"
description: "Advanced augmentation (Mixup, CutMix), transfer learning with freeze/unfreeze strategies, Vision Transformer patch embedding, ConvNeXt, and CIFAR-10 plus Cats vs Dogs CNN vs ViT comparison."
tags: [image-classification, vit, transfer-learning, augmentation, computer-vision]
difficulty: intermediate
prerequisites: [deep-learning/cnn]
lastReviewed: "2026-03-25"
---

# Image Classification

Image classification is the most fundamental computer vision task --- given an image, assign it a label. This page covers advanced augmentation techniques (Mixup, CutMix, RandAugment), transfer learning strategies, the Vision Transformer (ViT), ConvNeXt, and a head-to-head comparison of CNN vs ViT on CIFAR-10 and Cats vs Dogs.

## Advanced Augmentation

### Standard Augmentation Pipeline

```python
import torchvision.transforms as T

standard_transform = T.Compose([
    T.RandomResizedCrop(224, scale=(0.8, 1.0)),
    T.RandomHorizontalFlip(p=0.5),
    T.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),
    T.RandomRotation(15),
    T.ToTensor(),
    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    T.RandomErasing(p=0.2),
])
```

### Mixup

Linearly interpolate both images and labels:

$$
\tilde{x} = \lambda x_i + (1 - \lambda) x_j, \quad \lambda \sim \text{Beta}(\alpha, \alpha)
$$

$$
\tilde{y} = \lambda y_i + (1 - \lambda) y_j
$$

```python
import numpy as np
import torch

def mixup(images, labels, alpha=0.2):
    lam = np.random.beta(alpha, alpha)
    batch_size = images.size(0)
    index = torch.randperm(batch_size, device=images.device)

    mixed_images = lam * images + (1 - lam) * images[index]
    labels_a, labels_b = labels, labels[index]
    return mixed_images, labels_a, labels_b, lam

def mixup_loss(criterion, pred, labels_a, labels_b, lam):
    return lam * criterion(pred, labels_a) + (1 - lam) * criterion(pred, labels_b)
```

### CutMix

Replace a rectangular patch from one image with another:

$$
\tilde{x} = M \odot x_i + (1 - M) \odot x_j
$$

where $M$ is a binary mask. The label is mixed proportionally to the area:

$$
\tilde{y} = \lambda y_i + (1 - \lambda) y_j, \quad \lambda = 1 - \frac{r_w r_h}{W H}
$$

```python
def cutmix(images, labels, alpha=1.0):
    lam = np.random.beta(alpha, alpha)
    batch_size = images.size(0)
    index = torch.randperm(batch_size, device=images.device)

    _, _, H, W = images.shape
    cut_ratio = np.sqrt(1 - lam)
    rw, rh = int(W * cut_ratio), int(H * cut_ratio)

    cx = np.random.randint(W)
    cy = np.random.randint(H)
    x1, y1 = max(cx - rw // 2, 0), max(cy - rh // 2, 0)
    x2, y2 = min(cx + rw // 2, W), min(cy + rh // 2, H)

    images[:, :, y1:y2, x1:x2] = images[index, :, y1:y2, x1:x2]
    lam = 1 - (x2 - x1) * (y2 - y1) / (W * H)

    return images, labels, labels[index], lam
```

### RandAugment

Randomly selects $N$ augmentations from a fixed set, each with magnitude $M$:

```python
from torchvision.transforms import RandAugment

transform = T.Compose([
    T.RandomResizedCrop(224),
    T.RandomHorizontalFlip(),
    RandAugment(num_ops=2, magnitude=9),  # 2 operations, magnitude 9/30
    T.ToTensor(),
    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])
```

::: details Worked Example — Mixup Augmentation Effect

**Setup:** Two training images from CIFAR-10:
- Image A: "cat" ($y_A = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0]$, class 3)
- Image B: "dog" ($y_B = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0]$, class 5)

$\lambda = 0.7$ (sampled from $\text{Beta}(0.2, 0.2)$)

**Step 1:** Mix images (pixel-wise):
$$\tilde{x} = 0.7 \cdot x_{\text{cat}} + 0.3 \cdot x_{\text{dog}}$$

The mixed image looks like a semi-transparent cat overlaid on a faded dog.

**Step 2:** Mix labels:
$$\tilde{y} = 0.7 \cdot [0,0,0,1,0,0,0,0,0,0] + 0.3 \cdot [0,0,0,0,0,1,0,0,0,0]$$
$$= [0, 0, 0, 0.7, 0, 0.3, 0, 0, 0, 0]$$

**Step 3:** Loss with model prediction $\hat{y} = [0.05, 0.02, 0.03, 0.60, 0.05, 0.20, 0.02, 0.01, 0.01, 0.01]$:
$$\mathcal{L} = 0.7 \cdot \text{CE}(\hat{y}, \text{cat}) + 0.3 \cdot \text{CE}(\hat{y}, \text{dog})$$
$$= 0.7 \times (-\log 0.60) + 0.3 \times (-\log 0.20) = 0.7(0.511) + 0.3(1.609) = 0.358 + 0.483 = 0.841$$

**Result:** Mixup trains the model on a linear interpolation of two images with soft labels. This smooths the decision boundary between "cat" and "dog", reduces overconfidence, and typically improves accuracy by 0.5-1% while also improving calibration.

:::

### Augmentation Comparison

| Method | Benefit | Typical Improvement |
|--------|---------|-------------------|
| Basic (flip, crop) | Baseline invariance | +1-2% |
| Mixup | Smoother decision boundaries | +0.5-1% |
| CutMix | Better localization + regularization | +1-2% |
| RandAugment | Automatic augmentation selection | +1-3% |
| Mixup + CutMix | Combined benefits | +1.5-3% |

## Transfer Learning Strategies

### Feature Extraction (Frozen Backbone)

Freeze all pretrained layers, train only the classification head:

```python
import torchvision.models as models
import torch.nn as nn

model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)

# Freeze all parameters
for param in model.parameters():
    param.requires_grad = False

# Replace and unfreeze classifier
model.fc = nn.Sequential(
    nn.Linear(2048, 256),
    nn.ReLU(),
    nn.Dropout(0.3),
    nn.Linear(256, num_classes),
)
# Only fc parameters have requires_grad=True
```

**When:** Small dataset (<1K images), target domain similar to ImageNet.

### Full Fine-Tuning

Unfreeze everything, use a small learning rate:

```python
model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
model.fc = nn.Linear(2048, num_classes)

optimizer = torch.optim.AdamW([
    {'params': model.layer1.parameters(), 'lr': 1e-5},
    {'params': model.layer2.parameters(), 'lr': 2e-5},
    {'params': model.layer3.parameters(), 'lr': 5e-5},
    {'params': model.layer4.parameters(), 'lr': 1e-4},
    {'params': model.fc.parameters(), 'lr': 5e-4},
], weight_decay=0.01)
```

### Gradual Unfreezing

Start with frozen backbone, progressively unfreeze from top to bottom:

```python
class GradualUnfreezer:
    def __init__(self, model, layer_groups, unfreeze_schedule):
        """
        layer_groups: list of parameter groups (bottom to top)
        unfreeze_schedule: list of epochs at which to unfreeze each group
        """
        self.model = model
        self.layer_groups = layer_groups
        self.schedule = unfreeze_schedule
        # Freeze all initially
        for group in layer_groups:
            for param in group:
                param.requires_grad = False

    def step(self, epoch):
        for i, unfreeze_epoch in enumerate(self.schedule):
            if epoch >= unfreeze_epoch:
                for param in self.layer_groups[i]:
                    param.requires_grad = True
```

## Vision Transformer (ViT)

### Patch Embedding

ViT (Dosovitskiy et al., 2020) treats an image as a sequence of patches.

Given image $x \in \mathbb{R}^{H \times W \times C}$ and patch size $P$:

1. Split into $N = \frac{HW}{P^2}$ patches
2. Flatten each patch to a vector: $x_p \in \mathbb{R}^{P^2 \cdot C}$
3. Project linearly: $z_0 = [x_{\text{class}}; x_p^1 E; x_p^2 E; \ldots; x_p^N E] + E_{\text{pos}}$

where $E \in \mathbb{R}^{(P^2 C) \times D}$ is the patch embedding projection.

For a 224x224 image with patch size 16: $N = 196$ patches, each $16 \times 16 \times 3 = 768$ dimensional.

```python
import torch
import torch.nn as nn

class PatchEmbedding(nn.Module):
    def __init__(self, img_size=224, patch_size=16, in_channels=3, embed_dim=768):
        super().__init__()
        self.num_patches = (img_size // patch_size) ** 2
        self.proj = nn.Conv2d(
            in_channels, embed_dim,
            kernel_size=patch_size, stride=patch_size
        )
        self.cls_token = nn.Parameter(torch.randn(1, 1, embed_dim))
        self.pos_embed = nn.Parameter(torch.randn(1, self.num_patches + 1, embed_dim))

    def forward(self, x):
        B = x.size(0)
        x = self.proj(x)              # (B, embed_dim, H/P, W/P)
        x = x.flatten(2).transpose(1, 2)  # (B, num_patches, embed_dim)

        cls_tokens = self.cls_token.expand(B, -1, -1)
        x = torch.cat([cls_tokens, x], dim=1)
        x = x + self.pos_embed
        return x


class ViT(nn.Module):
    def __init__(self, img_size=224, patch_size=16, in_channels=3,
                 num_classes=10, embed_dim=768, depth=12, n_heads=12,
                 mlp_ratio=4.0, dropout=0.1):
        super().__init__()
        self.patch_embed = PatchEmbedding(img_size, patch_size, in_channels, embed_dim)
        self.dropout = nn.Dropout(dropout)

        self.transformer = nn.TransformerEncoder(
            nn.TransformerEncoderLayer(
                d_model=embed_dim,
                nhead=n_heads,
                dim_feedforward=int(embed_dim * mlp_ratio),
                dropout=dropout,
                activation='gelu',
                batch_first=True,
            ),
            num_layers=depth,
        )
        self.norm = nn.LayerNorm(embed_dim)
        self.head = nn.Linear(embed_dim, num_classes)

    def forward(self, x):
        x = self.patch_embed(x)
        x = self.dropout(x)
        x = self.transformer(x)
        x = self.norm(x[:, 0])  # CLS token
        return self.head(x)
```

### ViT Variants

| Model | Layers | Hidden | Heads | Params | Patch |
|-------|--------|--------|-------|--------|-------|
| ViT-Ti | 12 | 192 | 3 | 5.7M | 16 |
| ViT-S | 12 | 384 | 6 | 22M | 16 |
| ViT-B | 12 | 768 | 12 | 86M | 16 |
| ViT-L | 24 | 1024 | 16 | 307M | 16 |

## ConvNeXt

ConvNeXt (Liu et al., 2022) modernizes the CNN design using ideas from transformers, achieving ViT-level performance with pure convolutions:

1. **Patchify stem:** Replace stem conv+pool with a 4x4 stride-4 convolution
2. **Inverted bottleneck:** Wide depthwise conv, narrow pointwise
3. **Larger kernel:** 7x7 depthwise convolution (like ViT's global receptive field)
4. **LayerNorm** instead of BatchNorm
5. **GELU** instead of ReLU
6. **Fewer activations:** Only one GELU per block

## CNN vs ViT: CIFAR-10 Comparison

```python
import torch
import torch.nn as nn
import torchvision
import torchvision.transforms as T
from torch.utils.data import DataLoader
import time

# ── Data ─────────────────────────────────────────────────────────────
transform_train = T.Compose([
    T.RandomCrop(32, padding=4),
    T.RandomHorizontalFlip(),
    T.ToTensor(),
    T.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
])
transform_test = T.Compose([
    T.ToTensor(),
    T.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
])

train_set = torchvision.datasets.CIFAR10('./data', True, transform_train, download=True)
test_set = torchvision.datasets.CIFAR10('./data', False, transform_test, download=True)
train_loader = DataLoader(train_set, 128, shuffle=True, num_workers=2)
test_loader = DataLoader(test_set, 128, num_workers=2)

# ── Experiment runner ────────────────────────────────────────────────
def train_and_evaluate(model, name, epochs=50, lr=1e-3):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = model.to(device)
    params = sum(p.numel() for p in model.parameters())
    print(f"\n{name}: {params:,} parameters")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)
    criterion = nn.CrossEntropyLoss()

    start_time = time.time()
    best_acc = 0

    for epoch in range(epochs):
        model.train()
        for inputs, targets in train_loader:
            inputs, targets = inputs.to(device), targets.to(device)
            optimizer.zero_grad()
            loss = criterion(model(inputs), targets)
            loss.backward()
            optimizer.step()
        scheduler.step()

        model.eval()
        correct = total = 0
        with torch.no_grad():
            for inputs, targets in test_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                correct += (model(inputs).argmax(1) == targets).sum().item()
                total += targets.size(0)
        acc = 100 * correct / total
        best_acc = max(best_acc, acc)

    elapsed = time.time() - start_time
    print(f"  Best accuracy: {best_acc:.2f}%")
    print(f"  Training time: {elapsed:.0f}s")
    return best_acc

# ── Run comparison ───────────────────────────────────────────────────
# CNN (ResNet-18 adapted for CIFAR-10)
resnet = torchvision.models.resnet18(weights=None)
resnet.conv1 = nn.Conv2d(3, 64, 3, 1, 1, bias=False)
resnet.maxpool = nn.Identity()
resnet.fc = nn.Linear(512, 10)

# ViT (small, adapted for 32x32)
vit = ViT(img_size=32, patch_size=4, num_classes=10,
          embed_dim=256, depth=6, n_heads=8, dropout=0.1)

cnn_acc = train_and_evaluate(resnet, "ResNet-18", epochs=50, lr=1e-3)
vit_acc = train_and_evaluate(vit, "ViT-Small", epochs=50, lr=1e-3)
```

### Expected Results

| Model | CIFAR-10 Acc | Parameters | Training Time |
|-------|-------------|-----------|---------------|
| ResNet-18 | ~93-94% | 11M | Fast |
| ViT-Small (32x32) | ~90-92% | ~8M | Moderate |
| ViT + pretrained | ~96-97% | ~86M | Fast (fine-tune) |

::: tip CNN vs ViT Guidance
- **Small datasets (<50K):** CNN wins (better inductive bias)
- **Medium datasets with pretrained:** ViT wins (transfer learning)
- **Large datasets (1M+):** ViT wins (scales better with data)
- **Edge deployment:** CNN (smaller, faster, no quadratic attention)
:::

## Label Smoothing

Instead of hard one-hot labels, use soft labels:

$$
y'_k = (1 - \epsilon) y_k + \frac{\epsilon}{K}
$$

where $\epsilon = 0.1$ is typical. This prevents the model from becoming overconfident and improves calibration.

::: details Worked Example — Label Smoothing

**Setup:** 5-class problem, true class = 2, $\epsilon = 0.1$

**Hard label (standard):** $y = [0, 0, 1, 0, 0]$

**Smoothed label:** $y'_k = (1 - 0.1) \cdot y_k + 0.1 / 5$

| Class | Hard $y_k$ | Smoothed $y'_k$ |
|---|---|---|
| 0 | 0 | $0 + 0.02 = 0.02$ |
| 1 | 0 | $0 + 0.02 = 0.02$ |
| **2** | **1** | $0.9 + 0.02 = **0.92**$ |
| 3 | 0 | $0 + 0.02 = 0.02$ |
| 4 | 0 | $0 + 0.02 = 0.02$ |

**Effect on loss:** With hard labels, the loss pushes the model to output $P(\text{class 2}) \to 1.0$ (infinite logit). With smoothing, the target is 0.92, so the model doesn't need extreme confidence. This prevents over-confident predictions and typically improves generalization by 0.2-0.5%.

:::

```python
criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
```

## Test-Time Augmentation (TTA)

Average predictions over multiple augmented versions of the input at test time:

```python
def tta_predict(model, image, transforms, n_augments=10):
    """Test-time augmentation: average predictions over augmented inputs."""
    model.eval()
    all_probs = []
    with torch.no_grad():
        for _ in range(n_augments):
            augmented = transforms(image)
            output = model(augmented.unsqueeze(0))
            probs = torch.softmax(output, dim=1)
            all_probs.append(probs)

    # Average probabilities
    avg_probs = torch.stack(all_probs).mean(dim=0)
    return avg_probs.argmax(dim=1)
```

TTA typically improves accuracy by 0.5-1% at the cost of $n\times$ slower inference.

## Model Calibration

A well-calibrated model's confidence matches its accuracy (e.g., 80% confidence = 80% correct).

### Expected Calibration Error (ECE)

$$
\text{ECE} = \sum_{b=1}^{B} \frac{|B_b|}{n} |\text{acc}(B_b) - \text{conf}(B_b)|
$$

where bins $B_b$ group predictions by confidence.

### Temperature Scaling (Post-hoc Calibration)

After training, learn a single temperature $T$ on the validation set:

$$
P(y|x) = \text{softmax}(z / T)
$$

```python
# Fit temperature on validation set
import torch.optim as optim

temperature = nn.Parameter(torch.tensor(1.5))
optimizer = optim.LBFGS([temperature], lr=0.01, max_iter=50)

def eval_temp():
    optimizer.zero_grad()
    scaled_logits = val_logits / temperature
    loss = nn.CrossEntropyLoss()(scaled_logits, val_labels)
    loss.backward()
    return loss

optimizer.step(eval_temp)
print(f"Optimal temperature: {temperature.item():.4f}")
```

## Confusion Matrix Analysis

```python
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix, classification_report

def plot_confusion_matrix(y_true, y_pred, class_names):
    cm = confusion_matrix(y_true, y_pred)
    plt.figure(figsize=(10, 8))
    sns.heatmap(
        cm, annot=True, fmt='d', cmap='Blues',
        xticklabels=class_names, yticklabels=class_names
    )
    plt.xlabel('Predicted')
    plt.ylabel('True')
    plt.title('Confusion Matrix')
    plt.tight_layout()
    plt.show()

    print(classification_report(y_true, y_pred, target_names=class_names))
```

## Grad-CAM: Visual Explanations

Gradient-weighted Class Activation Mapping shows which regions the model focuses on:

```python
import torch
import torch.nn.functional as F

def grad_cam(model, image, target_layer, target_class=None):
    """Generate Grad-CAM heatmap."""
    activations = {}
    gradients = {}

    def forward_hook(module, input, output):
        activations['value'] = output

    def backward_hook(module, grad_input, grad_output):
        gradients['value'] = grad_output[0]

    handle_f = target_layer.register_forward_hook(forward_hook)
    handle_b = target_layer.register_full_backward_hook(backward_hook)

    output = model(image.unsqueeze(0))
    if target_class is None:
        target_class = output.argmax(dim=1).item()

    model.zero_grad()
    output[0, target_class].backward()

    # Global average pooling of gradients
    weights = gradients['value'].mean(dim=[2, 3], keepdim=True)
    cam = (weights * activations['value']).sum(dim=1, keepdim=True)
    cam = F.relu(cam)
    cam = F.interpolate(cam, size=image.shape[1:], mode='bilinear', align_corners=False)
    cam = cam.squeeze().detach().numpy()
    cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)

    handle_f.remove()
    handle_b.remove()
    return cam
```

## Cross-References

- **CNN architectures:** [CNN](/deep-learning/cnn) --- convolution math, ResNet, EfficientNet
- **Transformer architecture:** [Transformers](/deep-learning/transformers) --- self-attention
- **Transfer learning details:** [Transfer Learning](/deep-learning/transfer-learning) --- few-shot, CLIP
- **Object detection:** [Object Detection](/deep-learning/object-detection) --- localization
- **Segmentation:** [Image Segmentation](/deep-learning/image-segmentation) --- pixel-level
- **Training recipes:** [Training Techniques](/deep-learning/training-techniques) --- augmentation, scheduling
