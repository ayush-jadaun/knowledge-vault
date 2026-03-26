---
title: "Naive Bayes"
description: "Complete guide to Naive Bayes classifiers — Bayes theorem derivation, naive independence assumption, Gaussian/Multinomial/Bernoulli variants with math, from-scratch spam classifier in NumPy, Laplace smoothing, SMS Spam dataset end-to-end."
tags: [machine-learning, naive-bayes, classification, probability, text-classification]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Naive Bayes

Naive Bayes classifiers apply Bayes' theorem with the "naive" assumption that features are conditionally independent given the class. Despite this obviously wrong assumption, Naive Bayes works surprisingly well — especially for text classification, spam filtering, and as a fast baseline.

---

## Bayes' Theorem for Classification

### The Foundation

We want to find the class $c$ that maximizes the posterior probability:

$$P(c | \mathbf{x}) = \frac{P(\mathbf{x} | c) \cdot P(c)}{P(\mathbf{x})}$$

::: details Worked Example — Bayes' Theorem for Classification

**Spam classification with two words: "free" and "meeting"**
- P(spam) = 0.4, P(ham) = 0.6
- P("free" | spam) = 0.8, P("free" | ham) = 0.1
- P("meeting" | spam) = 0.1, P("meeting" | ham) = 0.7

**Classify an email containing "free":**

**Step 1:** Compute P("free")
  P("free") = P("free"|spam)*P(spam) + P("free"|ham)*P(ham)
            = 0.8*0.4 + 0.1*0.6 = 0.32 + 0.06 = 0.38

**Step 2:** Apply Bayes' theorem
  P(spam|"free") = P("free"|spam)*P(spam) / P("free")
                 = (0.8 * 0.4) / 0.38 = 0.32 / 0.38 = 0.842

**Step 3:** Classify
  P(spam|"free") = 0.842 > 0.5 -> predict SPAM

**Interpret:**
  "Even though only 40% of emails are spam, seeing the word 'free' raises the spam probability to 84.2%. The word 'free' is 8x more likely in spam than ham, which overwhelms the prior."

:::

Since $P(\mathbf{x})$ is constant for all classes:

$$\hat{c} = \arg\max_c P(\mathbf{x} | c) \cdot P(c)$$

### The Naive Assumption

The likelihood $P(\mathbf{x} | c)$ for a $d$-dimensional feature vector is:

$$P(x_1, x_2, \ldots, x_d | c)$$

Estimating this joint probability requires exponentially many samples. The **naive** assumption of conditional independence simplifies it:

$$P(x_1, x_2, \ldots, x_d | c) = \prod_{j=1}^d P(x_j | c)$$

Now we only need to estimate $d$ one-dimensional distributions per class.

### Full Classification Rule

$$\hat{c} = \arg\max_c \left[ \log P(c) + \sum_{j=1}^d \log P(x_j | c) \right]$$

We use log probabilities to avoid numerical underflow from multiplying many small numbers.

```python
# bayes_theorem.py — Bayes' theorem for classification
import numpy as np

# Example: medical diagnosis
# C = disease, X = test result
# P(disease) = 0.01 (prior)
# P(positive | disease) = 0.95 (sensitivity)
# P(positive | healthy) = 0.05 (false positive rate)

prior_disease = 0.01
likelihood_pos_given_disease = 0.95
likelihood_pos_given_healthy = 0.05

# P(positive)
p_positive = (likelihood_pos_given_disease * prior_disease +
              likelihood_pos_given_healthy * (1 - prior_disease))

# P(disease | positive)
posterior = (likelihood_pos_given_disease * prior_disease) / p_positive

print(f"P(disease)             = {prior_disease:.4f}")
print(f"P(positive)            = {p_positive:.4f}")
print(f"P(disease | positive)  = {posterior:.4f}")
# Only 16.1% — the base rate fallacy at work

# With two independent tests both positive:
posterior_2 = (likelihood_pos_given_disease**2 * prior_disease) / \
              (likelihood_pos_given_disease**2 * prior_disease +
               likelihood_pos_given_healthy**2 * (1 - prior_disease))
print(f"P(disease | 2 positives) = {posterior_2:.4f}")
# 78.4% — much more confident with two tests
```

---

## Three Variants

### 1. Gaussian Naive Bayes

Assumes each feature follows a Gaussian (normal) distribution per class:

$$P(x_j | c) = \frac{1}{\sqrt{2\pi\sigma_{jc}^2}} \exp\left(-\frac{(x_j - \mu_{jc})^2}{2\sigma_{jc}^2}\right)$$

