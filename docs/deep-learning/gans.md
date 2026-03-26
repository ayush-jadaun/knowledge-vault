---
title: "Generative Adversarial Networks"
description: "GAN minimax objective, mode collapse, WGAN with gradient penalty, conditional GANs, from-scratch MNIST generation, and practical training tips for stable adversarial training."
tags: [gans, generative-models, adversarial-training, wgan, deep-learning]
difficulty: advanced
prerequisites: [deep-learning/pytorch-fundamentals]
lastReviewed: "2026-03-25"
---

# Generative Adversarial Networks

GANs (Goodfellow et al., 2014) train two networks against each other: a generator that creates fake data and a discriminator that tries to tell real from fake. This adversarial training produces stunningly realistic images. This page derives the minimax objective, analyzes mode collapse, introduces WGAN with gradient penalty, implements conditional GANs, builds a GAN from scratch for MNIST, and provides practical training guidance.

## The Minimax Game

### Setup

- **Generator** $G(z)$: takes random noise $z \sim p_z(z)$ and outputs fake data $G(z)$
- **Discriminator** $D(x)$: takes data (real or fake) and outputs the probability that it is real

### The Objective

$$
\min_G \max_D \, V(D, G) = \mathbb{E}_{x \sim p_{\text{data}}}[\log D(x)] + \mathbb{E}_{z \sim p_z}[\log(1 - D(G(z)))]
$$

**Discriminator's goal (maximize $V$):**
- $D(x) \to 1$ for real data (maximize $\log D(x)$)
- $D(G(z)) \to 0$ for fake data (maximize $\log(1 - D(G(z)))$)

**Generator's goal (minimize $V$):**
- $D(G(z)) \to 1$ for fake data (minimize $\log(1 - D(G(z)))$, i.e., fool the discriminator)

### Optimal Discriminator

For a fixed $G$, the optimal discriminator is:

$$
D^*(x) = \frac{p_{\text{data}}(x)}{p_{\text{data}}(x) + p_g(x)}
$$

**Derivation:** The discriminator maximizes:

$$
V = \int_x \left[ p_{\text{data}}(x) \log D(x) + p_g(x) \log(1 - D(x)) \right] dx
$$

Taking the derivative with respect to $D(x)$ and setting it to zero:

$$
\frac{p_{\text{data}}(x)}{D(x)} - \frac{p_g(x)}{1 - D(x)} = 0
$$

Solving: $D^*(x) = \frac{p_{\text{data}}}{p_{\text{data}} + p_g}$.

### Global Optimum

Substituting $D^*$ back into $V$:

$$
V(G, D^*) = -\log 4 + 2 \cdot D_{JS}(p_{\text{data}} \| p_g)
$$

where $D_{JS}$ is the Jensen-Shannon divergence. The global minimum is $-\log 4$ achieved when $p_g = p_{\text{data}}$ (the generator perfectly matches the data distribution).

### Training Algorithm

```
for each training iteration:
    # 1. Train Discriminator (k steps, usually k=1)
    Sample mini-batch {x_1, ..., x_m} from data
    Sample mini-batch {z_1, ..., z_m} from noise prior
    Update D by ascending:
        ∇_D [1/m Σ log D(x_i) + 1/m Σ log(1 - D(G(z_i)))]

    # 2. Train Generator (1 step)
    Sample mini-batch {z_1, ..., z_m} from noise prior
    Update G by descending:
        ∇_G [1/m Σ log(1 - D(G(z_i)))]
```

### Non-Saturating Generator Loss

In practice, $\log(1 - D(G(z)))$ provides very small gradients when $D(G(z)) \approx 0$ (early in training when the discriminator easily wins). Instead, maximize:

$$
\mathcal{L}_G = \mathbb{E}_{z \sim p_z}[\log D(G(z))]
$$

This has the same fixed point but stronger gradients early in training.

## Mode Collapse

The most notorious GAN failure mode. The generator produces only a few types of output, ignoring other modes of the data distribution.

**Why it happens:** The generator finds a single output that consistently fools the discriminator and exploits it, rather than covering the full data distribution.

**Example:** A GAN trained on MNIST generates only 3s and 7s, ignoring all other digits.

### Detecting Mode Collapse

