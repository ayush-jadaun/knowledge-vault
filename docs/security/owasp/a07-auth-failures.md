---
title: "A07: Identification and Authentication Failures"
description: Comprehensive guide to authentication vulnerabilities including credential stuffing, brute force attacks, session fixation, weak password policies, MFA bypass, and session management with secure TypeScript implementations
tags: [security, owasp, authentication, session-management, credential-stuffing, brute-force, mfa]
difficulty: advanced
prerequisites:
  - owasp/index
  - authentication/index
  - TypeScript and Express.js fundamentals
lastReviewed: "2026-03-17"
---

# A07: Identification and Authentication Failures

Confirmation of the user's identity, authentication, and session management is critical to protect against authentication-related attacks. This category was previously called "Broken Authentication" (A02 in 2017) and dropped to A07 in 2021, partly due to increased adoption of standardized authentication frameworks. However, authentication failures remain a significant source of breaches.

## 1. Credential Stuffing

Credential stuffing is an automated attack where attackers use large lists of stolen username/password pairs (from data breaches) to attempt login on other services. It succeeds because users reuse passwords across multiple sites.

### Attack Scale

Credential stuffing attacks typically involve:
- Millions of credential pairs from data breaches
- Distributed proxy networks to avoid IP-based blocking
- Tools like Sentry MBA, STORM, and custom scripts
- Success rates of 0.1-2% (which still yields thousands of compromised accounts)

### Vulnerable Code

```typescript
// VULNERABLE: No rate limiting, no account lockout, no breach detection
app.post('/api/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

  if (!user) {
    return res.status(401).json({ error: 'User not found' }); // Reveals user existence
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({ error: 'Wrong password' }); // Reveals what failed
  }

  // No check for compromised credentials
  // No MFA requirement
  // No anomaly detection

  const token = jwt.sign({ userId: user.id }, SECRET);
  res.json({ token });
});
```

### Secure Code

```typescript
import argon2 from 'argon2';
import { createHash } from 'crypto';

// Check if a password has been found in known data breaches
// Uses the k-anonymity model of the Have I Been Pwned API
async function isPasswordBreached(password: string): Promise<boolean> {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.substring(0, 5);
  const suffix = hash.substring(5);

  const response = await fetch(
    `https://api.pwnedpasswords.com/range/${prefix}`,
    { headers: { 'Add-Padding': 'true' } }
  );

  const text = await response.text();
  const lines = text.split('\n');

  for (const line of lines) {
    const [hashSuffix, count] = line.split(':');
    if (hashSuffix.trim() === suffix) {
      return true; // Password found in breach database
    }
  }

  return false;
}

// Rate limiting with progressive delays
class LoginRateLimiter {
  private attempts: Map<string, { count: number; lastAttempt: number; lockedUntil?: number }> = new Map();

  async checkAndRecord(
    key: string // IP address, email, or combination
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const record = this.attempts.get(key) || { count: 0, lastAttempt: 0 };

    // Check if account is locked
    if (record.lockedUntil && record.lockedUntil > now) {
      return {
        allowed: false,
        retryAfter: Math.ceil((record.lockedUntil - now) / 1000),
      };
    }

    // Reset count if enough time has passed
    if (now - record.lastAttempt > 15 * 60 * 1000) { // 15 minutes
      record.count = 0;
    }

    record.count++;
    record.lastAttempt = now;

    // Progressive lockout
    if (record.count >= 10) {
      record.lockedUntil = now + 30 * 60 * 1000; // 30-minute lockout
      this.attempts.set(key, record);
      return { allowed: false, retryAfter: 1800 };
    }

    if (record.count >= 5) {
      // Add delay: 2^(attempts-5) seconds, max 30 seconds
      const delay = Math.min(Math.pow(2, record.count - 5), 30) * 1000;
      record.lockedUntil = now + delay;
      this.attempts.set(key, record);
      return { allowed: false, retryAfter: Math.ceil(delay / 1000) };
    }

    this.attempts.set(key, record);
    return { allowed: true };
  }

  resetOnSuccess(key: string): void {
    this.attempts.delete(key);
  }
}

const loginLimiter = new LoginRateLimiter();

// Anomaly detection
interface LoginContext {
  ip: string;
  userAgent: string;
  geoLocation?: string;
  timestamp: Date;
}