::: details Worked Example — Gaussian Naive Bayes

**Classify a flower with petal_length = 4.5 (2 classes):**
- Class 0 (setosa): mu=1.5, sigma=0.3
- Class 1 (versicolor): mu=4.3, sigma=0.5
- P(class 0) = 0.5, P(class 1) = 0.5

**Step 1:** P(x=4.5 | class 0)
  = 1/sqrt(2*pi*0.09) * exp(-(4.5-1.5)^2 / (2*0.09))
  = 1/0.752 * exp(-9/0.18)
  = 1.330 * exp(-50) = essentially 0

**Step 2:** P(x=4.5 | class 1)
  = 1/sqrt(2*pi*0.25) * exp(-(4.5-4.3)^2 / (2*0.25))
  = 1/1.253 * exp(-0.04/0.5)
  = 0.798 * exp(-0.08) = 0.798 * 0.923 = 0.737

**Step 3:** Compare posteriors
  P(class 0)*P(x|class 0) = 0.5 * ~0 = ~0
  P(class 1)*P(x|class 1) = 0.5 * 0.737 = 0.369
  -> Predict class 1 (versicolor)

**Interpret:**
  "A petal length of 4.5 is 10 standard deviations away from the setosa mean (1.5) but only 0.4 standard deviations from versicolor (4.3). The Gaussian model gives essentially zero probability under class 0."

:::

**Parameters to estimate:** Mean $\mu_{jc}$ and variance $\sigma_{jc}^2$ for each feature $j$ and class $c$.

```python
# gaussian_nb.py — Gaussian Naive Bayes
from sklearn.datasets import load_iris
from sklearn.naive_bayes import GaussianNB
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report
import numpy as np

iris = load_iris()
X, y = iris.data, iris.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

model = GaussianNB()
model.fit(X_train, y_train)

print(f"Accuracy: {model.score(X_test, y_test):.4f}")
print(f"\nClass priors: {model.class_prior_}")
print(f"Class means:\n{model.theta_.round(3)}")
print(f"Class variances:\n{model.var_.round(3)}")

# Cross-validation
scores = cross_val_score(model, X, y, cv=5, scoring='accuracy')
print(f"\nCV Accuracy: {scores.mean():.4f} +/- {scores.std():.4f}")
print(classification_report(y_test, model.predict(X_test), target_names=iris.target_names))
```

### 2. Multinomial Naive Bayes

For count-based features (e.g., word frequencies in text):

$$P(x_j | c) = \frac{N_{jc} + \alpha}{N_c + \alpha d}$$

where:
- $N_{jc}$ = count of feature $j$ in class $c$
- $N_c$ = total count of all features in class $c$
- $\alpha$ = Laplace smoothing parameter
- $d$ = number of features

::: details Worked Example — Multinomial NB with Laplace Smoothing

**Vocabulary: {free, meeting, click, report} (d=4), alpha=1**

Training data word counts:
| Word     | Spam | Ham |
|----------|------|-----|
| free     | 10   | 1   |
| meeting  | 1    | 8   |
| click    | 7    | 0   |
| report   | 0    | 6   |
| **Total** | **18** | **15** |

**Step 1:** Compute P("free" | spam) with Laplace smoothing
  P("free"|spam) = (10 + 1) / (18 + 1*4) = 11/22 = 0.500

**Step 2:** Compute P("click" | ham) with Laplace smoothing
  P("click"|ham) = (0 + 1) / (15 + 1*4) = 1/19 = 0.053

Without smoothing: P("click"|ham) = 0/15 = 0. This would zero out the entire product!

**Step 3:** Compute all probabilities for spam
  P("free"|spam) = 11/22 = 0.500
  P("meeting"|spam) = 2/22 = 0.091
  P("click"|spam) = 8/22 = 0.364
  P("report"|spam) = 1/22 = 0.045

**Interpret:**
  "Laplace smoothing (alpha=1) adds 1 pseudo-count to every word-class pair. This prevents zero probabilities for unseen words. The word 'click' never appeared in ham training data, but smoothing gives it a small probability of 0.053 instead of 0."

:::