```python
def check_mode_collapse(generator, n_samples=1000, n_classes=10):
    """Check if GAN generates diverse outputs."""
    z = torch.randn(n_samples, latent_dim).to(device)
    with torch.no_grad():
        fake = generator(z)

    # Use a pretrained classifier to check diversity
    classifier = load_pretrained_classifier()
    predictions = classifier(fake).argmax(dim=1)
    class_counts = torch.bincount(predictions, minlength=n_classes)

    print("Generated class distribution:")
    for i, count in enumerate(class_counts):
        print(f"  Class {i}: {count.item()} ({100*count.item()/n_samples:.1f}%)")

    # If any class has 0 or >50%, likely mode collapse
    return (class_counts == 0).any() or (class_counts > n_samples * 0.5).any()
```

### Solutions to Mode Collapse

| Technique | How It Helps |
|-----------|-------------|
| WGAN / WGAN-GP | More stable loss landscape |
| Minibatch discrimination | D can detect lack of diversity |
| Unrolled GANs | G anticipates D's future state |
| Spectral normalization | Controls D's Lipschitz constant |
| Feature matching | G matches statistics, not specific outputs |

## WGAN: Wasserstein GAN

### The Problem with JS Divergence

When $p_{\text{data}}$ and $p_g$ have non-overlapping support (common in high dimensions), the JS divergence is constant ($\log 2$), providing zero gradient. The generator cannot learn.

### Earth Mover's Distance

