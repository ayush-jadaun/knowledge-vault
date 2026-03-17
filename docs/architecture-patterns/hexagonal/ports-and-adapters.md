---
title: "Ports and Adapters"
description: "Deep dive into defining ports as TypeScript interfaces and implementing primary and secondary adapters — with a complete user management example"
tags: [hexagonal, ports, adapters, typescript, dependency-injection, testing]
difficulty: "intermediate"
prerequisites: ["architecture-patterns/hexagonal"]
lastReviewed: "2026-03-17"
---

# Ports and Adapters

The entire hexagonal architecture pattern reduces to two concepts: **ports** and **adapters**. Everything else is elaboration. A port is an interface — a named capability — that exists at the boundary of the application core. An adapter is a concrete implementation of that interface using real technology. Understanding these two concepts thoroughly is enough to apply the pattern effectively.

This page works through the complete mechanics using a user management application as the running example. By the end, you will have seen every kind of port and adapter and understand how they fit together.

## Defining a Port

A port is always an interface. In TypeScript, it is defined using the `interface` keyword (or occasionally an abstract class when shared behavior is needed). The port lives in the application core — usually in a `domain/ports/` or `application/ports/` directory — and it uses the application's own vocabulary, not the vocabulary of any external system.

The critical discipline: **a port must not contain any types from external libraries.** No TypeORM `Repository<T>`. No Prisma `PrismaClient`. No Express `Request`. If an external type appears in a port definition, the application core now implicitly depends on that library.

```typescript
// src/domain/ports/user.repository.ts
// This is a SECONDARY PORT (driven port) — the application drives it

import { User } from '../entities/user'
import { UserId } from '../value-objects/user-id'
import { Email } from '../value-objects/email'

export interface UserRepository {
  findById(id: UserId): Promise<User | null>
  findByEmail(email: Email): Promise<User | null>
  save(user: User): Promise<void>
  delete(id: UserId): Promise<void>
  existsByEmail(email: Email): Promise<boolean>
}
```

Notice what this interface does NOT contain:
- No SQL queries
- No database connection handles
- No TypeORM decorators
- No pagination using database-level `LIMIT/OFFSET` (that would expose database concepts; instead, design a domain-level `Paginated<T>` type if needed)
- No transaction handles (transactions are managed at the use case level — more on this later)

## Value Objects in Ports

The port uses `UserId` and `Email` — value objects from the domain — rather than primitive strings. This is intentional. Using `string` for an identifier type means the compiler cannot distinguish a user ID from an email address, a product ID, or a random string. Value objects provide type safety and encode domain constraints.

```typescript
// src/domain/value-objects/user-id.ts
export class UserId {
  private constructor(private readonly value: string) {}

  static generate(): UserId {
    return new UserId(crypto.randomUUID())
  }

  static from(value: string): UserId {
    if (!value || value.trim().length === 0) {
      throw new Error('UserId cannot be empty')
    }
    return new UserId(value)
  }

  toString(): string {
    return this.value
  }

  equals(other: UserId): boolean {
    return this.value === other.value
  }
}

// src/domain/value-objects/email.ts
export class Email {
  private constructor(private readonly value: string) {}

  static from(raw: string): Email {
    const normalized = raw.toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new InvalidEmailError(raw)
    }
    return new Email(normalized)
  }

  toString(): string {
    return this.value
  }

  equals(other: Email): boolean {
    return this.value === other.value
  }
}
```

## The User Entity

The domain entity encapsulates business rules and has no external dependencies:

```typescript
// src/domain/entities/user.ts
import { UserId } from '../value-objects/user-id'
import { Email } from '../value-objects/email'

export type UserRole = 'user' | 'admin' | 'moderator'

interface UserProps {
  id: UserId
  email: Email
  role: UserRole
  createdAt: Date
  passwordHash: string
  verifiedAt: Date | null
  bannedAt: Date | null
  banReason: string | null
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(params: { email: Email; passwordHash: string }): User {
    return new User({
      id: UserId.generate(),
      email: params.email,
      role: 'user',
      createdAt: new Date(),
      passwordHash: params.passwordHash,
      verifiedAt: null,
      bannedAt: null,
      banReason: null,
    })
  }

  static reconstitute(props: UserProps): User {
    return new User(props)
  }

  get id(): UserId { return this.props.id }
  get email(): Email { return this.props.email }
  get role(): UserRole { return this.props.role }
  get createdAt(): Date { return this.props.createdAt }
  get isVerified(): boolean { return this.props.verifiedAt !== null }
  get isBanned(): boolean { return this.props.bannedAt !== null }

  verify(): User {
    if (this.isVerified) throw new Error('User is already verified')
    return new User({ ...this.props, verifiedAt: new Date() })
  }

  ban(reason: string): User {
    if (this.isBanned) throw new Error('User is already banned')
    if (this.props.role === 'admin') throw new Error('Cannot ban an admin')
    return new User({ ...this.props, bannedAt: new Date(), banReason: reason })
  }

  promoteToAdmin(): User {
    return new User({ ...this.props, role: 'admin' })
  }

  verifyPassword(passwordHash: string): boolean {
    return this.props.passwordHash === passwordHash
  }
}
```