```python
# multinomial_nb.py — Multinomial NB for text classification
from sklearn.naive_bayes import MultinomialNB
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import numpy as np

# Sample text data
texts = [
    "free money click here now",
    "win a free iPhone today",
    "congratulations you won a prize",
    "claim your free reward",
    "urgent action required free",
    "meeting scheduled for tomorrow",
    "project update attached",
    "lunch meeting at noon",
    "quarterly report is ready",
    "team standup at 9am",
    "please review the document",
    "budget approval needed",
    "free trial no credit card",
    "limited time offer act now",
    "conference call at 3pm",
    "invoice for services rendered",
]
labels = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]

# Vectorize
vectorizer = CountVectorizer()
X = vectorizer.fit_transform(texts)

print(f"Vocabulary size: {len(vectorizer.vocabulary_)}")
print(f"Feature matrix shape: {X.shape}")

# Train
model = MultinomialNB(alpha=1.0)  # alpha = Laplace smoothing
model.fit(X, labels)

# Test on new emails
test_emails = [
    "free offer claim now",
    "meeting tomorrow morning",
    "you won a free gift",
]
X_test = vectorizer.transform(test_emails)
predictions = model.predict(X_test)
probs = model.predict_proba(X_test)

for email, pred, prob in zip(test_emails, predictions, probs):
    label = "SPAM" if pred == 1 else "HAM"
    print(f"'{email}' → {label} (P(spam)={prob[1]:.3f})")

# Feature log probabilities
feature_names = vectorizer.get_feature_names_out()
log_probs = model.feature_log_prob_

print("\nMost indicative words for spam:")
spam_idx = np.argsort(log_probs[1] - log_probs[0])[-5:]
for idx in spam_idx[::-1]:
    print(f"  '{feature_names[idx]}': log-ratio = {log_probs[1][idx] - log_probs[0][idx]:.3f}")
```

### 3. Bernoulli Naive Bayes

For binary features (word present/absent):

$$P(x_j | c) = P(j | c)^{x_j} \cdot (1 - P(j | c))^{(1 - x_j)}$$

Unlike Multinomial, Bernoulli explicitly penalizes the ABSENCE of features.

```python
# bernoulli_nb.py — Bernoulli NB for binary features
from sklearn.naive_bayes import BernoulliNB
from sklearn.feature_extraction.text import CountVectorizer
import numpy as np

# Binary features: word present (1) or absent (0)
texts = [
    "buy cheap watches now",
    "free money opportunity",
    "meeting agenda attached",
    "project deadline friday",
    "cheap drugs online",
    "team lunch tomorrow",
]
labels = [1, 1, 0, 0, 1, 0]

vectorizer = CountVectorizer(binary=True)  # binary=True for Bernoulli
X = vectorizer.fit_transform(texts)

model = BernoulliNB(alpha=1.0)
model.fit(X, labels)

test = vectorizer.transform(["cheap free offer"])
pred = model.predict(test)
prob = model.predict_proba(test)
print(f"Prediction: {'SPAM' if pred[0] == 1 else 'HAM'} (P(spam)={prob[0][1]:.3f})")
```

### Which Variant to Use

| Variant | Feature Type | Use Case | Assumption |
|---------|-------------|----------|------------|
| **Gaussian** | Continuous | General classification | Features are normal |
| **Multinomial** | Counts | Text classification, NLP | Features are counts |
| **Bernoulli** | Binary | Short text, binary features | Features are 0/1 |

---

## Laplace Smoothing

### The Zero Probability Problem

If a word never appears in spam during training, then $P(\text{word} | \text{spam}) = 0$, and the entire product becomes zero — regardless of all other evidence. This is catastrophic.

**Laplace smoothing** adds a small count $\alpha$ to every feature:

$$P(x_j | c) = \frac{N_{jc} + \alpha}{N_c + \alpha d}$$

With $\alpha = 1$ (add-one smoothing), no probability is ever zero.

```python
# laplace.py — Effect of Laplace smoothing
import numpy as np
from sklearn.naive_bayes import MultinomialNB
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.model_selection import cross_val_score

texts = [
    "free money click", "win free prize", "claim free reward",
    "meeting tomorrow", "project update", "team standup",
    "free trial offer", "budget report", "lunch meeting",
    "urgent free action", "quarterly review", "code review needed",
]
labels = [1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0]

vectorizer = CountVectorizer()
X = vectorizer.fit_transform(texts)

print(f"{'Alpha':>8} {'Training Accuracy':>20}")
print("-" * 30)

for alpha in [0.001, 0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0]:
    model = MultinomialNB(alpha=alpha)
    model.fit(X, labels)
    acc = model.score(X, labels)
    print(f"{alpha:>8.3f} {acc:>20.4f}")
```

---

## From-Scratch Spam Classifier