async function detectAnomalousLogin(
  userId: string,
  context: LoginContext
): Promise<{ suspicious: boolean; reason?: string }> {
  // Fetch recent login history
  const history = await db.query(
    `SELECT ip, user_agent, geo_location, created_at
     FROM login_history
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId]
  );

  if (history.rows.length === 0) {
    return { suspicious: false }; // First login, no history to compare
  }

  // Check for new IP address
  const knownIPs = new Set(history.rows.map((r: any) => r.ip));
  if (!knownIPs.has(context.ip)) {
    // Check for impossible travel
    const lastLogin = history.rows[0];
    const timeDiff = context.timestamp.getTime() - new Date(lastLogin.created_at).getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    if (hoursDiff < 2 && context.geoLocation !== lastLogin.geo_location) {
      return {
        suspicious: true,
        reason: 'Impossible travel detected',
      };
    }

    return {
      suspicious: true,
      reason: 'Login from new IP address',
    };
  }

  // Check for new user agent
  const knownAgents = new Set(history.rows.map((r: any) => r.user_agent));
  if (!knownAgents.has(context.userAgent)) {
    return {
      suspicious: true,
      reason: 'Login from new device',
    };
  }

  return { suspicious: false };
}

// SECURE: Complete login endpoint
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Rate limit by IP and by email
  const ipKey = `ip:${req.ip}`;
  const emailKey = `email:${email}`;

  const [ipCheck, emailCheck] = await Promise.all([
    loginLimiter.checkAndRecord(ipKey),
    loginLimiter.checkAndRecord(emailKey),
  ]);

  if (!ipCheck.allowed || !emailCheck.allowed) {
    const retryAfter = Math.max(ipCheck.retryAfter || 0, emailCheck.retryAfter || 0);
    res.setHeader('Retry-After', retryAfter.toString());
    return res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
      retryAfter,
    });
  }

  // Generic error message — same for wrong email AND wrong password
  const genericError = 'Invalid email or password';

  const result = await db.query(
    'SELECT id, email, password_hash, role, mfa_enabled FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    await argon2.hash(password); // Timing attack prevention
    return res.status(401).json({ error: genericError });
  }

  const user = result.rows[0];

  const passwordValid = await argon2.verify(user.password_hash, password);
  if (!passwordValid) {
    // Log failed attempt
    await db.query(
      `INSERT INTO login_attempts (email, ip, user_agent, success, created_at)
       VALUES ($1, $2, $3, false, NOW())`,
      [email, req.ip, req.headers['user-agent']]
    );

    return res.status(401).json({ error: genericError });
  }

  // Check for anomalous login
  const anomaly = await detectAnomalousLogin(user.id, {
    ip: req.ip!,
    userAgent: req.headers['user-agent'] || '',
    timestamp: new Date(),
  });

  // If MFA is enabled, require second factor
  if (user.mfa_enabled || anomaly.suspicious) {
    const mfaToken = await createMfaChallenge(user.id);
    return res.json({
      requiresMfa: true,
      mfaToken,
      ...(anomaly.suspicious ? { message: 'Additional verification required' } : {}),
    });
  }

  // Reset rate limiter on successful login
  loginLimiter.resetOnSuccess(ipKey);
  loginLimiter.resetOnSuccess(emailKey);

  // Record successful login
  await db.query(
    `INSERT INTO login_history (user_id, ip, user_agent, success, created_at)
     VALUES ($1, $2, $3, true, NOW())`,
    [user.id, req.ip, req.headers['user-agent']]
  );

  const { accessToken, refreshToken } = await createTokenPair(user);

  // Set refresh token as HttpOnly cookie
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh',
  });

  res.json({ accessToken });
});
```

---

## 2. Brute Force Attacks

Brute force attacks systematically try every possible password until the correct one is found. Dictionary attacks use lists of common passwords.

### Defense: Strong Password Policy

```typescript
import { z } from 'zod';

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(
    (pwd) => /[a-z]/.test(pwd),
    'Password must contain at least one lowercase letter'
  )
  .refine(
    (pwd) => /[A-Z]/.test(pwd),
    'Password must contain at least one uppercase letter'
  )
  .refine(
    (pwd) => /[0-9]/.test(pwd),
    'Password must contain at least one number'
  )
  .refine(
    (pwd) => /[^a-zA-Z0-9]/.test(pwd),
    'Password must contain at least one special character'
  );

// Check against common password lists
const COMMON_PASSWORDS = new Set([
  'password123!', 'Password1!', 'Qwerty123!', 'Admin123!',
  // ... load from a comprehensive list (e.g., SecLists)
]);

async function validatePassword(
  password: string,
  userContext: { email: string; name: string }
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Length and complexity
  const result = passwordSchema.safeParse(password);
  if (!result.success) {
    errors.push(...result.error.errors.map(e => e.message));
  }

  // Check against common passwords
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('This password is too common');
  }

  // Check against user context (email, name)
  const contextWords = [
    ...userContext.email.split(/[@.]/),
    ...userContext.name.split(/\s+/),
  ].filter(w => w.length >= 3);

  for (const word of contextWords) {
    if (password.toLowerCase().includes(word.toLowerCase())) {
      errors.push('Password must not contain your name or email');
      break;
    }
  }

  // Check against breach database
  const breached = await isPasswordBreached(password);
  if (breached) {
    errors.push('This password has been found in a data breach. Please choose a different password.');
  }

  return { valid: errors.length === 0, errors };
}
```

---

## 3. Session Fixation

Session fixation attacks occur when an attacker sets a user's session ID before they authenticate. After the victim logs in, the attacker can use the pre-set session ID to hijack the authenticated session.

### Vulnerable Code

```typescript
import session from 'express-session';

app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: true, // VULNERABLE: Creates session before authentication
}));

app.post('/api/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await authenticateUser(email, password);

  if (user) {
    // VULNERABLE: The session ID is not regenerated after authentication
    // The pre-authentication session ID continues to be used
    req.session.userId = user.id;
    req.session.role = user.role;
    res.json({ message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

### Exploitation

```
1. Attacker visits the application and receives session ID: abc123
2. Attacker sends victim a link with the session ID embedded:
   https://target.com/login?sid=abc123
   (or via XSS, or by setting the cookie via a subdomain)
3. Victim clicks the link and logs in
4. The server associates the victim's authenticated session with ID abc123
5. Attacker uses session ID abc123 to access the victim's session
```

### Secure Code

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET!,
  name: '__Host-sid', // __Host- prefix requires secure, path=/
  resave: false,
  saveUninitialized: false, // Don't create session until something is stored
  rolling: true, // Reset expiry on every response
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 3600000, // 1 hour
    path: '/',
  },
}));

app.post('/api/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await authenticateUser(email, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // SECURE: Regenerate session ID after authentication
  // This invalidates any pre-set session IDs
  req.session.regenerate((err) => {
    if (err) {
      logger.error('Session regeneration failed', { error: err });
      return res.status(500).json({ error: 'Login failed' });
    }

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.loginTime = Date.now();
    req.session.loginIP = req.ip;

    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error('Session save failed', { error: saveErr });
        return res.status(500).json({ error: 'Login failed' });
      }

      res.json({ message: 'Login successful' });
    });
  });
});

// Also regenerate session ID on privilege changes
app.post('/api/elevate', authenticate, async (req: Request, res: Response) => {
  // After MFA verification or password re-entry
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: 'Elevation failed' });
    }
    req.session.elevated = true;
    req.session.elevatedAt = Date.now();
    req.session.save(() => {
      res.json({ message: 'Session elevated' });
    });
  });
});
```

---

## 4. Weak Password Recovery

Password recovery (forgot password) is a common attack vector. If the recovery process is weak, attackers can take over accounts.

### Vulnerable Code

```typescript
// VULNERABLE: Predictable reset token
app.post('/api/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' }); // Reveals user existence
  }

  // VULNERABLE: Predictable token (timestamp-based)
  const resetToken = Date.now().toString(36);

  // VULNERABLE: Token never expires
  await db.query(
    'UPDATE users SET reset_token = $1 WHERE id = $2',
    [resetToken, user.id]
  );

  // VULNERABLE: Token sent in URL (logged in server access logs, browser history, referrer headers)
  await sendEmail(email, `Reset: https://example.com/reset?token=${resetToken}`);

  res.json({ message: 'Reset email sent' });
});