The `User` entity has no ORM decorators, no database annotations, and no framework imports. It is pure TypeScript. Business rules (cannot ban admins, cannot verify twice) live on the entity.

## Secondary Ports: All the Things the Application Needs

Beyond the repository, a user management application typically needs several other secondary ports:

```typescript
// src/domain/ports/email.service.ts
export interface EmailService {
  sendVerificationEmail(to: Email, verificationToken: string): Promise<void>
  sendPasswordResetEmail(to: Email, resetToken: string): Promise<void>
  sendWelcomeEmail(to: Email, userName: string): Promise<void>
}

// src/domain/ports/token.generator.ts
export interface TokenGenerator {
  generateVerificationToken(userId: UserId): string
  generatePasswordResetToken(userId: UserId): string
  verifyToken(token: string): { userId: string; type: 'verification' | 'reset' } | null
}

// src/domain/ports/password.hasher.ts
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>
  verify(plaintext: string, hash: string): Promise<boolean>
}

// src/domain/ports/event.publisher.ts
export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>
}
```

Each of these is a named capability. `EmailService` does not say "Nodemailer" or "SendGrid" — it expresses the application's need in the application's language. Multiple technologies can implement it.

## Primary Ports: What the Application Offers

Primary ports define the application's capabilities from the caller's perspective. Each use case or group of related operations becomes a primary port:

```typescript
// src/application/ports/user-management.port.ts
// PRIMARY PORTS — callers drive these

export interface RegisterUserPort {
  execute(command: RegisterUserCommand): Promise<RegisterUserResult>
}

export interface AuthenticateUserPort {
  execute(command: AuthenticateCommand): Promise<AuthenticateResult>
}

export interface BanUserPort {
  execute(command: BanUserCommand): Promise<void>
}

export interface VerifyEmailPort {
  execute(command: VerifyEmailCommand): Promise<void>
}

// Commands and results are simple data objects (no domain types exposed)
export interface RegisterUserCommand {
  email: string
  password: string
}

export interface RegisterUserResult {
  userId: string
  verificationToken: string
}

export interface AuthenticateCommand {
  email: string
  password: string
}

export interface AuthenticateResult {
  userId: string
  role: string
  sessionToken: string
}
```

Note that commands and results use primitive types (`string`) — they represent the boundary between the application core and the outside world. Domain objects (`UserId`, `Email`) stay inside the core.

## Application Services: Implementing Primary Ports

The application service implements the primary port and orchestrates domain entities and secondary ports:

```typescript
// src/application/services/register-user.service.ts
import { RegisterUserPort, RegisterUserCommand, RegisterUserResult } from '../ports/user-management.port'
import { UserRepository } from '../../domain/ports/user.repository'
import { PasswordHasher } from '../../domain/ports/password.hasher'
import { EmailService } from '../../domain/ports/email.service'
import { TokenGenerator } from '../../domain/ports/token.generator'
import { User } from '../../domain/entities/user'
import { Email } from '../../domain/value-objects/email'
import { UserAlreadyExistsError } from '../../domain/errors'

export class RegisterUserService implements RegisterUserPort {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailService: EmailService,
    private readonly tokenGenerator: TokenGenerator
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisterUserResult> {
    const email = Email.from(command.email) // validates email format

    if (await this.userRepo.existsByEmail(email)) {
      throw new UserAlreadyExistsError(command.email)
    }

    const passwordHash = await this.passwordHasher.hash(command.password)
    const user = User.create({ email, passwordHash })

    await this.userRepo.save(user)

    const verificationToken = this.tokenGenerator.generateVerificationToken(user.id)
    await this.emailService.sendVerificationEmail(email, verificationToken)

    return {
      userId: user.id.toString(),
      verificationToken,
    }
  }
}
```