```python
# naive_bayes_scratch.py — Naive Bayes from scratch
import numpy as np
from collections import defaultdict
import re

class NaiveBayesScratch:
    """Multinomial Naive Bayes from scratch with Laplace smoothing."""

    def __init__(self, alpha=1.0):
        self.alpha = alpha
        self.class_log_prior = {}
        self.feature_log_prob = {}
        self.classes = None
        self.vocabulary = None

    def fit(self, X, y):
        """X: array of shape (n_samples, n_features), y: array of labels."""
        n_samples, n_features = X.shape
        self.classes = np.unique(y)

        for c in self.classes:
            # Class prior: P(c) = count(c) / n
            n_c = np.sum(y == c)
            self.class_log_prior[c] = np.log(n_c / n_samples)

            # Feature likelihoods with Laplace smoothing
            X_c = X[y == c]
            feature_counts = X_c.sum(axis=0) + self.alpha
            total_count = feature_counts.sum()
            self.feature_log_prob[c] = np.log(feature_counts / total_count)

        return self

    def predict_log_proba(self, X):
        """Compute log P(c|x) for each class."""
        log_probs = {}
        for c in self.classes:
            log_prob = self.class_log_prior[c]
            # Handle both dense and sparse matrices
            if hasattr(X, 'toarray'):
                log_prob = log_prob + (X.toarray() @ self.feature_log_prob[c].T).ravel()
            else:
                log_prob = log_prob + X @ self.feature_log_prob[c]
            log_probs[c] = log_prob
        return log_probs

    def predict(self, X):
        log_probs = self.predict_log_proba(X)
        # Stack and find argmax
        all_probs = np.column_stack([log_probs[c] for c in self.classes])
        return self.classes[np.argmax(all_probs, axis=1)]

    def score(self, X, y):
        return np.mean(self.predict(X) == y)


# Test on email classification
from sklearn.feature_extraction.text import CountVectorizer

emails = [
    "free money click here now limited time",
    "win a free iPhone congratulations",
    "you have won a million dollars",
    "claim your free prize today",
    "urgent action required click here",
    "buy cheap medication online",
    "meeting scheduled for friday afternoon",
    "project status update attached",
    "quarterly budget review meeting",
    "team standup is at 9am sharp",
    "please review the pull request",
    "lunch order for tomorrow collected",
    "office party this friday evening",
    "new hire orientation on monday",
    "free shipping on orders today only",
    "performance review scheduled next week",
]
labels = np.array([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0])

vectorizer = CountVectorizer()
X = vectorizer.fit_transform(emails)

# From scratch
nb_scratch = NaiveBayesScratch(alpha=1.0)
X_dense = X.toarray()
nb_scratch.fit(X_dense, labels)
print(f"From-scratch accuracy: {nb_scratch.score(X_dense, labels):.4f}")

# sklearn comparison
from sklearn.naive_bayes import MultinomialNB
nb_sk = MultinomialNB(alpha=1.0)
nb_sk.fit(X, labels)
print(f"sklearn accuracy:      {nb_sk.score(X, labels):.4f}")

# Test predictions
test_emails = ["free money click now", "meeting review friday"]
X_test = vectorizer.transform(test_emails)
X_test_dense = X_test.toarray()

predictions_scratch = nb_scratch.predict(X_test_dense)
predictions_sk = nb_sk.predict(X_test)

for email, pred_s, pred_sk in zip(test_emails, predictions_scratch, predictions_sk):
    print(f"'{email}' → scratch={pred_s}, sklearn={pred_sk}")
```

---

## SMS Spam Dataset End-to-End