// VULNERABLE: No rate limiting on password reset
// Attacker can brute-force short tokens
app.post('/api/reset-password', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  const user = await db.query(
    'SELECT * FROM users WHERE reset_token = $1',
    [token]
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  // No password validation, no token expiry check, no token invalidation
  await db.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [await bcrypt.hash(newPassword, 10), user.id]
  );

  res.json({ message: 'Password updated' });
});
```

### Secure Code

```typescript
import crypto from 'crypto';

app.post('/api/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;

  // Always return success — don't reveal whether the email exists
  res.json({ message: 'If an account exists with that email, a reset link has been sent.' });

  // Process asynchronously
  const user = await findUserByEmail(email);
  if (!user) return;

  // Rate limit: max 3 reset requests per email per hour
  const recentResets = await db.query(
    `SELECT COUNT(*) FROM password_resets
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [user.id]
  );

  if (recentResets.rows[0].count >= 3) {
    logger.warn('Password reset rate limit exceeded', { userId: user.id });
    return;
  }

  // Invalidate any existing reset tokens for this user
  await db.query(
    'DELETE FROM password_resets WHERE user_id = $1',
    [user.id]
  );

  // Generate a cryptographically secure token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Store the HASH of the token (not the token itself)
  // with a short expiration
  await db.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [user.id, tokenHash]
  );

  // Send the unhashed token to the user
  await sendEmail(email, {
    subject: 'Password Reset Request',
    text: `Click here to reset your password: https://app.example.com/reset-password?token=${token}\n\nThis link expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
  });
});