This service:
- Implements the primary port (`RegisterUserPort`)
- Uses secondary ports through constructor injection
- Has zero framework dependencies
- Is fully testable without any infrastructure

## Primary Adapters: REST, GraphQL, CLI

A primary adapter translates an external protocol into calls on primary ports.

### REST Adapter

```typescript
// src/adapters/primary/http/register-user.handler.ts
import { Router, Request, Response, NextFunction } from 'express'
import { RegisterUserPort } from '../../../application/ports/user-management.port'
import { UserAlreadyExistsError } from '../../../domain/errors'

export function createRegisterUserHandler(registerUser: RegisterUserPort): Router {
  const router = Router()

  router.post('/users/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body

      if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' })
        return
      }

      const result = await registerUser.execute({ email, password })

      res.status(201).json({
        userId: result.userId,
        message: 'Registration successful. Check your email to verify your account.',
      })
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        res.status(409).json({ error: 'An account with that email already exists' })
        return
      }
      next(error) // pass to Express error handler
    }
  })

  return router
}
```

The REST adapter:
- Knows about HTTP (Express, status codes, JSON)
- Does NOT contain business logic
- Translates HTTP errors back from domain errors
- Calls the primary port interface, not the concrete service class

### GraphQL Adapter

```typescript
// src/adapters/primary/graphql/user.resolver.ts
import { RegisterUserPort } from '../../../application/ports/user-management.port'
import { UserAlreadyExistsError } from '../../../domain/errors'

// Using a hypothetical GraphQL resolver structure
export function createUserResolvers(registerUser: RegisterUserPort) {
  return {
    Mutation: {
      registerUser: async (
        _: unknown,
        args: { input: { email: string; password: string } }
      ) => {
        try {
          const result = await registerUser.execute(args.input)
          return { success: true, userId: result.userId }
        } catch (error) {
          if (error instanceof UserAlreadyExistsError) {
            return { success: false, error: 'EMAIL_TAKEN' }
          }
          throw error
        }
      },
    },
  }
}
```

### CLI Adapter

```typescript
// src/adapters/primary/cli/register-user.command.ts
import { Command } from 'commander'
import { RegisterUserPort } from '../../../application/ports/user-management.port'

export function createRegisterUserCommand(registerUser: RegisterUserPort): Command {
  const cmd = new Command('register')
    .description('Register a new user account')
    .requiredOption('-e, --email <email>', 'User email address')
    .requiredOption('-p, --password <password>', 'User password')
    .action(async (options) => {
      try {
        const result = await registerUser.execute({
          email: options.email,
          password: options.password,
        })
        console.log(`User registered successfully. ID: ${result.userId}`)
        console.log(`Verification token: ${result.verificationToken}`)
      } catch (error) {
        console.error(`Registration failed: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  return cmd
}
```

### Test Adapter

The test adapter is simply the test itself, calling the primary port directly:

```typescript
// src/application/services/__tests__/register-user.service.test.ts
import { RegisterUserService } from '../register-user.service'
import { InMemoryUserRepository } from '../../../adapters/secondary/in-memory/user.repository'
import { FakePasswordHasher } from '../../../adapters/secondary/fakes/password.hasher'
import { FakeEmailService } from '../../../adapters/secondary/fakes/email.service'
import { FakeTokenGenerator } from '../../../adapters/secondary/fakes/token.generator'