The Wasserstein-1 (Earth Mover's) distance measures the minimum cost to transport mass from $p_g$ to $p_{\text{data}}$:

$$
W(p_{\text{data}}, p_g) = \inf_{\gamma \in \Pi(p_{\text{data}}, p_g)} \mathbb{E}_{(x, y) \sim \gamma}[\|x - y\|]
$$

By the Kantorovich-Rubinstein duality:

$$
W(p_{\text{data}}, p_g) = \sup_{\|f\|_L \leq 1} \mathbb{E}_{x \sim p_{\text{data}}}[f(x)] - \mathbb{E}_{x \sim p_g}[f(x)]
$$

where the supremum is over 1-Lipschitz functions.

### WGAN Objective

$$
\min_G \max_{D \in \mathcal{D}} \mathbb{E}_{x \sim p_{\text{data}}}[D(x)] - \mathbb{E}_{z \sim p_z}[D(G(z))]
$$

where $\mathcal{D}$ is the set of 1-Lipschitz functions. The discriminator (now called "critic") outputs an unbounded real number, not a probability.

### Gradient Penalty (WGAN-GP)

The original WGAN enforced the Lipschitz constraint by weight clipping, which was crude. WGAN-GP (Gulrajani et al., 2017) uses a gradient penalty:

$$
\mathcal{L}_{\text{WGAN-GP}} = \underbrace{\mathbb{E}_{z}[D(G(z))] - \mathbb{E}_{x}[D(x)]}_{\text{Wasserstein distance}} + \lambda \underbrace{\mathbb{E}_{\hat{x}}[(\|\nabla_{\hat{x}} D(\hat{x})\|_2 - 1)^2]}_{\text{Gradient penalty}}
$$

where $\hat{x} = \epsilon x + (1 - \epsilon) G(z)$ with $\epsilon \sim \text{Uniform}(0, 1)$ (random interpolation between real and fake). $\lambda = 10$ is standard.

```python
def gradient_penalty(discriminator, real, fake, device):
    batch_size = real.size(0)
    epsilon = torch.rand(batch_size, 1, 1, 1, device=device)
    interpolated = (epsilon * real + (1 - epsilon) * fake).requires_grad_(True)

    d_interpolated = discriminator(interpolated)
    gradients = torch.autograd.grad(
        outputs=d_interpolated,
        inputs=interpolated,
        grad_outputs=torch.ones_like(d_interpolated),
        create_graph=True,
        retain_graph=True,
    )[0]

    gradients = gradients.view(batch_size, -1)
    penalty = ((gradients.norm(2, dim=1) - 1) ** 2).mean()
    return penalty
```

## Conditional GAN (cGAN)

Condition the generator and discriminator on additional information (class label, text, etc.):

$$
\min_G \max_D \, \mathbb{E}_{x, y}[\log D(x, y)] + \mathbb{E}_{z, y}[\log(1 - D(G(z, y), y))]
$$

```python
class ConditionalGenerator(nn.Module):
    def __init__(self, latent_dim, n_classes, img_shape):
        super().__init__()
        self.label_emb = nn.Embedding(n_classes, n_classes)

        self.model = nn.Sequential(
            nn.Linear(latent_dim + n_classes, 256),
            nn.LeakyReLU(0.2),
            nn.BatchNorm1d(256),
            nn.Linear(256, 512),
            nn.LeakyReLU(0.2),
            nn.BatchNorm1d(512),
            nn.Linear(512, 1024),
            nn.LeakyReLU(0.2),
            nn.BatchNorm1d(1024),
            nn.Linear(1024, int(np.prod(img_shape))),
            nn.Tanh(),
        )
        self.img_shape = img_shape

    def forward(self, z, labels):
        label_embedding = self.label_emb(labels)
        gen_input = torch.cat([z, label_embedding], dim=1)
        img = self.model(gen_input)
        return img.view(img.size(0), *self.img_shape)
```

## From-Scratch GAN: MNIST

```python
import torch
import torch.nn as nn
import torchvision
import torchvision.transforms as T
from torch.utils.data import DataLoader

# ── Hyperparameters ──────────────────────────────────────────────────
LATENT_DIM = 100
IMG_DIM = 784  # 28 x 28
BATCH_SIZE = 128
EPOCHS = 100
LR = 2e-4
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ── Data ─────────────────────────────────────────────────────────────
transform = T.Compose([T.ToTensor(), T.Normalize([0.5], [0.5])])
dataset = torchvision.datasets.MNIST('./data', train=True, download=True, transform=transform)
dataloader = DataLoader(dataset, BATCH_SIZE, shuffle=True, drop_last=True)

# ── Generator ────────────────────────────────────────────────────────
class Generator(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(LATENT_DIM, 256),
            nn.LeakyReLU(0.2),
            nn.BatchNorm1d(256),
            nn.Linear(256, 512),
            nn.LeakyReLU(0.2),
            nn.BatchNorm1d(512),
            nn.Linear(512, 1024),
            nn.LeakyReLU(0.2),
            nn.BatchNorm1d(1024),
            nn.Linear(1024, IMG_DIM),
            nn.Tanh(),
        )

    def forward(self, z):
        return self.net(z)

# ── Discriminator ────────────────────────────────────────────────────
class Discriminator(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(IMG_DIM, 1024),
            nn.LeakyReLU(0.2),
            nn.Dropout(0.3),
            nn.Linear(1024, 512),
            nn.LeakyReLU(0.2),
            nn.Dropout(0.3),
            nn.Linear(512, 256),
            nn.LeakyReLU(0.2),
            nn.Dropout(0.3),
            nn.Linear(256, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x)

# ── Training ─────────────────────────────────────────────────────────
G = Generator().to(DEVICE)
D = Discriminator().to(DEVICE)

opt_G = torch.optim.Adam(G.parameters(), lr=LR, betas=(0.5, 0.999))
opt_D = torch.optim.Adam(D.parameters(), lr=LR, betas=(0.5, 0.999))
criterion = nn.BCELoss()

for epoch in range(EPOCHS):
    for real_imgs, _ in dataloader:
        real_imgs = real_imgs.view(-1, IMG_DIM).to(DEVICE)
        batch_size = real_imgs.size(0)

        real_labels = torch.ones(batch_size, 1, device=DEVICE)
        fake_labels = torch.zeros(batch_size, 1, device=DEVICE)

        # ── Train Discriminator ──────────────────────────────────
        z = torch.randn(batch_size, LATENT_DIM, device=DEVICE)
        fake_imgs = G(z).detach()

        d_loss_real = criterion(D(real_imgs), real_labels)
        d_loss_fake = criterion(D(fake_imgs), fake_labels)
        d_loss = (d_loss_real + d_loss_fake) / 2

        opt_D.zero_grad()
        d_loss.backward()
        opt_D.step()

        # ── Train Generator ──────────────────────────────────────
        z = torch.randn(batch_size, LATENT_DIM, device=DEVICE)
        fake_imgs = G(z)
        g_loss = criterion(D(fake_imgs), real_labels)  # Non-saturating loss

        opt_G.zero_grad()
        g_loss.backward()
        opt_G.step()

    if (epoch + 1) % 10 == 0:
        print(f"Epoch {epoch+1}/{EPOCHS} | D Loss: {d_loss:.4f} | G Loss: {g_loss:.4f}")

# ── Generate samples ─────────────────────────────────────────────────
G.eval()
with torch.no_grad():
    z = torch.randn(64, LATENT_DIM, device=DEVICE)
    samples = G(z).view(-1, 1, 28, 28).cpu()
    torchvision.utils.save_image(samples, 'gan_samples.png', nrow=8, normalize=True)
```

## Training Tips

### Architecture Guidelines

| Component | Recommendation |
|-----------|---------------|
| G activation (hidden) | LeakyReLU(0.2) or ReLU |
| G activation (output) | Tanh (images in [-1, 1]) |
| D activation (hidden) | LeakyReLU(0.2) |
| D activation (output) | Sigmoid (vanilla) or none (WGAN) |
| Normalization (G) | BatchNorm (not in output layer) |
| Normalization (D) | LayerNorm or SpectralNorm (not BatchNorm with GP) |
| Optimizer | Adam with $\beta_1 = 0.5$, $\beta_2 = 0.999$ |
| Learning rate | $10^{-4}$ to $2 \times 10^{-4}$ |

### Stability Tricks

1. **Label smoothing:** Use 0.9 instead of 1.0 for real labels
2. **Noisy labels:** Occasionally flip labels (5% of the time)
3. **Train D more than G:** Especially with WGAN (5 D steps per 1 G step)
4. **Spectral normalization:** Stabilizes D without gradient penalty
5. **Two time-scale update rule (TTUR):** Higher LR for D than G
6. **Progressive growing:** Start at low resolution, gradually increase

### Evaluation Metrics

**FID (Frechet Inception Distance):**

$$
\text{FID} = \|\mu_r - \mu_g\|^2 + \text{Tr}(\Sigma_r + \Sigma_g - 2(\Sigma_r \Sigma_g)^{1/2})
$$

Lower FID = better quality and diversity. Compute using features from a pretrained Inception network.

**IS (Inception Score):**

$$
\text{IS} = \exp\left(\mathbb{E}_x [D_{KL}(p(y|x) \| p(y))]\right)
$$

Higher IS = sharper and more diverse images. Less reliable than FID.

## GAN Variants Timeline

| Year | Variant | Key Innovation |
|------|---------|---------------|
| 2014 | GAN | Original minimax formulation |
| 2014 | cGAN | Conditional generation |
| 2016 | DCGAN | Convolutional architecture guidelines |
| 2017 | WGAN | Wasserstein distance |
| 2017 | WGAN-GP | Gradient penalty |
| 2018 | StyleGAN | Style-based generator |
| 2019 | BigGAN | Large-scale, class-conditional |
| 2020 | StyleGAN2 | Improved normalization |
| 2021 | StyleGAN3 | Alias-free generation |

## DCGAN Architecture Guidelines

DCGAN (Radford et al., 2016) established rules for stable convolutional GANs:

1. Replace all pooling with strided convolutions (discriminator) and transposed convolutions (generator)
2. Use BatchNorm in both G and D (except G output and D input)
3. Remove all fully connected layers (except G input and D output)
4. Use ReLU in G (except output: Tanh) and LeakyReLU in D

```python
class DCGANGenerator(nn.Module):
    def __init__(self, latent_dim=100, channels=1, features=64):
        super().__init__()
        self.net = nn.Sequential(
            # Input: (latent_dim, 1, 1)
            nn.ConvTranspose2d(latent_dim, features * 8, 4, 1, 0, bias=False),
            nn.BatchNorm2d(features * 8),
            nn.ReLU(True),
            # State: (features*8, 4, 4)
            nn.ConvTranspose2d(features * 8, features * 4, 4, 2, 1, bias=False),
            nn.BatchNorm2d(features * 4),
            nn.ReLU(True),
            # State: (features*4, 8, 8)
            nn.ConvTranspose2d(features * 4, features * 2, 4, 2, 1, bias=False),
            nn.BatchNorm2d(features * 2),
            nn.ReLU(True),
            # State: (features*2, 16, 16)
            nn.ConvTranspose2d(features * 2, features, 4, 2, 1, bias=False),
            nn.BatchNorm2d(features),
            nn.ReLU(True),
            # State: (features, 32, 32)
            nn.ConvTranspose2d(features, channels, 4, 2, 1, bias=False),
            nn.Tanh(),
            # Output: (channels, 64, 64)
        )

    def forward(self, z):
        return self.net(z.view(z.size(0), -1, 1, 1))

class DCGANDiscriminator(nn.Module):
    def __init__(self, channels=1, features=64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(channels, features, 4, 2, 1, bias=False),
            nn.LeakyReLU(0.2, inplace=True),

            nn.Conv2d(features, features * 2, 4, 2, 1, bias=False),
            nn.BatchNorm2d(features * 2),
            nn.LeakyReLU(0.2, inplace=True),

            nn.Conv2d(features * 2, features * 4, 4, 2, 1, bias=False),
            nn.BatchNorm2d(features * 4),
            nn.LeakyReLU(0.2, inplace=True),

            nn.Conv2d(features * 4, features * 8, 4, 2, 1, bias=False),
            nn.BatchNorm2d(features * 8),
            nn.LeakyReLU(0.2, inplace=True),

            nn.Conv2d(features * 8, 1, 4, 1, 0, bias=False),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x).view(-1, 1)
```

## Spectral Normalization

Spectral normalization (Miyato et al., 2018) constrains the Lipschitz constant of the discriminator by normalizing each weight matrix by its spectral norm (largest singular value):

$$
\bar{W} = \frac{W}{\sigma(W)}
$$

where $\sigma(W) = \max_{\|h\|=1} \|Wh\|_2$ is the spectral norm.

```python
# PyTorch built-in
from torch.nn.utils import spectral_norm

discriminator = nn.Sequential(
    spectral_norm(nn.Conv2d(3, 64, 3, padding=1)),
    nn.LeakyReLU(0.2),
    spectral_norm(nn.Conv2d(64, 128, 4, stride=2, padding=1)),
    nn.LeakyReLU(0.2),
    spectral_norm(nn.Conv2d(128, 256, 4, stride=2, padding=1)),
    nn.LeakyReLU(0.2),
    spectral_norm(nn.Linear(256 * 8 * 8, 1)),
)
```

## GAN Applications Beyond Image Generation

| Application | Approach | Description |
|------------|----------|-------------|
| Image-to-image translation | Pix2Pix, CycleGAN | Convert between domains (sketch to photo) |
| Super-resolution | SRGAN, ESRGAN | Upscale low-resolution images |
| Data augmentation | Progressive GAN | Generate synthetic training data |
| Anomaly detection | AnoGAN | Normal distribution modeling |
| Drug discovery | MolGAN | Generate molecular graphs |
| Video prediction | DVD-GAN | Generate future frames |

## Debugging GAN Training

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| D loss drops to 0 | D too strong | Reduce D capacity, add noise to D inputs |
| G loss stuck high | G too weak or D too strong | Increase G capacity, reduce D training steps |
| D loss oscillates wildly | Unstable training | Use WGAN-GP or spectral normalization |
| Mode collapse (all same output) | G found exploit | Use minibatch discrimination, unrolled GAN, or WGAN-GP |
| Checkerboard artifacts | Transposed convolution | Use resize + conv instead of transposed conv |
| Loss both go to ~0.69 | Nash equilibrium | This can be normal ($-\log 2 \approx 0.693$) |

## Cross-References

- **Alternative generative model:** [Autoencoders](/deep-learning/autoencoders) --- VAEs for structured latent spaces
- **Modern generation:** [Diffusion Models](/deep-learning/diffusion-models) --- now dominant over GANs
- **Foundations:** [Neural Network Basics](/deep-learning/neural-network-basics) --- gradients, optimization
- **Training stability:** [Training Techniques](/deep-learning/training-techniques) --- normalization, regularization
- **Multimodal:** [Multimodal Models](/deep-learning/multimodal-models) --- CLIP-guided generation