app.post('/api/reset-password', async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().length(64), // 32 bytes hex = 64 chars
    newPassword: z.string().min(12).max(128),
  });

  const { token, newPassword } = schema.parse(req.body);

  // Hash the provided token to compare with stored hash
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await db.query(
    `SELECT pr.user_id, u.email, u.name
     FROM password_resets pr
     JOIN users u ON pr.user_id = u.id
     WHERE pr.token_hash = $1
     AND pr.expires_at > NOW()
     AND pr.used = false`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  const { user_id, email, name } = result.rows[0];

  // Validate the new password
  const validation = await validatePassword(newPassword, { email, name });
  if (!validation.valid) {
    return res.status(400).json({ errors: validation.errors });
  }

  // Update password and invalidate token atomically
  const passwordHash = await argon2.hash(newPassword);

  await db.transaction(async (tx) => {
    await tx.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, user_id]
    );

    // Mark token as used (not delete — keep for audit trail)
    await tx.query(
      'UPDATE password_resets SET used = true, used_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    );

    // Invalidate ALL existing sessions for this user
    await tx.query(
      'DELETE FROM sessions WHERE user_id = $1',
      [user_id]
    );
  });

  // Notify the user that their password was changed
  await sendEmail(email, {
    subject: 'Your password has been changed',
    text: 'Your password was just changed. If you did not do this, contact support immediately.',
  });

  res.json({ message: 'Password has been reset. Please log in with your new password.' });
});
```

---

## 5. MFA Bypass Techniques and Defenses

### Common MFA Bypass Attacks

**Real-Time Phishing (MFA Fatigue):**
```
1. Attacker obtains victim's password (phishing, breach)
2. Attacker triggers login, which sends MFA push notification
3. Attacker repeatedly triggers login attempts
4. Victim gets frustrated and approves one to stop notifications
```

**SIM Swapping (SMS MFA):**
```
1. Attacker social-engineers mobile carrier
2. Carrier transfers victim's phone number to attacker's SIM
3. Attacker receives SMS OTP codes intended for victim
```

**Session Token Theft:**
```
1. Attacker phishes the complete login flow (password + MFA)
2. Attacker captures the session token issued after MFA
3. Attacker replays the session token (MFA was already satisfied)
```

### Secure MFA Implementation

```typescript
// Number matching to prevent MFA fatigue attacks
async function createMfaChallenge(userId: string): Promise<{
  challengeToken: string;
  displayNumber: number;
}> {
  const challengeToken = crypto.randomBytes(32).toString('hex');
  const displayNumber = crypto.randomInt(10, 99); // Two-digit number

  await db.query(
    `INSERT INTO mfa_challenges (user_id, token_hash, display_number, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
    [userId, hashToken(challengeToken), displayNumber]
  );

  // Push notification asks user to enter the displayed number
  await sendPushNotification(userId, {
    title: 'Login Approval Required',
    body: 'Enter the number shown on your screen to approve this login.',
    // Don't include the number in the push — user must see it on the login screen
  });

  return { challengeToken, displayNumber };
}

async function verifyMfaChallenge(
  challengeToken: string,
  userEnteredNumber: number
): Promise<boolean> {
  const tokenHash = hashToken(challengeToken);

  const result = await db.query(
    `SELECT user_id, display_number
     FROM mfa_challenges
     WHERE token_hash = $1
     AND expires_at > NOW()
     AND verified = false`,
    [tokenHash]
  );

  if (result.rows.length === 0) return false;

  const { display_number } = result.rows[0];

  // User must enter the correct number (prevents blind approval)
  if (userEnteredNumber !== display_number) {
    return false;
  }

  await db.query(
    'UPDATE mfa_challenges SET verified = true WHERE token_hash = $1',
    [tokenHash]
  );

  return true;
}
```

---

## 6. Session Management

### Session Security Controls

```typescript
// Complete session management middleware
interface SessionData {
  userId: string;
  role: string;
  loginTime: number;
  lastActivity: number;
  loginIP: string;
  userAgent: string;
  elevated: boolean;
  elevatedAt?: number;
}

class SecureSessionManager {
  private readonly IDLE_TIMEOUT = 30 * 60 * 1000;     // 30 minutes
  private readonly ABSOLUTE_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
  private readonly ELEVATION_TIMEOUT = 5 * 60 * 1000;  // 5 minutes
  private readonly MAX_CONCURRENT = 5;

  async validateSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const session = req.session as any as SessionData;

    if (!session?.userId) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    const now = Date.now();

    // Check idle timeout
    if (now - session.lastActivity > this.IDLE_TIMEOUT) {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'Session expired due to inactivity' });
      return;
    }

    // Check absolute timeout
    if (now - session.loginTime > this.ABSOLUTE_TIMEOUT) {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }

    // Check elevation timeout
    if (session.elevated && session.elevatedAt) {
      if (now - session.elevatedAt > this.ELEVATION_TIMEOUT) {
        session.elevated = false;
        session.elevatedAt = undefined;
      }
    }

    // Update last activity
    session.lastActivity = now;

    next();
  }

  async enforceSessionLimit(userId: string): Promise<void> {
    // Get all active sessions for this user
    const sessions = await db.query(
      `SELECT session_id, created_at FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    // If over the limit, destroy the oldest sessions
    if (sessions.rows.length >= this.MAX_CONCURRENT) {
      const toDestroy = sessions.rows.slice(this.MAX_CONCURRENT - 1);
      for (const session of toDestroy) {
        await db.query('DELETE FROM sessions WHERE session_id = $1', [session.session_id]);
      }
    }
  }
}

