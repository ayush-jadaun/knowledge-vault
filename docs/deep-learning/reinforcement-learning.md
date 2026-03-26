---
title: "Reinforcement Learning"
description: "Markov decision processes, Bellman equations, Q-learning from scratch, DQN with experience replay, REINFORCE policy gradient, PPO clipped surrogate, RLHF connection, and CartPole plus LunarLander implementations."
tags: [reinforcement-learning, q-learning, dqn, ppo, rlhf]
difficulty: advanced
prerequisites: [deep-learning/pytorch-fundamentals]
lastReviewed: "2026-03-25"
---

# Reinforcement Learning

Reinforcement learning (RL) trains agents to make sequential decisions by trial and error. Unlike supervised learning (learn from labeled data) or unsupervised learning (find patterns), RL learns from rewards received by interacting with an environment. This page covers MDPs, derives the Bellman equation, implements Q-learning from scratch, builds DQN with experience replay, derives REINFORCE and PPO, connects to RLHF, and trains agents on CartPole and LunarLander.

## Markov Decision Process (MDP)

An MDP is defined by the tuple $(S, A, P, R, \gamma)$:

- $S$: set of states
- $A$: set of actions
- $P(s' | s, a)$: transition probability
- $R(s, a)$: reward function
- $\gamma \in [0, 1)$: discount factor

**Markov property:** The future depends only on the current state, not the history:

$$
P(s_{t+1} | s_t, a_t) = P(s_{t+1} | s_0, a_0, \ldots, s_t, a_t)
$$

### Return

The discounted return from time $t$:

$$
G_t = R_{t+1} + \gamma R_{t+2} + \gamma^2 R_{t+3} + \cdots = \sum_{k=0}^{\infty} \gamma^k R_{t+k+1}
$$

$\gamma$ trades off immediate vs future rewards:
- $\gamma = 0$: greedy (only care about next reward)
- $\gamma = 0.99$: far-sighted (care about long-term consequences)

## Value Functions

### State Value Function

$$
V^\pi(s) = \mathbb{E}_\pi\left[G_t | S_t = s\right] = \mathbb{E}_\pi\left[\sum_{k=0}^{\infty} \gamma^k R_{t+k+1} \Big| S_t = s\right]
$$

### Action Value Function (Q-Function)

$$
Q^\pi(s, a) = \mathbb{E}_\pi\left[G_t | S_t = s, A_t = a\right]
$$

### Bellman Equation

The value function satisfies a recursive relationship:

$$
V^\pi(s) = \sum_a \pi(a|s) \sum_{s'} P(s'|s,a) \left[R(s,a,s') + \gamma V^\pi(s')\right]
$$

### Bellman Optimality Equation

The optimal value function:

$$
V^*(s) = \max_a \left[R(s,a) + \gamma \sum_{s'} P(s'|s,a) V^*(s')\right]
$$

$$
Q^*(s, a) = R(s,a) + \gamma \sum_{s'} P(s'|s,a) \max_{a'} Q^*(s', a')
$$

The optimal policy: $\pi^*(s) = \arg\max_a Q^*(s, a)$.

::: details Worked Example — Bellman Equation for a 3-State MDP

**Setup:** 3 states {A, B, C}, 2 actions {left, right}, $\gamma = 0.9$. Policy: always go right.

Transitions and rewards:
- A --right--> B, reward = 5
- B --right--> C, reward = 2
- C --right--> C, reward = 1 (terminal loop)

**Step 1:** Compute $V^\pi$ from the end:

$V^\pi(C)$: from C, going right gives reward 1 and stays in C forever.
$$V^\pi(C) = 1 + 0.9(1) + 0.9^2(1) + \ldots = \frac{1}{1 - 0.9} = 10$$

$V^\pi(B)$: reward 2 then transitions to C.
$$V^\pi(B) = 2 + 0.9 \times V^\pi(C) = 2 + 0.9 \times 10 = 11$$

$V^\pi(A)$: reward 5 then transitions to B.
$$V^\pi(A) = 5 + 0.9 \times V^\pi(B) = 5 + 0.9 \times 11 = 14.9$$

**Verify Bellman equation for state A:**
$$V^\pi(A) = R(A, \text{right}) + \gamma V^\pi(B) = 5 + 0.9(11) = 14.9 \quad \checkmark$$

**Result:** State A has the highest value (14.9) because the agent collects rewards of 5, then 2, then 1 forever. The discount factor $\gamma = 0.9$ makes the infinite stream of 1s worth only 10. If $\gamma = 0.5$ instead, $V(C) = 2$, $V(B) = 3$, $V(A) = 6.5$ --- the agent cares less about distant rewards.

:::

## Q-Learning from Scratch

Q-learning is an off-policy algorithm that learns $Q^*$ directly:

$$
Q(s, a) \leftarrow Q(s, a) + \alpha \left[R + \gamma \max_{a'} Q(s', a') - Q(s, a)\right]
$$

The term in brackets is the TD (temporal difference) error.

::: details Worked Example — Q-Value Update in a Grid World

**Setup:** 3x3 grid world. Agent at state $s = (1,1)$ (center), takes action "right" to reach $s' = (1,2)$, receives reward $R = -1$ (step penalty). $\alpha = 0.1$, $\gamma = 0.9$.

Current Q-table (partial):

| State | Left | Right | Up | Down |
|---|---|---|---|---|
| (1,1) | 2.0 | **3.0** | 1.5 | 1.0 |
| (1,2) | 1.0 | 0.0 | **5.0** | 2.0 |

**Step 1:** Find $\max_{a'} Q(s', a')$:
$$\max Q((1,2), \cdot) = \max(1.0, 0.0, 5.0, 2.0) = 5.0 \quad \text{(action "Up")}$$

**Step 2:** Compute TD target:
$$\text{target} = R + \gamma \max_{a'} Q(s', a') = -1 + 0.9 \times 5.0 = -1 + 4.5 = 3.5$$

**Step 3:** Compute TD error:
$$\delta = \text{target} - Q(s, a) = 3.5 - 3.0 = 0.5$$

**Step 4:** Update Q-value:
$$Q((1,1), \text{right}) \leftarrow 3.0 + 0.1 \times 0.5 = 3.05$$

**Result:** The Q-value for "right" at (1,1) increased slightly from 3.0 to 3.05. The TD error was positive (0.5) because the next state (1,2) has a high max Q-value (5.0 for "Up"), making "right" a better action than previously estimated. Over many episodes, Q-values converge to the true optimal values.

:::

```python
import numpy as np
import gymnasium as gym

def q_learning(env_name='FrozenLake-v1', episodes=10000,
               alpha=0.1, gamma=0.99, epsilon=1.0, epsilon_decay=0.9995):
    env = gym.make(env_name, is_slippery=False)
    n_states = env.observation_space.n
    n_actions = env.action_space.n

    Q = np.zeros((n_states, n_actions))
    rewards_per_episode = []

    for episode in range(episodes):
        state, _ = env.reset()
        total_reward = 0
        done = False

        while not done:
            # Epsilon-greedy action selection
            if np.random.random() < epsilon:
                action = env.action_space.sample()
            else:
                action = np.argmax(Q[state])

            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

            # Q-learning update
            td_target = reward + gamma * np.max(Q[next_state]) * (1 - terminated)
            td_error = td_target - Q[state, action]
            Q[state, action] += alpha * td_error

            state = next_state
            total_reward += reward

        epsilon = max(0.01, epsilon * epsilon_decay)
        rewards_per_episode.append(total_reward)

        if (episode + 1) % 1000 == 0:
            avg = np.mean(rewards_per_episode[-100:])
            print(f"Episode {episode+1}: Avg Reward = {avg:.2f}, ε = {epsilon:.4f}")

    return Q

Q = q_learning()
```

## Deep Q-Network (DQN)

When the state space is continuous (e.g., pixel observations), we approximate $Q$ with a neural network: $Q(s, a; \theta)$.

### Key Innovations

1. **Experience replay:** Store transitions $(s, a, r, s')$ in a buffer and sample random mini-batches. Breaks temporal correlation.
2. **Target network:** Use a separate, slowly-updated network for the target value. Stabilizes training.

### DQN Loss

$$
\mathcal{L} = \mathbb{E}\left[\left(r + \gamma \max_{a'} Q(s', a'; \theta^-) - Q(s, a; \theta)\right)^2\right]
$$

where $\theta^-$ are the target network parameters, updated periodically: $\theta^- \leftarrow \theta$.

### DQN: CartPole

```python
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import gymnasium as gym
from collections import deque
import random

class DQN(nn.Module):
    def __init__(self, state_dim, action_dim):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU(),
            nn.Linear(128, action_dim),
        )

    def forward(self, x):
        return self.net(x)

class ReplayBuffer:
    def __init__(self, capacity=10000):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            torch.FloatTensor(np.array(states)),
            torch.LongTensor(actions),
            torch.FloatTensor(rewards),
            torch.FloatTensor(np.array(next_states)),
            torch.FloatTensor(dones),
        )

    def __len__(self):
        return len(self.buffer)

def train_dqn():
    env = gym.make('CartPole-v1')
    state_dim = env.observation_space.shape[0]
    action_dim = env.action_space.n

    policy_net = DQN(state_dim, action_dim)
    target_net = DQN(state_dim, action_dim)
    target_net.load_state_dict(policy_net.state_dict())

    optimizer = optim.Adam(policy_net.parameters(), lr=1e-3)
    buffer = ReplayBuffer(10000)

    epsilon = 1.0
    epsilon_decay = 0.995
    epsilon_min = 0.01
    gamma = 0.99
    batch_size = 64
    target_update_freq = 10

    for episode in range(500):
        state, _ = env.reset()
        total_reward = 0
        done = False

        while not done:
            # Epsilon-greedy
            if random.random() < epsilon:
                action = env.action_space.sample()
            else:
                with torch.no_grad():
                    q_values = policy_net(torch.FloatTensor(state))
                    action = q_values.argmax().item()

            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
            buffer.push(state, action, reward, next_state, float(done))

            state = next_state
            total_reward += reward

            # Train
            if len(buffer) >= batch_size:
                states, actions, rewards, next_states, dones = buffer.sample(batch_size)

                q_values = policy_net(states).gather(1, actions.unsqueeze(1))
                with torch.no_grad():
                    next_q = target_net(next_states).max(1)[0]
                    target = rewards + gamma * next_q * (1 - dones)

                loss = nn.MSELoss()(q_values.squeeze(), target)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        epsilon = max(epsilon_min, epsilon * epsilon_decay)

        if (episode + 1) % target_update_freq == 0:
            target_net.load_state_dict(policy_net.state_dict())

        if (episode + 1) % 50 == 0:
            print(f"Episode {episode+1}: Reward = {total_reward:.0f}, ε = {epsilon:.3f}")

    return policy_net

model = train_dqn()
# Expected: solves CartPole (~500 reward) within 200-300 episodes
```

## Policy Gradient Methods

Instead of learning $Q$, directly learn the policy $\pi_\theta(a|s)$.

### REINFORCE

The policy gradient theorem:

$$
\nabla_\theta J(\theta) = \mathbb{E}_{\pi_\theta}\left[\nabla_\theta \log \pi_\theta(a_t|s_t) \cdot G_t\right]
$$

**Intuition:** Increase the probability of actions that led to high returns, decrease the probability of actions that led to low returns.

```python
class PolicyNetwork(nn.Module):
    def __init__(self, state_dim, action_dim):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 128),
            nn.ReLU(),
            nn.Linear(128, action_dim),
            nn.Softmax(dim=-1),
        )

    def forward(self, x):
        return self.net(x)

def reinforce(env_name='CartPole-v1', episodes=1000, gamma=0.99, lr=1e-3):
    env = gym.make(env_name)
    state_dim = env.observation_space.shape[0]
    action_dim = env.action_space.n

    policy = PolicyNetwork(state_dim, action_dim)
    optimizer = optim.Adam(policy.parameters(), lr=lr)

    for episode in range(episodes):
        states, actions, rewards = [], [], []
        state, _ = env.reset()
        done = False

        while not done:
            probs = policy(torch.FloatTensor(state))
            action = torch.multinomial(probs, 1).item()
            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

            states.append(state)
            actions.append(action)
            rewards.append(reward)
            state = next_state

        # Compute discounted returns
        returns = []
        G = 0
        for r in reversed(rewards):
            G = r + gamma * G
            returns.insert(0, G)
        returns = torch.FloatTensor(returns)
        returns = (returns - returns.mean()) / (returns.std() + 1e-8)  # Baseline

        # Policy gradient update
        optimizer.zero_grad()
        for s, a, G in zip(states, actions, returns):
            probs = policy(torch.FloatTensor(s))
            log_prob = torch.log(probs[a])
            loss = -log_prob * G
            loss.backward()
        optimizer.step()

        if (episode + 1) % 100 == 0:
            print(f"Episode {episode+1}: Reward = {sum(rewards):.0f}")

    return policy
```

## PPO: Proximal Policy Optimization

PPO (Schulman et al., 2017) is the most popular policy gradient method. It prevents destructively large policy updates.

### Clipped Surrogate Objective

$$
\mathcal{L}^{\text{CLIP}} = \mathbb{E}\left[\min\left(r_t(\theta) \hat{A}_t, \, \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon) \hat{A}_t\right)\right]
$$

where:

$$
r_t(\theta) = \frac{\pi_\theta(a_t|s_t)}{\pi_{\theta_{\text{old}}}(a_t|s_t)}
$$

is the probability ratio, $\hat{A}_t$ is the advantage estimate, and $\epsilon = 0.2$ is the clipping parameter.

**Why clipping?** Without it, large ratio values could lead to catastrophically large policy updates. Clipping ensures $r_t$ stays in $[0.8, 1.2]$.

::: details Worked Example — PPO Clipped Surrogate

**Setup:** $\epsilon = 0.2$, for one state-action pair:
- Old policy: $\pi_{\text{old}}(a|s) = 0.4$
- New policy: $\pi_\theta(a|s) = 0.6$
- Advantage: $\hat{A} = 2.0$ (this action was good)

**Step 1:** Probability ratio:
$$r(\theta) = \frac{0.6}{0.4} = 1.5$$

**Step 2:** Unclipped objective: $r \cdot \hat{A} = 1.5 \times 2.0 = 3.0$

**Step 3:** Clipped objective: $\text{clip}(1.5, 0.8, 1.2) \times 2.0 = 1.2 \times 2.0 = 2.4$

**Step 4:** PPO objective: $\min(3.0, 2.4) = 2.4$

The clipping limits the objective to 2.4 instead of 3.0, preventing the policy from changing too aggressively.

**Now consider negative advantage** ($\hat{A} = -1.5$, bad action):
- Unclipped: $1.5 \times (-1.5) = -2.25$
- Clipped: $1.2 \times (-1.5) = -1.8$
- PPO: $\min(-2.25, -1.8) = -2.25$

Here the unclipped value is used because it's more conservative (smaller). The policy is penalized more for increasing the probability of a bad action.

**Result:** PPO's clipping is asymmetric by design. For good actions ($\hat{A} > 0$), it prevents the ratio from exceeding $1 + \epsilon$. For bad actions ($\hat{A} < 0$), it uses the harsher penalty. This creates a "trust region" where policy updates are safe.

:::

### Advantage Estimation (GAE)

Generalized Advantage Estimation:

$$
\hat{A}_t = \sum_{l=0}^{\infty} (\gamma \lambda)^l \delta_{t+l}
$$

where $\delta_t = r_t + \gamma V(s_{t+1}) - V(s_t)$ is the TD error.

### PPO: LunarLander

```python
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import gymnasium as gym

class ActorCritic(nn.Module):
    def __init__(self, state_dim, action_dim):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(state_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 256),
            nn.ReLU(),
        )
        self.actor = nn.Linear(256, action_dim)
        self.critic = nn.Linear(256, 1)

    def forward(self, x):
        features = self.shared(x)
        action_probs = torch.softmax(self.actor(features), dim=-1)
        value = self.critic(features)
        return action_probs, value

def ppo_train(env_name='LunarLander-v3', total_steps=500000):
    env = gym.make(env_name)
    state_dim = env.observation_space.shape[0]
    action_dim = env.action_space.n

    model = ActorCritic(state_dim, action_dim)
    optimizer = optim.Adam(model.parameters(), lr=3e-4)

    gamma = 0.99
    lam = 0.95
    epsilon = 0.2
    epochs_per_update = 4
    batch_size = 64
    steps_per_update = 2048

    step = 0
    while step < total_steps:
        # Collect trajectories
        states, actions, rewards, dones, log_probs, values = [], [], [], [], [], []
        state, _ = env.reset()

        for _ in range(steps_per_update):
            state_tensor = torch.FloatTensor(state)
            with torch.no_grad():
                probs, value = model(state_tensor)

            action = torch.multinomial(probs, 1).item()
            log_prob = torch.log(probs[action])

            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

            states.append(state)
            actions.append(action)
            rewards.append(reward)
            dones.append(done)
            log_probs.append(log_prob.item())
            values.append(value.item())

            state = next_state if not done else env.reset()[0]
            step += 1

        # Compute GAE advantages
        advantages = []
        gae = 0
        with torch.no_grad():
            _, next_value = model(torch.FloatTensor(state))
            next_val = next_value.item()

        for t in reversed(range(len(rewards))):
            if t == len(rewards) - 1:
                next_val_t = next_val * (1 - dones[t])
            else:
                next_val_t = values[t + 1] * (1 - dones[t])
            delta = rewards[t] + gamma * next_val_t - values[t]
            gae = delta + gamma * lam * (1 - dones[t]) * gae
            advantages.insert(0, gae)

        advantages = torch.FloatTensor(advantages)
        returns = advantages + torch.FloatTensor(values)
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        states_t = torch.FloatTensor(np.array(states))
        actions_t = torch.LongTensor(actions)
        old_log_probs_t = torch.FloatTensor(log_probs)

        # PPO update epochs
        for _ in range(epochs_per_update):
            indices = np.random.permutation(len(states))
            for start in range(0, len(states), batch_size):
                idx = indices[start:start + batch_size]

                probs, values_pred = model(states_t[idx])
                new_log_probs = torch.log(probs.gather(1, actions_t[idx].unsqueeze(1)).squeeze())

                ratio = torch.exp(new_log_probs - old_log_probs_t[idx])
                surr1 = ratio * advantages[idx]
                surr2 = torch.clamp(ratio, 1 - epsilon, 1 + epsilon) * advantages[idx]

                actor_loss = -torch.min(surr1, surr2).mean()
                critic_loss = nn.MSELoss()(values_pred.squeeze(), returns[idx])
                entropy = -(probs * torch.log(probs + 1e-8)).sum(dim=1).mean()

                loss = actor_loss + 0.5 * critic_loss - 0.01 * entropy

                optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                optimizer.step()

        if step % 10000 < steps_per_update:
            print(f"Step {step}: Avg Reward = {np.mean(rewards):.2f}")

    return model

# Expected: LunarLander solved (~200+ avg reward) within 300K-500K steps
```

## Connection to RLHF

RLHF uses PPO to fine-tune language models. The "environment" is:
- **State:** the prompt + generated tokens so far
- **Action:** the next token
- **Reward:** score from the reward model (trained on human preferences)
- **KL penalty:** prevents diverging too far from the base model

$$
R_{\text{RLHF}} = r_\phi(x, y) - \beta \log \frac{\pi_\theta(y|x)}{\pi_{\text{ref}}(y|x)}
$$

See [Text Generation](/deep-learning/text-generation) for RLHF and DPO details.

## Value-Based vs Policy-Based

| Feature | Value-Based (DQN) | Policy-Based (PPO) |
|---------|------------------|-------------------|
| Learns | Q-function | Policy directly |
| Action space | Discrete only | Discrete or continuous |
| Exploration | ε-greedy | Stochastic policy |
| Sample efficiency | More efficient | Less efficient |
| Stability | Unstable (maximization) | More stable (clipping) |
| Best for | Atari games | Robotics, LLM alignment |

## Cross-References

- **RLHF details:** [Text Generation](/deep-learning/text-generation) --- PPO for language models
- **Neural networks:** [Neural Network Basics](/deep-learning/neural-network-basics) --- backprop, optimization
- **PyTorch:** [PyTorch Fundamentals](/deep-learning/pytorch-fundamentals) --- training loops
- **Training:** [Training Techniques](/deep-learning/training-techniques) --- gradient clipping, scheduling