```python
# sms_spam.py — Naive Bayes on SMS Spam Collection
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.naive_bayes import MultinomialNB, BernoulliNB, ComplementNB
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import make_pipeline

# Create a realistic SMS spam dataset
np.random.seed(42)
ham_messages = [
    "Hey, are you coming to the party tonight?",
    "Can you pick up some milk on your way home?",
    "The meeting has been rescheduled to 3pm",
    "Happy birthday! Hope you have a great day",
    "I'll be there in 10 minutes",
    "Thanks for helping me with the project",
    "Did you see the game last night?",
    "Let me know when you're free to chat",
    "Running late, be there soon",
    "Can we meet for coffee tomorrow?",
] * 50  # 500 ham

spam_messages = [
    "WINNER! You have been selected for a free prize",
    "FREE entry in weekly competition claim now",
    "Congratulations! You won a free iPhone click here",
    "Urgent! Your account has been compromised call now",
    "Buy one get one free limited time offer",
    "You have been chosen for exclusive deal act now",
    "Free ringtones text WIN to 12345",
    "Claim your reward now before it expires",
    "Special promotion 50% off buy now click link",
    "You are a lucky winner reply to claim prize",
] * 10  # 100 spam

texts = ham_messages + spam_messages
labels = [0] * len(ham_messages) + [1] * len(spam_messages)

# Shuffle
idx = np.random.permutation(len(texts))
texts = [texts[i] for i in idx]
labels = np.array([labels[i] for i in idx])

print(f"Total messages: {len(texts)}")
print(f"Ham: {(labels == 0).sum()}, Spam: {(labels == 1).sum()}")
print(f"Spam ratio: {labels.mean():.2%}")

# Split
texts_train, texts_test, y_train, y_test = train_test_split(
    texts, labels, test_size=0.2, random_state=42, stratify=labels
)

# Compare vectorizers and NB variants
configs = [
    ("CountVec + MultinomialNB", CountVectorizer(), MultinomialNB()),
    ("CountVec + BernoulliNB", CountVectorizer(binary=True), BernoulliNB()),
    ("CountVec + ComplementNB", CountVectorizer(), ComplementNB()),
    ("TF-IDF + MultinomialNB", TfidfVectorizer(), MultinomialNB()),
]

print(f"\n{'Configuration':<35} {'Accuracy':>10} {'F1 (spam)':>12}")
print("-" * 60)

for name, vec, model in configs:
    pipe = make_pipeline(vec, model)
    scores = cross_val_score(pipe, texts_train, y_train, cv=5, scoring='f1')
    pipe.fit(texts_train, y_train)
    acc = pipe.score(texts_test, y_test)
    print(f"{name:<35} {acc:>10.4f} {scores.mean():>12.4f}")

# Best model: detailed evaluation
best_pipe = make_pipeline(TfidfVectorizer(), MultinomialNB())
best_pipe.fit(texts_train, y_train)
y_pred = best_pipe.predict(texts_test)

print(f"\n{classification_report(y_test, y_pred, target_names=['Ham', 'Spam'])}")

cm = confusion_matrix(y_test, y_pred)
print(f"Confusion Matrix:")
print(f"              Predicted")
print(f"              Ham    Spam")
print(f"Actual Ham   {cm[0,0]:4d}   {cm[0,1]:4d}")
print(f"Actual Spam  {cm[1,0]:4d}   {cm[1,1]:4d}")

# Most informative features
vectorizer = best_pipe.named_steps['tfidfvectorizer']
nb_model = best_pipe.named_steps['multinomialnb']
feature_names = vectorizer.get_feature_names_out()
log_ratio = nb_model.feature_log_prob_[1] - nb_model.feature_log_prob_[0]

print("\nTop spam indicators:")
for idx in np.argsort(log_ratio)[-10:][::-1]:
    print(f"  '{feature_names[idx]}': log-ratio = {log_ratio[idx]:.3f}")

print("\nTop ham indicators:")
for idx in np.argsort(log_ratio)[:10]:
    print(f"  '{feature_names[idx]}': log-ratio = {log_ratio[idx]:.3f}")
```

---

## Why Naive Bayes Works Despite the Naive Assumption

The independence assumption is almost always wrong — "free" and "click" are correlated in spam. However:

1. **Classification only needs the correct ranking**, not calibrated probabilities. Even if $P(c|\mathbf{x})$ is wrong, the argmax can still be correct.

2. **The bias from independence can cancel out.** Positive and negative dependencies may roughly balance, preserving the correct class ranking.

3. **Very fast training and prediction.** When you need speed over accuracy — document classification, email filtering, real-time systems — Naive Bayes wins.

4. **Works well with small data.** With $K$ classes and $d$ features, Naive Bayes estimates $O(Kd)$ parameters, while a full model would need $O(K \cdot 2^d)$.

---

## Naive Bayes vs Other Classifiers

| Aspect | Naive Bayes | Logistic Regression | SVM |
|--------|------------|-------------------|-----|
| **Training speed** | Very fast | Fast | Slow |
| **Prediction speed** | Very fast | Fast | Fast |
| **Data needed** | Small | Medium | Small-Medium |
| **Feature independence** | Assumed | Not assumed | Not assumed |
| **Calibrated probabilities** | Poor | Good | Requires Platt scaling |
| **Best for** | Text, high-d | General | Small-medium, high-d |

---

## Further Reading

- **[Math Foundations](/machine-learning/math-foundations)** — Bayes' theorem and probability
- **[Logistic Regression](/machine-learning/logistic-regression)** — Discriminative alternative
- **[Evaluation Metrics](/machine-learning/evaluation-metrics)** — Precision/recall for spam detection
- **[Data Preparation](/machine-learning/data-preparation)** — Text preprocessing