describe('RegisterUserService', () => {
  let sut: RegisterUserService
  let userRepo: InMemoryUserRepository
  let emailService: FakeEmailService

  beforeEach(() => {
    userRepo = new InMemoryUserRepository()
    emailService = new FakeEmailService()
    const hasher = new FakePasswordHasher()
    const tokens = new FakeTokenGenerator()
    sut = new RegisterUserService(userRepo, hasher, emailService, tokens)
  })

  it('creates a user with the provided email', async () => {
    const result = await sut.execute({
      email: 'alice@example.com',
      password: 'secure123',
    })
    const saved = await userRepo.findByEmail({ toString: () => 'alice@example.com' } as any)
    expect(saved).not.toBeNull()
    expect(result.userId).toBeDefined()
  })

  it('sends a verification email after registration', async () => {
    await sut.execute({ email: 'alice@example.com', password: 'secure123' })
    expect(emailService.sentEmails).toHaveLength(1)
    expect(emailService.sentEmails[0].type).toBe('verification')
    expect(emailService.sentEmails[0].to).toBe('alice@example.com')
  })

  it('throws UserAlreadyExistsError if email is taken', async () => {
    await sut.execute({ email: 'alice@example.com', password: 'secure123' })
    await expect(
      sut.execute({ email: 'alice@example.com', password: 'other123' })
    ).rejects.toThrow('UserAlreadyExistsError')
  })
})
```

## Secondary Adapters: Implementing the Ports

### PostgreSQL Adapter

```typescript
// src/adapters/secondary/postgres/user.repository.ts
import { Pool, PoolClient } from 'pg'
import { UserRepository } from '../../../domain/ports/user.repository'
import { User, UserRole } from '../../../domain/entities/user'
import { UserId } from '../../../domain/value-objects/user-id'
import { Email } from '../../../domain/value-objects/email'

interface UserRow {
  id: string
  email: string
  role: string
  created_at: Date
  password_hash: string
  verified_at: Date | null
  banned_at: Date | null
  ban_reason: string | null
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: UserId): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [id.toString()]
    )
    if (result.rows.length === 0) return null
    return this.mapToDomain(result.rows[0])
  }

  async findByEmail(email: Email): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      'SELECT * FROM users WHERE email = $1',
      [email.toString()]
    )
    if (result.rows.length === 0) return null
    return this.mapToDomain(result.rows[0])
  }

  async save(user: User): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id, email, role, created_at, password_hash, verified_at, banned_at, ban_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         verified_at = EXCLUDED.verified_at,
         banned_at = EXCLUDED.banned_at,
         ban_reason = EXCLUDED.ban_reason`,
      [
        user.id.toString(),
        user.email.toString(),
        user.role,
        user.createdAt,
        // Note: password hash requires accessing internal state
        // In practice, expose a toPersistence() method on the entity
        'hashed', // simplified here
        user.isVerified ? new Date() : null,
        user.isBanned ? new Date() : null,
        null,
      ]
    )
  }

  async delete(id: UserId): Promise<void> {
    await this.pool.query('DELETE FROM users WHERE id = $1', [id.toString()])
  }

  async existsByEmail(email: Email): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM users WHERE email = $1',
      [email.toString()]
    )
    return result.rows.length > 0
  }

  private mapToDomain(row: UserRow): User {
    return User.reconstitute({
      id: UserId.from(row.id),
      email: Email.from(row.email),
      role: row.role as UserRole,
      createdAt: row.created_at,
      passwordHash: row.password_hash,
      verifiedAt: row.verified_at,
      bannedAt: row.banned_at,
      banReason: row.ban_reason,
    })
  }
}
```

### In-Memory Adapter

The in-memory adapter is used in tests and local development:

```typescript
// src/adapters/secondary/in-memory/user.repository.ts
import { UserRepository } from '../../../domain/ports/user.repository'
import { User } from '../../../domain/entities/user'
import { UserId } from '../../../domain/value-objects/user-id'
import { Email } from '../../../domain/value-objects/email'

export class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, User>()

  async findById(id: UserId): Promise<User | null> {
    return this.store.get(id.toString()) ?? null
  }

  async findByEmail(email: Email): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email.equals(email)) return user
    }
    return null
  }

  async save(user: User): Promise<void> {
    this.store.set(user.id.toString(), user)
  }

  async delete(id: UserId): Promise<void> {
    this.store.delete(id.toString())
  }

  async existsByEmail(email: Email): Promise<boolean> {
    for (const user of this.store.values()) {
      if (user.email.equals(email)) return true
    }
    return false
  }

  // Test helpers
  get size(): number { return this.store.size }
  clear(): void { this.store.clear() }
  all(): User[] { return Array.from(this.store.values()) }
}
```

### Email Adapters: Multiple Adapters for the Same Port

A key flexibility of hexagonal architecture is having multiple adapters for the same port. For email, you might have a production SMTP adapter, a SendGrid adapter, and a development fake:

```typescript
// src/adapters/secondary/smtp/email.service.ts
import nodemailer from 'nodemailer'
import { EmailService } from '../../../domain/ports/email.service'
import { Email } from '../../../domain/value-objects/email'

export class SmtpEmailService implements EmailService {
  private transporter: nodemailer.Transporter

  constructor(private config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    })
  }

  async sendVerificationEmail(to: Email, token: string): Promise<void> {
    await this.transporter.sendMail({
      from: '"App" <noreply@example.com>',
      to: to.toString(),
      subject: 'Verify your email',
      html: `<p>Click <a href="https://app.example.com/verify?token=${token}">here</a> to verify.</p>`,
    })
  }

  async sendPasswordResetEmail(to: Email, token: string): Promise<void> {
    await this.transporter.sendMail({
      from: '"App" <noreply@example.com>',
      to: to.toString(),
      subject: 'Reset your password',
      html: `<p>Click <a href="https://app.example.com/reset?token=${token}">here</a> to reset.</p>`,
    })
  }

  async sendWelcomeEmail(to: Email, userName: string): Promise<void> {
    await this.transporter.sendMail({
      from: '"App" <noreply@example.com>',
      to: to.toString(),
      subject: `Welcome, ${userName}!`,
      html: `<p>Thanks for joining!</p>`,
    })
  }
}

// src/adapters/secondary/sendgrid/email.service.ts
import sgMail from '@sendgrid/mail'
import { EmailService } from '../../../domain/ports/email.service'
import { Email } from '../../../domain/value-objects/email'

export class SendGridEmailService implements EmailService {
  constructor(apiKey: string) {
    sgMail.setApiKey(apiKey)
  }

  async sendVerificationEmail(to: Email, token: string): Promise<void> {
    await sgMail.send({
      to: to.toString(),
      from: 'noreply@example.com',
      templateId: 'd-verification-template-id',
      dynamicTemplateData: { verificationToken: token },
    })
  }

  async sendPasswordResetEmail(to: Email, token: string): Promise<void> {
    await sgMail.send({
      to: to.toString(),
      from: 'noreply@example.com',
      templateId: 'd-reset-template-id',
      dynamicTemplateData: { resetToken: token },
    })
  }

  async sendWelcomeEmail(to: Email, userName: string): Promise<void> {
    await sgMail.send({
      to: to.toString(),
      from: 'noreply@example.com',
      templateId: 'd-welcome-template-id',
      dynamicTemplateData: { userName },
    })
  }
}
```

### Fake Adapters for Tests

Fake adapters simulate behavior without real infrastructure. They are richer than mocks — they maintain state and behave correctly:

```typescript
// src/adapters/secondary/fakes/email.service.ts
import { EmailService } from '../../../domain/ports/email.service'
import { Email } from '../../../domain/value-objects/email'

interface SentEmail {
  to: string
  type: 'verification' | 'reset' | 'welcome'
  token?: string
}

export class FakeEmailService implements EmailService {
  public sentEmails: SentEmail[] = []
  public shouldFailOnNext = false

  async sendVerificationEmail(to: Email, token: string): Promise<void> {
    if (this.shouldFailOnNext) {
      this.shouldFailOnNext = false
      throw new Error('Simulated email delivery failure')
    }
    this.sentEmails.push({ to: to.toString(), type: 'verification', token })
  }

  async sendPasswordResetEmail(to: Email, token: string): Promise<void> {
    this.sentEmails.push({ to: to.toString(), type: 'reset', token })
  }

  async sendWelcomeEmail(to: Email, userName: string): Promise<void> {
    this.sentEmails.push({ to: to.toString(), type: 'welcome' })
  }

  reset(): void {
    this.sentEmails = []
    this.shouldFailOnNext = false
  }
}
```

## The Adapter's Job: Translation

The adapter's one job is to translate between two languages. That translation has three parts:

1. **Incoming translation** (for secondary adapters): convert the domain's request (method call with domain objects) into the external system's request (SQL, HTTP, AMQP message)
2. **Outgoing translation** (for secondary adapters): convert the external system's response (database rows, HTTP JSON, queue messages) into domain objects
3. **Error translation** (for all adapters): convert infrastructure errors into domain errors or propagate them appropriately

Error translation deserves special attention. A `pg` database error (class `DatabaseError` from the `pg` library) must not bubble up through the application core — that would create a transitive dependency on the `pg` library throughout the codebase. The adapter catches infrastructure errors and translates them:

```typescript
// Error translation in the PostgresUserRepository
async save(user: User): Promise<void> {
  try {
    await this.pool.query(/* ... */)
  } catch (error: unknown) {
    if (error instanceof DatabaseError) {
      if (error.code === '23505') { // unique_violation
        throw new UserAlreadyExistsError(user.email.toString())
      }
      if (error.code === '57014') { // query_canceled
        throw new OperationTimeoutError('save user')
      }
    }
    throw new InfrastructureError('Failed to save user', { cause: error })
  }
}
```

## The Composition Root: Wiring in main.ts

The composition root is the only place in the application where adapters are instantiated and wired together. This is typically `src/main.ts` or `src/infrastructure/bootstrap.ts`:

```typescript
// src/main.ts
import { Pool } from 'pg'
import express from 'express'

// Secondary adapters
import { PostgresUserRepository } from './adapters/secondary/postgres/user.repository'
import { SmtpEmailService } from './adapters/secondary/smtp/email.service'
import { JwtTokenGenerator } from './adapters/secondary/jwt/token.generator'
import { BcryptPasswordHasher } from './adapters/secondary/bcrypt/password.hasher'

// Application services
import { RegisterUserService } from './application/services/register-user.service'
import { AuthenticateUserService } from './application/services/authenticate-user.service'
import { BanUserService } from './application/services/ban-user.service'

// Primary adapters
import { createRegisterUserHandler } from './adapters/primary/http/register-user.handler'
import { createAuthHandler } from './adapters/primary/http/auth.handler'

async function bootstrap() {
  // Infrastructure
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  // Secondary adapters
  const userRepo = new PostgresUserRepository(pool)
  const emailService = new SmtpEmailService({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT),
    secure: true,
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  })
  const tokenGenerator = new JwtTokenGenerator(process.env.JWT_SECRET!)
  const passwordHasher = new BcryptPasswordHasher(12)

  // Application services (primary port implementations)
  const registerUser = new RegisterUserService(userRepo, passwordHasher, emailService, tokenGenerator)
  const authenticateUser = new AuthenticateUserService(userRepo, passwordHasher, tokenGenerator)
  const banUser = new BanUserService(userRepo)

  // Primary adapters
  const app = express()
  app.use(express.json())
  app.use('/api', createRegisterUserHandler(registerUser))
  app.use('/api', createAuthHandler(authenticateUser))

  const port = process.env.PORT ?? 3000
  app.listen(port, () => {
    console.log(`Server running on port ${port}`)
  })
}

bootstrap().catch(console.error)
```

The composition root is the only file in the entire codebase that imports from both adapters and application services simultaneously. Every other file either lives in the core (importing only domain types) or in an adapter (importing only its external library and domain ports).

## Adapter Composition Strategies

### Strategy Pattern for Multiple Adapters

When you have multiple adapters for the same port (primary SMTP, fallback Mailgun), you can use the Strategy pattern or a decorator:

```typescript
// src/adapters/secondary/composite/resilient-email.service.ts
import { EmailService } from '../../../domain/ports/email.service'
import { Email } from '../../../domain/value-objects/email'

export class ResilientEmailService implements EmailService {
  constructor(
    private readonly primary: EmailService,
    private readonly fallback: EmailService
  ) {}

  async sendVerificationEmail(to: Email, token: string): Promise<void> {
    try {
      await this.primary.sendVerificationEmail(to, token)
    } catch (primaryError) {
      console.warn('Primary email service failed, trying fallback:', primaryError)
      try {
        await this.fallback.sendVerificationEmail(to, token)
      } catch (fallbackError) {
        throw new Error('All email services failed')
      }
    }
  }

  async sendPasswordResetEmail(to: Email, token: string): Promise<void> {
    try {
      await this.primary.sendPasswordResetEmail(to, token)
    } catch {
      await this.fallback.sendPasswordResetEmail(to, token)
    }
  }

  async sendWelcomeEmail(to: Email, userName: string): Promise<void> {
    try {
      await this.primary.sendWelcomeEmail(to, userName)
    } catch {
      await this.fallback.sendWelcomeEmail(to, userName)
    }
  }
}
```

This composite adapter implements the `EmailService` port. It is wired in `main.ts`:

```typescript
const primaryEmail = new SmtpEmailService(smtpConfig)
const fallbackEmail = new SendGridEmailService(apiKey)
const emailService = new ResilientEmailService(primaryEmail, fallbackEmail)
```