// Logout — proper session invalidation
app.post('/api/auth/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  // Destroy the server-side session
  req.session.destroy((err) => {
    if (err) {
      logger.error('Session destruction failed', { error: err });
    }
  });

  // Clear the session cookie
  res.clearCookie('__Host-sid', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });

  // If using JWTs, add the token to a revocation list
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const decoded = jwt.decode(token) as any;
    if (decoded?.jti && decoded?.exp) {
      await addToRevocationList(decoded.jti, decoded.exp);
    }
  }

  res.json({ message: 'Logged out' });
});

// Logout from all devices
app.post('/api/auth/logout-all', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  // Destroy all sessions for this user
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

  // Increment user's token version to invalidate all JWTs
  await db.query(
    'UPDATE users SET token_version = token_version + 1 WHERE id = $1',
    [userId]
  );

  // Clear the current session cookie
  res.clearCookie('__Host-sid', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });

  res.json({ message: 'Logged out from all devices' });
});
```

---

## Prevention Checklist

- [ ] Implement progressive rate limiting on login endpoints
- [ ] Use generic error messages that do not reveal whether the email/username exists
- [ ] Check passwords against breach databases (Have I Been Pwned API)
- [ ] Enforce strong password policies (12+ characters, complexity, not in common lists)
- [ ] Hash passwords with Argon2id, bcrypt, or scrypt (never SHA-256 or MD5)
- [ ] Regenerate session IDs after authentication and privilege changes
- [ ] Implement both idle and absolute session timeouts
- [ ] Store session data server-side (Redis), not in client-side cookies
- [ ] Set HttpOnly, Secure, SameSite=Strict on session cookies
- [ ] Implement MFA with number matching (not simple approve/deny)
- [ ] Prefer TOTP/WebAuthn over SMS for MFA
- [ ] Use cryptographically secure tokens for password reset (32+ bytes)
- [ ] Hash reset tokens before storage, set short expiration (15 minutes)
- [ ] Invalidate all sessions on password change
- [ ] Implement anomaly detection for suspicious login patterns
- [ ] Log all authentication events (success and failure)
- [ ] Limit concurrent sessions per user
- [ ] Notify users of password changes and new device logins

## References

- CWE-287: Improper Authentication
- CWE-384: Session Fixation
- CWE-307: Improper Restriction of Excessive Authentication Attempts
- CWE-521: Weak Password Requirements
- CWE-613: Insufficient Session Expiration
- OWASP Authentication Cheat Sheet
- OWASP Session Management Cheat Sheet
- NIST SP 800-63B: Digital Identity Guidelines — Authentication