The application core never knows about the composite arrangement.

## Edge Cases and Failure Modes

### Adapter Implementing Only Part of a Port

If an adapter cannot implement all methods of a port, this is a sign the port is too broad. Split it:

```typescript
// Instead of one large UserRepository
interface UserReadRepository {
  findById(id: UserId): Promise<User | null>
  findByEmail(email: Email): Promise<User | null>
  existsByEmail(email: Email): Promise<boolean>
}

interface UserWriteRepository {
  save(user: User): Promise<void>
  delete(id: UserId): Promise<void>
}
```

This also aligns naturally with CQRS if you later need to separate read and write models.

### Transaction Management Across Multiple Repositories

When a use case needs to update multiple repositories in a single transaction, you need a Unit of Work pattern or a transaction-aware composition:

```typescript
// src/domain/ports/unit-of-work.ts
export interface UnitOfWork {
  userRepository: UserRepository
  orderRepository: OrderRepository
  run<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T>
}

// src/adapters/secondary/postgres/unit-of-work.ts
export class PostgresUnitOfWork implements UnitOfWork {
  private client: PoolClient | null = null

  constructor(private readonly pool: Pool) {}

  get userRepository(): UserRepository {
    if (!this.client) throw new Error('Not inside a transaction')
    return new PostgresUserRepository(this.client)
  }

  get orderRepository(): OrderRepository {
    if (!this.client) throw new Error('Not inside a transaction')
    return new PostgresOrderRepository(this.client)
  }

  async run<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    this.client = await this.pool.connect()
    try {
      await this.client.query('BEGIN')
      const result = await work(this)
      await this.client.query('COMMIT')
      return result
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    } finally {
      this.client.release()
      this.client = null
    }
  }
}
```

## Performance Characteristics

The port/adapter indirection adds one virtual method dispatch per call — essentially zero overhead in practice. The relevant performance considerations are:

- **Object allocation**: InMemory repositories allocate Maps; the GC pressure is negligible for typical application loads
- **Interface dispatch**: JavaScript/V8 handles interface dispatch through hidden class optimization; the overhead is unmeasurable in benchmarks
- **Adapter code paths**: The adapter code itself (SQL generation, JSON serialization) is the performance-critical path, not the dispatch

The pattern has no meaningful performance cost. Any bottleneck you observe will be in the adapter's implementation (slow SQL query, N+1 problem in the mapper) or in the external system, never in the port/adapter dispatch itself.

## War Story: Switching ORMs Without Breaking a Sweat

::: info War Story
A SaaS startup built their TypeScript backend with hexagonal architecture from day one. Their secondary adapters used TypeORM to implement repository ports. Eighteen months in, the TypeORM v0.3 migration (from v0.2) was causing problems — the new version had breaking changes in several critical areas, and the migration path was painful.

The team considered two options: painfully migrate from TypeORM v0.2 to v0.3, or rewrite the adapters using Prisma. Because their repository ports were clean interfaces with no TypeORM types leaking into the domain or application layers, the second option was viable.

They wrote new Prisma-based implementations of each repository port side by side with the TypeORM implementations. Tests (using in-memory adapters) continued passing throughout. Integration tests were duplicated to run against both implementations during the transition.

The swap in `main.ts` was a one-line change per repository. The entire ORM migration — from TypeORM to Prisma, affecting every database interaction in the application — took 3 days including testing. Zero application code (domain entities, application services, use cases) was touched.

The team lead told me afterward: "We built hexagonal architecture because it sounded like the right thing to do. We didn't realize the ORM migration was coming. When it did, we were incredibly grateful to past-us for being disciplined about those port interfaces."
:::

## Summary: Rules for Ports and Adapters

| Rule | Good | Bad |
|---|---|---|
| Port location | `domain/ports/` or `application/ports/` | Anywhere in adapters |
| Port types | Domain types or primitives only | External library types |
| Port naming | Describes capability (`UserRepository`) | Describes technology (`PostgresRepository`) |
| Adapter location | `adapters/primary/` or `adapters/secondary/` | Mixed with domain code |
| Composition root | `main.ts` or `bootstrap.ts` | Everywhere |
| Application service dependencies | Only ports (interfaces) | Concrete adapters |
| Test doubles | Implement port interface | Mock concrete adapters |
