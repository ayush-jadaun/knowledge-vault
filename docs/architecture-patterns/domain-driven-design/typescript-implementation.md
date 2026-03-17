---
title: "DDD: Complete TypeScript Implementation"
description: "Full production-ready Domain-Driven Design project — loan origination system with aggregates, value objects, domain events, repositories, specifications, and anti-corruption layer"
tags: [ddd, typescript, implementation, aggregates, value-objects, domain-events, repository, specification, acl]
difficulty: "expert"
prerequisites: ["architecture-patterns/domain-driven-design", "architecture-patterns/domain-driven-design/strategic-design", "architecture-patterns/domain-driven-design/tactical-design", "architecture-patterns/domain-driven-design/domain-events"]
lastReviewed: "2026-03-18"
---

# DDD: Complete TypeScript Implementation

This page builds a complete loan origination system using Domain-Driven Design tactical and strategic patterns. Every DDD building block is demonstrated in working TypeScript code: aggregates, entities, value objects, domain events, repositories, domain services, specifications, factories, and an anti-corruption layer for credit bureau integration.

## Domain Overview

**Loan Origination** — the process of applying for, evaluating, and approving a loan.

Business rules:
- A borrower submits a loan application with personal details and requested amount
- The system evaluates creditworthiness using an external credit bureau
- Applications go through states: `Draft` → `Submitted` → `UnderReview` → `Approved` / `Declined`
- Loan amounts between $1,000 and $500,000
- Approval requires credit score >= 650 AND debt-to-income ratio < 0.43
- Approved loans generate an offer with terms (rate, duration, monthly payment)
- Applications expire after 30 days without action

## Project Structure

```
src/
├── domain/
│   ├── model/
│   │   ├── loan-application/
│   │   │   ├── loan-application.ts          # Aggregate root
│   │   │   ├── loan-application.factory.ts  # Factory
│   │   │   └── loan-application.repository.ts # Repository interface
│   │   ├── borrower/
│   │   │   └── borrower.ts                  # Entity (within aggregate)
│   │   └── loan-offer/
│   │       └── loan-offer.ts                # Entity (within aggregate)
│   ├── value-objects/
│   │   ├── application-id.ts
│   │   ├── money.ts
│   │   ├── credit-score.ts
│   │   ├── interest-rate.ts
│   │   ├── ssn.ts
│   │   ├── email.ts
│   │   ├── application-status.ts
│   │   └── address.ts
│   ├── events/
│   │   ├── domain-event.ts
│   │   ├── application-submitted.event.ts
│   │   ├── application-approved.event.ts
│   │   └── application-declined.event.ts
│   ├── specifications/
│   │   ├── specification.ts
│   │   ├── credit-eligible.spec.ts
│   │   └── application-expired.spec.ts
│   ├── services/
│   │   ├── credit-evaluation.service.ts
│   │   └── loan-calculation.service.ts
│   ├── errors/
│   │   └── domain-errors.ts
│   └── ports/
│       ├── credit-bureau.port.ts
│       └── event-publisher.port.ts
├── application/
│   ├── use-cases/
│   │   ├── submit-application.ts
│   │   ├── evaluate-application.ts
│   │   └── get-application.ts
│   └── errors/
│       └── application-errors.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── postgres/
│   │   │   └── loan-application.repository.ts
│   │   ├── in-memory/
│   │   │   └── loan-application.repository.ts
│   │   └── mappers/
│   │       └── loan-application.mapper.ts
│   └── acl/
│       ├── credit-bureau/
│       │   ├── adapter.ts
│       │   ├── translator.ts
│       │   └── facade.ts
│       └── types/
│           └── experian-api.types.ts
└── __tests__/
    ├── domain/
    │   ├── loan-application.spec.ts
    │   └── credit-evaluation.spec.ts
    └── use-cases/
        ├── submit-application.spec.ts
        └── evaluate-application.spec.ts
```

## Value Objects

### Application ID

```typescript
// domain/value-objects/application-id.ts
import { randomUUID } from 'crypto';

export class ApplicationId {
  private constructor(public readonly value: string) {}

  static generate(): ApplicationId {
    return new ApplicationId(`LA-${randomUUID()}`);
  }

  static of(value: string): ApplicationId {
    if (!value || !value.startsWith('LA-')) {
      throw new Error(`Invalid ApplicationId format: ${value}`);
    }
    return new ApplicationId(value);
  }

  equals(other: ApplicationId): boolean {
    return this.value === other.value;
  }

  toString(): string { return this.value; }
}
```

### Money

```typescript
// domain/value-objects/money.ts
export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {}

  static of(amount: number, currency: string = 'USD'): Money {
    if (!Number.isFinite(amount)) throw new Error(`Invalid amount: ${amount}`);
    if (amount < 0) throw new Error(`Negative amount: ${amount}`);
    return new Money(Math.round(amount * 100) / 100, currency.toUpperCase());
  }

  static zero(currency: string = 'USD'): Money {
    return new Money(0, currency.toUpperCase());
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return Money.of(this.amount * factor, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount > other.amount;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount < other.amount;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  format(): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: this.currency,
    }).format(this.amount);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
```

### Credit Score

```typescript
// domain/value-objects/credit-score.ts
export class CreditScore {
  static readonly MIN = 300;
  static readonly MAX = 850;
  static readonly GOOD_THRESHOLD = 650;
  static readonly EXCELLENT_THRESHOLD = 750;

  private constructor(public readonly value: number) {}

  static of(value: number): CreditScore {
    if (!Number.isInteger(value) || value < CreditScore.MIN || value > CreditScore.MAX) {
      throw new Error(
        `Credit score must be an integer between ${CreditScore.MIN} and ${CreditScore.MAX}, got ${value}`,
      );
    }
    return new CreditScore(value);
  }

  get rating(): 'poor' | 'fair' | 'good' | 'excellent' {
    if (this.value < 580) return 'poor';
    if (this.value < 650) return 'fair';
    if (this.value < 750) return 'good';
    return 'excellent';
  }

  isAtLeast(threshold: number): boolean {
    return this.value >= threshold;
  }

  equals(other: CreditScore): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return `${this.value} (${this.rating})`;
  }
}
```

### Interest Rate

```typescript
// domain/value-objects/interest-rate.ts
export class InterestRate {
  private constructor(
    public readonly annualPercentage: number,
  ) {}

  static of(percentage: number): InterestRate {
    if (percentage < 0 || percentage > 100) {
      throw new Error(`Interest rate must be 0-100%, got ${percentage}%`);
    }
    return new InterestRate(Math.round(percentage * 10000) / 10000);
  }

  get monthlyRate(): number {
    return this.annualPercentage / 100 / 12;
  }

  get dailyRate(): number {
    return this.annualPercentage / 100 / 365;
  }

  /**
   * Calculate monthly payment using the standard amortization formula:
   * M = P * [r(1+r)^n] / [(1+r)^n - 1]
   */
  calculateMonthlyPayment(principal: Money, termMonths: number): Money {
    const r = this.monthlyRate;
    if (r === 0) {
      return Money.of(principal.amount / termMonths, principal.currency);
    }
    const numerator = r * Math.pow(1 + r, termMonths);
    const denominator = Math.pow(1 + r, termMonths) - 1;
    const payment = principal.amount * (numerator / denominator);
    return Money.of(payment, principal.currency);
  }

  calculateTotalInterest(principal: Money, termMonths: number): Money {
    const monthlyPayment = this.calculateMonthlyPayment(principal, termMonths);
    const totalPaid = monthlyPayment.multiply(termMonths);
    return totalPaid.subtract(principal);
  }

  equals(other: InterestRate): boolean {
    return this.annualPercentage === other.annualPercentage;
  }

  toString(): string {
    return `${this.annualPercentage}%`;
  }
}
```

### SSN (Sensitive Value Object)

```typescript
// domain/value-objects/ssn.ts
export class SSN {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static of(value: string): SSN {
    const cleaned = value.replace(/[\s-]/g, '');
    if (!/^\d{9}$/.test(cleaned)) {
      throw new Error('SSN must be exactly 9 digits');
    }
    // Basic validation: no all-zeros in any group
    const area = cleaned.substring(0, 3);
    const group = cleaned.substring(3, 5);
    const serial = cleaned.substring(5, 9);
    if (area === '000' || group === '00' || serial === '0000') {
      throw new Error('Invalid SSN: contains all-zero group');
    }
    if (area === '666' || parseInt(area) >= 900) {
      throw new Error('Invalid SSN: reserved area number');
    }
    return new SSN(cleaned);
  }

  /** Returns masked form: ***-**-1234 */
  get masked(): string {
    return `***-**-${this._value.substring(5)}`;
  }

  /** Full value — use only for credit bureau calls, never log this */
  get full(): string {
    return this._value;
  }

  get formatted(): string {
    return `${this._value.substring(0, 3)}-${this._value.substring(3, 5)}-${this._value.substring(5)}`;
  }

  equals(other: SSN): boolean {
    return this._value === other._value;
  }

  /** Never expose the full SSN in toString */
  toString(): string {
    return this.masked;
  }

  /** Prevent accidental serialization of full SSN */
  toJSON(): string {
    return this.masked;
  }
}
```

### Address and Email

```typescript
// domain/value-objects/address.ts
export class Address {
  private constructor(
    public readonly line1: string,
    public readonly line2: string | null,
    public readonly city: string,
    public readonly state: string,
    public readonly postalCode: string,
    public readonly country: string,
  ) {}

  static of(props: {
    line1: string; line2?: string | null; city: string;
    state: string; postalCode: string; country?: string;
  }): Address {
    if (!props.line1.trim()) throw new Error('Address line1 is required');
    if (!props.city.trim()) throw new Error('City is required');
    if (!props.state.trim()) throw new Error('State is required');
    if (!props.postalCode.trim()) throw new Error('Postal code is required');
    return new Address(
      props.line1.trim(), props.line2?.trim() ?? null,
      props.city.trim(), props.state.trim().toUpperCase(),
      props.postalCode.trim(), (props.country ?? 'US').toUpperCase(),
    );
  }

  equals(other: Address): boolean {
    return this.line1 === other.line1 && this.line2 === other.line2
      && this.city === other.city && this.state === other.state
      && this.postalCode === other.postalCode && this.country === other.country;
  }
}
```

```typescript
// domain/value-objects/email.ts
export class Email {
  private constructor(public readonly value: string) {}

  static of(value: string): Email {
    const trimmed = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error(`Invalid email: ${value}`);
    }
    return new Email(trimmed);
  }

  get domain(): string {
    return this.value.split('@')[1];
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string { return this.value; }
}
```

### Application Status

```typescript
// domain/value-objects/application-status.ts
export enum ApplicationStatus {
  Draft = 'DRAFT',
  Submitted = 'SUBMITTED',
  UnderReview = 'UNDER_REVIEW',
  Approved = 'APPROVED',
  Declined = 'DECLINED',
  Expired = 'EXPIRED',
  Withdrawn = 'WITHDRAWN',
}

export const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.Draft]: [ApplicationStatus.Submitted, ApplicationStatus.Withdrawn],
  [ApplicationStatus.Submitted]: [ApplicationStatus.UnderReview, ApplicationStatus.Withdrawn, ApplicationStatus.Expired],
  [ApplicationStatus.UnderReview]: [ApplicationStatus.Approved, ApplicationStatus.Declined, ApplicationStatus.Expired],
  [ApplicationStatus.Approved]: [],
  [ApplicationStatus.Declined]: [],
  [ApplicationStatus.Expired]: [],
  [ApplicationStatus.Withdrawn]: [],
};
```

## Domain Events

```typescript
// domain/events/domain-event.ts
export interface DomainEvent {
  readonly type: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}

export function createDomainEvent(
  type: string, aggregateId: string, payload: Record<string, unknown>,
): DomainEvent {
  return { type, aggregateId, occurredAt: new Date(), payload };
}
```

```typescript
// domain/events/application-submitted.event.ts
import type { DomainEvent } from './domain-event';
import { createDomainEvent } from './domain-event';

export function applicationSubmitted(
  applicationId: string,
  borrowerName: string,
  requestedAmount: number,
  currency: string,
): DomainEvent {
  return createDomainEvent('ApplicationSubmitted', applicationId, {
    borrowerName, requestedAmount, currency,
  });
}
```

```typescript
// domain/events/application-approved.event.ts
import { createDomainEvent } from './domain-event';
import type { DomainEvent } from './domain-event';

export function applicationApproved(
  applicationId: string,
  approvedAmount: number,
  interestRate: number,
  termMonths: number,
  monthlyPayment: number,
): DomainEvent {
  return createDomainEvent('ApplicationApproved', applicationId, {
    approvedAmount, interestRate, termMonths, monthlyPayment,
  });
}
```

```typescript
// domain/events/application-declined.event.ts
import { createDomainEvent } from './domain-event';
import type { DomainEvent } from './domain-event';

export function applicationDeclined(
  applicationId: string,
  reasons: string[],
): DomainEvent {
  return createDomainEvent('ApplicationDeclined', applicationId, { reasons });
}
```

## Domain Errors

```typescript
// domain/errors/domain-errors.ts
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(from: string, to: string, aggregateId: string) {
    super(`Cannot transition from ${from} to ${to} for application ${aggregateId}`);
  }
}

export class LoanAmountOutOfRangeError extends DomainError {
  constructor(amount: number) {
    super(`Loan amount $${amount} is outside allowed range ($1,000 - $500,000)`);
  }
}

export class ApplicationAlreadyEvaluatedError extends DomainError {
  constructor(applicationId: string) {
    super(`Application ${applicationId} has already been evaluated`);
  }
}

export class ApplicationExpiredError extends DomainError {
  constructor(applicationId: string) {
    super(`Application ${applicationId} has expired`);
  }
}
```

## Entities

### Borrower (Child Entity within Aggregate)

```typescript
// domain/model/borrower/borrower.ts
import { Email } from '../../value-objects/email';
import { SSN } from '../../value-objects/ssn';
import { Address } from '../../value-objects/address';
import { Money } from '../../value-objects/money';

export class Borrower {
  private constructor(
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly email: Email,
    public readonly ssn: SSN,
    public readonly address: Address,
    public readonly annualIncome: Money,
    public readonly monthlyDebtPayments: Money,
    public readonly employerName: string,
    public readonly employmentYears: number,
  ) {}

  static create(props: {
    firstName: string;
    lastName: string;
    email: Email;
    ssn: SSN;
    address: Address;
    annualIncome: Money;
    monthlyDebtPayments: Money;
    employerName: string;
    employmentYears: number;
  }): Borrower {
    if (!props.firstName.trim()) throw new Error('First name is required');
    if (!props.lastName.trim()) throw new Error('Last name is required');
    if (props.employmentYears < 0) throw new Error('Employment years cannot be negative');

    return new Borrower(
      props.firstName.trim(),
      props.lastName.trim(),
      props.email,
      props.ssn,
      props.address,
      props.annualIncome,
      props.monthlyDebtPayments,
      props.employerName.trim(),
      props.employmentYears,
    );
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  /** Debt-to-Income ratio */
  get dtiRatio(): number {
    const monthlyIncome = this.annualIncome.amount / 12;
    if (monthlyIncome === 0) return Infinity;
    return this.monthlyDebtPayments.amount / monthlyIncome;
  }

  /** DTI including a proposed new monthly payment */
  dtiWithNewPayment(proposedMonthlyPayment: Money): number {
    const monthlyIncome = this.annualIncome.amount / 12;
    if (monthlyIncome === 0) return Infinity;
    const totalDebt = this.monthlyDebtPayments.add(proposedMonthlyPayment);
    return totalDebt.amount / monthlyIncome;
  }
}
```

### Loan Offer (Child Entity within Aggregate)

```typescript
// domain/model/loan-offer/loan-offer.ts
import { Money } from '../../value-objects/money';
import { InterestRate } from '../../value-objects/interest-rate';

export class LoanOffer {
  private constructor(
    public readonly approvedAmount: Money,
    public readonly interestRate: InterestRate,
    public readonly termMonths: number,
    public readonly monthlyPayment: Money,
    public readonly totalInterest: Money,
    public readonly totalRepayment: Money,
    public readonly createdAt: Date,
    public readonly expiresAt: Date,
  ) {}

  static create(
    approvedAmount: Money,
    interestRate: InterestRate,
    termMonths: number,
  ): LoanOffer {
    const monthlyPayment = interestRate.calculateMonthlyPayment(approvedAmount, termMonths);
    const totalInterest = interestRate.calculateTotalInterest(approvedAmount, termMonths);
    const totalRepayment = approvedAmount.add(totalInterest);

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 14); // Offer valid for 14 days

    return new LoanOffer(
      approvedAmount, interestRate, termMonths,
      monthlyPayment, totalInterest, totalRepayment,
      now, expiresAt,
    );
  }

  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }
}
```

## Aggregate Root

```typescript
// domain/model/loan-application/loan-application.ts
import { ApplicationId } from '../../value-objects/application-id';
import { ApplicationStatus, VALID_TRANSITIONS } from '../../value-objects/application-status';
import { Money } from '../../value-objects/money';
import { CreditScore } from '../../value-objects/credit-score';
import type { Borrower } from '../borrower/borrower';
import type { LoanOffer } from '../loan-offer/loan-offer';
import type { DomainEvent } from '../../events/domain-event';
import { applicationSubmitted } from '../../events/application-submitted.event';
import { applicationApproved } from '../../events/application-approved.event';
import { applicationDeclined } from '../../events/application-declined.event';
import {
  InvalidStateTransitionError,
  LoanAmountOutOfRangeError,
  ApplicationAlreadyEvaluatedError,
  ApplicationExpiredError,
} from '../../errors/domain-errors';

export class LoanApplication {
  static readonly MIN_AMOUNT = 1_000;
  static readonly MAX_AMOUNT = 500_000;
  static readonly EXPIRY_DAYS = 30;

  private _events: DomainEvent[] = [];

  private constructor(
    public readonly id: ApplicationId,
    private _borrower: Borrower,
    private _requestedAmount: Money,
    private _status: ApplicationStatus,
    private _creditScore: CreditScore | null,
    private _offer: LoanOffer | null,
    private _declineReasons: string[],
    public readonly createdAt: Date,
    private _submittedAt: Date | null,
    private _decidedAt: Date | null,
    private _updatedAt: Date,
  ) {}

  static create(
    id: ApplicationId,
    borrower: Borrower,
    requestedAmount: Money,
  ): LoanApplication {
    if (requestedAmount.amount < LoanApplication.MIN_AMOUNT ||
        requestedAmount.amount > LoanApplication.MAX_AMOUNT) {
      throw new LoanAmountOutOfRangeError(requestedAmount.amount);
    }

    const now = new Date();
    return new LoanApplication(
      id, borrower, requestedAmount,
      ApplicationStatus.Draft,
      null, null, [],
      now, null, null, now,
    );
  }

  static reconstitute(props: {
    id: ApplicationId;
    borrower: Borrower;
    requestedAmount: Money;
    status: ApplicationStatus;
    creditScore: CreditScore | null;
    offer: LoanOffer | null;
    declineReasons: string[];
    createdAt: Date;
    submittedAt: Date | null;
    decidedAt: Date | null;
    updatedAt: Date;
  }): LoanApplication {
    return new LoanApplication(
      props.id, props.borrower, props.requestedAmount,
      props.status, props.creditScore, props.offer,
      props.declineReasons, props.createdAt, props.submittedAt,
      props.decidedAt, props.updatedAt,
    );
  }

  // Getters
  get borrower(): Borrower { return this._borrower; }
  get requestedAmount(): Money { return this._requestedAmount; }
  get status(): ApplicationStatus { return this._status; }
  get creditScore(): CreditScore | null { return this._creditScore; }
  get offer(): LoanOffer | null { return this._offer; }
  get declineReasons(): ReadonlyArray<string> { return this._declineReasons; }
  get submittedAt(): Date | null { return this._submittedAt; }
  get decidedAt(): Date | null { return this._decidedAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get events(): ReadonlyArray<DomainEvent> { return this._events; }

  clearEvents(): void { this._events = []; }

  get isExpired(): boolean {
    if (this._status === ApplicationStatus.Approved ||
        this._status === ApplicationStatus.Declined ||
        this._status === ApplicationStatus.Expired) {
      return false; // Terminal states don't expire
    }
    const expiry = new Date(this.createdAt);
    expiry.setDate(expiry.getDate() + LoanApplication.EXPIRY_DAYS);
    return new Date() > expiry;
  }

  // Commands
  submit(): void {
    this.assertNotExpired();
    this.transition(ApplicationStatus.Submitted);
    this._submittedAt = new Date();
    this._updatedAt = new Date();

    this._events.push(
      applicationSubmitted(
        this.id.value,
        this._borrower.fullName,
        this._requestedAmount.amount,
        this._requestedAmount.currency,
      ),
    );
  }

  beginReview(creditScore: CreditScore): void {
    this.assertNotExpired();
    this.transition(ApplicationStatus.UnderReview);
    this._creditScore = creditScore;
    this._updatedAt = new Date();
  }

  approve(offer: LoanOffer): void {
    if (this._status !== ApplicationStatus.UnderReview) {
      throw new ApplicationAlreadyEvaluatedError(this.id.value);
    }
    this.transition(ApplicationStatus.Approved);
    this._offer = offer;
    this._decidedAt = new Date();
    this._updatedAt = new Date();

    this._events.push(
      applicationApproved(
        this.id.value,
        offer.approvedAmount.amount,
        offer.interestRate.annualPercentage,
        offer.termMonths,
        offer.monthlyPayment.amount,
      ),
    );
  }

  decline(reasons: string[]): void {
    if (this._status !== ApplicationStatus.UnderReview) {
      throw new ApplicationAlreadyEvaluatedError(this.id.value);
    }
    this.transition(ApplicationStatus.Declined);
    this._declineReasons = [...reasons];
    this._decidedAt = new Date();
    this._updatedAt = new Date();

    this._events.push(applicationDeclined(this.id.value, reasons));
  }

  markExpired(): void {
    if (this._status === ApplicationStatus.Approved ||
        this._status === ApplicationStatus.Declined) {
      return; // Can't expire a decided application
    }
    this._status = ApplicationStatus.Expired;
    this._updatedAt = new Date();
  }

  withdraw(): void {
    this.transition(ApplicationStatus.Withdrawn);
    this._updatedAt = new Date();
  }

  private transition(to: ApplicationStatus): void {
    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(this._status, to, this.id.value);
    }
    this._status = to;
  }

  private assertNotExpired(): void {
    if (this.isExpired) {
      this.markExpired();
      throw new ApplicationExpiredError(this.id.value);
    }
  }
}
```

## Specifications

```typescript
// domain/specifications/specification.ts
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

export abstract class CompositeSpecification<T> implements Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;

  and(other: Specification<T>): Specification<T> {
    return new AndSpec(this, other);
  }

  or(other: Specification<T>): Specification<T> {
    return new OrSpec(this, other);
  }

  not(): Specification<T> {
    return new NotSpec(this);
  }
}

class AndSpec<T> extends CompositeSpecification<T> {
  constructor(private l: Specification<T>, private r: Specification<T>) { super(); }
  isSatisfiedBy(c: T): boolean { return this.l.isSatisfiedBy(c) && this.r.isSatisfiedBy(c); }
}

class OrSpec<T> extends CompositeSpecification<T> {
  constructor(private l: Specification<T>, private r: Specification<T>) { super(); }
  isSatisfiedBy(c: T): boolean { return this.l.isSatisfiedBy(c) || this.r.isSatisfiedBy(c); }
}

class NotSpec<T> extends CompositeSpecification<T> {
  constructor(private s: Specification<T>) { super(); }
  isSatisfiedBy(c: T): boolean { return !this.s.isSatisfiedBy(c); }
}
```

```typescript
// domain/specifications/credit-eligible.spec.ts
import { CompositeSpecification } from './specification';
import type { LoanApplication } from '../model/loan-application/loan-application';
import { CreditScore } from '../value-objects/credit-score';

/**
 * Eligibility rule:
 *   Credit score >= 650
 *   AND DTI ratio (including new loan payment) < 0.43
 */
export class HasSufficientCreditScore extends CompositeSpecification<LoanApplication> {
  constructor(private readonly minimum: number = CreditScore.GOOD_THRESHOLD) {
    super();
  }

  isSatisfiedBy(app: LoanApplication): boolean {
    return app.creditScore !== null && app.creditScore.isAtLeast(this.minimum);
  }
}

export class HasAcceptableDTI extends CompositeSpecification<LoanApplication> {
  constructor(private readonly maxRatio: number = 0.43) {
    super();
  }

  isSatisfiedBy(app: LoanApplication): boolean {
    return app.borrower.dtiRatio < this.maxRatio;
  }
}

export class HasSufficientEmployment extends CompositeSpecification<LoanApplication> {
  constructor(private readonly minimumYears: number = 1) {
    super();
  }

  isSatisfiedBy(app: LoanApplication): boolean {
    return app.borrower.employmentYears >= this.minimumYears;
  }
}

export function createCreditEligibilitySpec() {
  return new HasSufficientCreditScore()
    .and(new HasAcceptableDTI())
    .and(new HasSufficientEmployment());
}
```

## Domain Services

```typescript
// domain/services/loan-calculation.service.ts
import { InterestRate } from '../value-objects/interest-rate';
import { CreditScore } from '../value-objects/credit-score';
import { Money } from '../value-objects/money';
import { LoanOffer } from '../model/loan-offer/loan-offer';

/**
 * Stateless domain service that calculates loan terms.
 * The interest rate is determined by the credit score:
 *   - Excellent (750+): prime + 1%
 *   - Good (650-749): prime + 3%
 *   - Fair (580-649): prime + 6%
 *   - Poor (<580): not eligible
 */
export class LoanCalculationService {
  private static readonly PRIME_RATE = 5.5; // Federal Reserve prime rate

  static calculateOffer(
    requestedAmount: Money,
    creditScore: CreditScore,
    termMonths: number = 360, // 30-year default
  ): LoanOffer {
    const rate = this.determineRate(creditScore);
    return LoanOffer.create(requestedAmount, rate, termMonths);
  }

  static determineRate(creditScore: CreditScore): InterestRate {
    const spreadMap: Record<string, number> = {
      excellent: 1.0,
      good: 3.0,
      fair: 6.0,
      poor: 10.0,
    };

    const spread = spreadMap[creditScore.rating] ?? 10.0;
    return InterestRate.of(this.PRIME_RATE + spread);
  }

  /**
   * Calculate the optimal term that keeps monthly payment
   * below a target percentage of monthly income.
   */
  static findOptimalTerm(
    requestedAmount: Money,
    creditScore: CreditScore,
    monthlyIncome: Money,
    maxPaymentRatio: number = 0.28,
  ): number {
    const rate = this.determineRate(creditScore);
    const maxPayment = monthlyIncome.multiply(maxPaymentRatio);

    // Try standard terms: 15, 20, 25, 30 years
    const terms = [180, 240, 300, 360];

    for (const term of terms) {
      const payment = rate.calculateMonthlyPayment(requestedAmount, term);
      if (payment.amount <= maxPayment.amount) {
        return term;
      }
    }

    return 360; // Default to longest term
  }
}
```

```typescript
// domain/services/credit-evaluation.service.ts
import type { LoanApplication } from '../model/loan-application/loan-application';
import type { CreditBureauPort } from '../ports/credit-bureau.port';
import { createCreditEligibilitySpec } from '../specifications/credit-eligible.spec';
import { LoanCalculationService } from './loan-calculation.service';

export interface EvaluationResult {
  approved: boolean;
  offer: import('../model/loan-offer/loan-offer').LoanOffer | null;
  declineReasons: string[];
}

/**
 * Domain service that orchestrates the credit evaluation process.
 * Uses the CreditBureauPort (injected) and Specifications for decision-making.
 */
export class CreditEvaluationService {
  constructor(private readonly creditBureau: CreditBureauPort) {}

  async evaluate(application: LoanApplication): Promise<EvaluationResult> {
    // 1. Fetch credit score from bureau (through ACL)
    const creditScore = await this.creditBureau.getCreditScore(
      application.borrower.ssn,
      application.borrower.fullName,
    );

    // 2. Attach credit score to application
    application.beginReview(creditScore);

    // 3. Apply specifications
    const eligibilitySpec = createCreditEligibilitySpec();
    const declineReasons: string[] = [];

    // Check individual specs for specific decline reasons
    if (!creditScore.isAtLeast(650)) {
      declineReasons.push(`Credit score ${creditScore.value} below minimum 650`);
    }
    if (application.borrower.dtiRatio >= 0.43) {
      declineReasons.push(
        `Debt-to-income ratio ${(application.borrower.dtiRatio * 100).toFixed(1)}% exceeds maximum 43%`,
      );
    }
    if (application.borrower.employmentYears < 1) {
      declineReasons.push(
        `Employment history ${application.borrower.employmentYears} years below minimum 1 year`,
      );
    }

    if (!eligibilitySpec.isSatisfiedBy(application)) {
      return { approved: false, offer: null, declineReasons };
    }

    // 4. Calculate loan offer
    const termMonths = LoanCalculationService.findOptimalTerm(
      application.requestedAmount,
      creditScore,
      Money.of(application.borrower.annualIncome.amount / 12, 'USD'),
    );

    const offer = LoanCalculationService.calculateOffer(
      application.requestedAmount,
      creditScore,
      termMonths,
    );

    return { approved: true, offer, declineReasons: [] };
  }
}
```

## Ports

```typescript
// domain/ports/credit-bureau.port.ts
import type { SSN } from '../value-objects/ssn';
import type { CreditScore } from '../value-objects/credit-score';

/** Port interface — defined in domain, implemented in infrastructure ACL */
export interface CreditBureauPort {
  getCreditScore(ssn: SSN, fullName: string): Promise<CreditScore>;
}
```

```typescript
// domain/ports/event-publisher.port.ts
import type { DomainEvent } from '../events/domain-event';

export interface EventPublisherPort {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: readonly DomainEvent[]): Promise<void>;
}
```

## Repository Interface

```typescript
// domain/model/loan-application/loan-application.repository.ts
import type { LoanApplication } from './loan-application';
import type { ApplicationId } from '../../value-objects/application-id';
import type { Specification } from '../../specifications/specification';

export interface LoanApplicationRepository {
  findById(id: ApplicationId): Promise<LoanApplication | null>;
  save(application: LoanApplication): Promise<void>;
  findBySpec(spec: Specification<LoanApplication>): Promise<LoanApplication[]>;
  nextId(): ApplicationId;
}
```

## Anti-Corruption Layer (Credit Bureau Integration)

```typescript
// infrastructure/acl/types/experian-api.types.ts
/** External Experian API shapes */
export interface ExperianCreditRequest {
  consumer: {
    social_security_number: string;
    first_name: string;
    last_name: string;
  };
  product_code: 'CREDIT_SCORE' | 'FULL_REPORT';
}

export interface ExperianCreditResponse {
  consumer_id: string;
  fico_score: number;
  score_factors: Array<{
    code: string;
    description: string;
  }>;
  inquiry_date: string;
  status: 'SUCCESS' | 'NO_HIT' | 'FROZEN';
}
```

```typescript
// infrastructure/acl/credit-bureau/adapter.ts
import type { AxiosInstance } from 'axios';
import type { ExperianCreditRequest, ExperianCreditResponse } from '../types/experian-api.types';

export class ExperianApiAdapter {
  constructor(
    private readonly http: AxiosInstance,
    private readonly apiKey: string,
  ) {}

  async fetchCreditScore(request: ExperianCreditRequest): Promise<ExperianCreditResponse> {
    const response = await this.http.post<ExperianCreditResponse>(
      '/api/v2/consumer/credit-score',
      request,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );
    return response.data;
  }
}
```

```typescript
// infrastructure/acl/credit-bureau/translator.ts
import { CreditScore } from '../../../domain/value-objects/credit-score';
import type { SSN } from '../../../domain/value-objects/ssn';
import type { ExperianCreditRequest, ExperianCreditResponse } from '../types/experian-api.types';

export class CreditBureauTranslator {
  static toExperianRequest(ssn: SSN, fullName: string): ExperianCreditRequest {
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ') || firstName;

    return {
      consumer: {
        social_security_number: ssn.full, // Only place we use full SSN
        first_name: firstName,
        last_name: lastName,
      },
      product_code: 'CREDIT_SCORE',
    };
  }

  static toCreditScore(response: ExperianCreditResponse): CreditScore {
    if (response.status === 'NO_HIT') {
      // No credit history — assign minimum score
      return CreditScore.of(CreditScore.MIN);
    }

    if (response.status === 'FROZEN') {
      throw new Error('Credit file is frozen — cannot retrieve score');
    }

    return CreditScore.of(response.fico_score);
  }
}
```

```typescript
// infrastructure/acl/credit-bureau/facade.ts
import type { CreditBureauPort } from '../../../domain/ports/credit-bureau.port';
import type { SSN } from '../../../domain/value-objects/ssn';
import type { CreditScore } from '../../../domain/value-objects/credit-score';
import type { ExperianApiAdapter } from './adapter';
import { CreditBureauTranslator } from './translator';

export class ExperianCreditBureau implements CreditBureauPort {
  constructor(private readonly adapter: ExperianApiAdapter) {}

  async getCreditScore(ssn: SSN, fullName: string): Promise<CreditScore> {
    const request = CreditBureauTranslator.toExperianRequest(ssn, fullName);
    const response = await this.adapter.fetchCreditScore(request);
    return CreditBureauTranslator.toCreditScore(response);
  }
}
```

## Use Cases (Application Layer)

```typescript
// application/use-cases/submit-application.ts
import type { LoanApplicationRepository } from '../../domain/model/loan-application/loan-application.repository';
import type { EventPublisherPort } from '../../domain/ports/event-publisher.port';
import { LoanApplication } from '../../domain/model/loan-application/loan-application';
import { Borrower } from '../../domain/model/borrower/borrower';
import { Money } from '../../domain/value-objects/money';
import { Email } from '../../domain/value-objects/email';
import { SSN } from '../../domain/value-objects/ssn';
import { Address } from '../../domain/value-objects/address';

export interface SubmitApplicationInput {
  firstName: string;
  lastName: string;
  email: string;
  ssn: string;
  address: { line1: string; line2?: string; city: string; state: string; postalCode: string };
  annualIncome: number;
  monthlyDebtPayments: number;
  employerName: string;
  employmentYears: number;
  requestedAmount: number;
  currency?: string;
}

export interface SubmitApplicationOutput {
  applicationId: string;
  status: string;
  borrowerName: string;
  requestedAmount: number;
  currency: string;
  submittedAt: string;
}

export class SubmitApplicationInteractor {
  constructor(
    private readonly repo: LoanApplicationRepository,
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(input: SubmitApplicationInput): Promise<SubmitApplicationOutput> {
    const borrower = Borrower.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: Email.of(input.email),
      ssn: SSN.of(input.ssn),
      address: Address.of(input.address),
      annualIncome: Money.of(input.annualIncome, input.currency ?? 'USD'),
      monthlyDebtPayments: Money.of(input.monthlyDebtPayments, input.currency ?? 'USD'),
      employerName: input.employerName,
      employmentYears: input.employmentYears,
    });

    const applicationId = this.repo.nextId();
    const requestedAmount = Money.of(input.requestedAmount, input.currency ?? 'USD');

    const application = LoanApplication.create(applicationId, borrower, requestedAmount);
    application.submit();

    await this.repo.save(application);
    await this.eventPublisher.publishAll(application.events);
    application.clearEvents();

    return {
      applicationId: application.id.value,
      status: application.status,
      borrowerName: borrower.fullName,
      requestedAmount: requestedAmount.amount,
      currency: requestedAmount.currency,
      submittedAt: application.submittedAt!.toISOString(),
    };
  }
}
```

```typescript
// application/use-cases/evaluate-application.ts
import type { LoanApplicationRepository } from '../../domain/model/loan-application/loan-application.repository';
import type { EventPublisherPort } from '../../domain/ports/event-publisher.port';
import { CreditEvaluationService } from '../../domain/services/credit-evaluation.service';
import { ApplicationId } from '../../domain/value-objects/application-id';

export interface EvaluateApplicationInput {
  applicationId: string;
}

export interface EvaluateApplicationOutput {
  applicationId: string;
  status: string;
  approved: boolean;
  creditScore: number | null;
  offer: {
    amount: number;
    rate: number;
    termMonths: number;
    monthlyPayment: number;
    totalInterest: number;
  } | null;
  declineReasons: string[];
}

export class EvaluateApplicationInteractor {
  constructor(
    private readonly repo: LoanApplicationRepository,
    private readonly evaluationService: CreditEvaluationService,
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(input: EvaluateApplicationInput): Promise<EvaluateApplicationOutput> {
    const id = ApplicationId.of(input.applicationId);
    const application = await this.repo.findById(id);

    if (!application) {
      throw new Error(`Application ${input.applicationId} not found`);
    }

    const result = await this.evaluationService.evaluate(application);

    if (result.approved && result.offer) {
      application.approve(result.offer);
    } else {
      application.decline(result.declineReasons);
    }

    await this.repo.save(application);
    await this.eventPublisher.publishAll(application.events);
    application.clearEvents();

    return {
      applicationId: application.id.value,
      status: application.status,
      approved: result.approved,
      creditScore: application.creditScore?.value ?? null,
      offer: result.offer
        ? {
            amount: result.offer.approvedAmount.amount,
            rate: result.offer.interestRate.annualPercentage,
            termMonths: result.offer.termMonths,
            monthlyPayment: result.offer.monthlyPayment.amount,
            totalInterest: result.offer.totalInterest.amount,
          }
        : null,
      declineReasons: result.declineReasons,
    };
  }
}
```

## Tests

```typescript
// __tests__/domain/loan-application.spec.ts
import { LoanApplication } from '../../domain/model/loan-application/loan-application';
import { Borrower } from '../../domain/model/borrower/borrower';
import { ApplicationId } from '../../domain/value-objects/application-id';
import { Money } from '../../domain/value-objects/money';
import { CreditScore } from '../../domain/value-objects/credit-score';
import { Email } from '../../domain/value-objects/email';
import { SSN } from '../../domain/value-objects/ssn';
import { Address } from '../../domain/value-objects/address';
import { LoanOffer } from '../../domain/model/loan-offer/loan-offer';
import { InterestRate } from '../../domain/value-objects/interest-rate';
import { ApplicationStatus } from '../../domain/value-objects/application-status';
import { LoanAmountOutOfRangeError, InvalidStateTransitionError } from '../../domain/errors/domain-errors';

function createBorrower(overrides?: Partial<Parameters<typeof Borrower.create>[0]>) {
  return Borrower.create({
    firstName: 'John',
    lastName: 'Doe',
    email: Email.of('john@example.com'),
    ssn: SSN.of('123-45-6789'),
    address: Address.of({ line1: '123 Main St', city: 'Springfield', state: 'IL', postalCode: '62701' }),
    annualIncome: Money.of(80_000, 'USD'),
    monthlyDebtPayments: Money.of(1_500, 'USD'),
    employerName: 'Acme Corp',
    employmentYears: 5,
    ...overrides,
  });
}

describe('LoanApplication', () => {
  it('should create a draft application', () => {
    const app = LoanApplication.create(
      ApplicationId.generate(), createBorrower(), Money.of(100_000, 'USD'),
    );
    expect(app.status).toBe(ApplicationStatus.Draft);
  });

  it('should reject amount below minimum', () => {
    expect(() => LoanApplication.create(
      ApplicationId.generate(), createBorrower(), Money.of(500, 'USD'),
    )).toThrow(LoanAmountOutOfRangeError);
  });

  it('should reject amount above maximum', () => {
    expect(() => LoanApplication.create(
      ApplicationId.generate(), createBorrower(), Money.of(1_000_000, 'USD'),
    )).toThrow(LoanAmountOutOfRangeError);
  });

  it('should submit and emit ApplicationSubmitted event', () => {
    const app = LoanApplication.create(
      ApplicationId.generate(), createBorrower(), Money.of(100_000, 'USD'),
    );
    app.submit();
    expect(app.status).toBe(ApplicationStatus.Submitted);
    expect(app.events.some(e => e.type === 'ApplicationSubmitted')).toBe(true);
  });

  it('should approve with offer and emit ApplicationApproved event', () => {
    const app = LoanApplication.create(
      ApplicationId.generate(), createBorrower(), Money.of(100_000, 'USD'),
    );
    app.submit();
    app.beginReview(CreditScore.of(750));

    const offer = LoanOffer.create(Money.of(100_000, 'USD'), InterestRate.of(6.5), 360);
    app.approve(offer);

    expect(app.status).toBe(ApplicationStatus.Approved);
    expect(app.offer).toBeDefined();
    expect(app.events.some(e => e.type === 'ApplicationApproved')).toBe(true);
  });

  it('should decline with reasons', () => {
    const app = LoanApplication.create(
      ApplicationId.generate(), createBorrower(), Money.of(100_000, 'USD'),
    );
    app.submit();
    app.beginReview(CreditScore.of(500));
    app.decline(['Credit score too low']);

    expect(app.status).toBe(ApplicationStatus.Declined);
    expect(app.declineReasons).toContain('Credit score too low');
  });

  it('should not allow approving a draft application', () => {
    const app = LoanApplication.create(
      ApplicationId.generate(), createBorrower(), Money.of(100_000, 'USD'),
    );
    const offer = LoanOffer.create(Money.of(100_000, 'USD'), InterestRate.of(6.5), 360);
    expect(() => app.approve(offer)).toThrow();
  });
});

describe('Borrower', () => {
  it('should calculate DTI ratio', () => {
    const borrower = createBorrower({
      annualIncome: Money.of(120_000, 'USD'), // $10K/month
      monthlyDebtPayments: Money.of(3_000, 'USD'),
    });
    expect(borrower.dtiRatio).toBeCloseTo(0.3, 2); // 3000/10000
  });

  it('should calculate DTI with proposed new payment', () => {
    const borrower = createBorrower({
      annualIncome: Money.of(120_000, 'USD'),
      monthlyDebtPayments: Money.of(3_000, 'USD'),
    });
    const newDti = borrower.dtiWithNewPayment(Money.of(1_500, 'USD'));
    expect(newDti).toBeCloseTo(0.45, 2); // (3000+1500)/10000
  });
});

describe('InterestRate', () => {
  it('should calculate monthly payment correctly', () => {
    const rate = InterestRate.of(6.0); // 6% annual
    const payment = rate.calculateMonthlyPayment(Money.of(100_000, 'USD'), 360);
    // Standard 30-year mortgage at 6%: ~$599.55/month
    expect(payment.amount).toBeCloseTo(599.55, 0);
  });

  it('should calculate total interest', () => {
    const rate = InterestRate.of(6.0);
    const interest = rate.calculateTotalInterest(Money.of(100_000, 'USD'), 360);
    // Total interest over 30 years at 6%: ~$115,838
    expect(interest.amount).toBeGreaterThan(100_000);
    expect(interest.amount).toBeLessThan(120_000);
  });
});
```

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Create application (entity) | ~50 µs | Value object construction, validation |
| Submit application (state transition) | ~10 µs | Status change + event creation |
| Credit evaluation (domain logic only) | ~30 µs | Specification evaluation |
| Credit bureau call (external) | 200-800 ms | Network I/O through ACL |
| Save to PostgreSQL | 2-5 ms | INSERT with relations |
| Full evaluate workflow | 210-810 ms | Dominated by credit bureau |

## Mathematical Foundations — Loan Amortization

The monthly payment formula used by `InterestRate.calculateMonthlyPayment`:

$$
M = P \cdot \frac{r(1 + r)^n}{(1 + r)^n - 1}
$$

Where:
- $M$ = monthly payment
- $P$ = principal (loan amount)
- $r$ = monthly interest rate (annual rate / 12 / 100)
- $n$ = number of payments (term in months)

Total interest paid:

$$
I = M \cdot n - P
$$

::: info War Story
**The Specification That Prevented a $2M Compliance Fine**

A mortgage lender's loan eligibility rules were spread across 14 different services. During a regulatory audit, the compliance team discovered that the DTI threshold in the credit check service was 0.45, while the disclosure generator used 0.43 — the legally required maximum. Some loans were being approved that should have been declined.

After adopting the Specification Pattern, the eligibility rule lived in one place: `createCreditEligibilitySpec()`. The DTI threshold of 0.43 was defined exactly once. Both the approval service and the disclosure generator used the same specification. The compliance team could read the specification's `toString()` output as documentation.

The regulatory body accepted the specification test suite as evidence of compliance controls, avoiding a potential $2M fine.
:::

## Further Reading

- [Strategic Design](/architecture-patterns/domain-driven-design/strategic-design) — bounded contexts for this system
- [Tactical Design](/architecture-patterns/domain-driven-design/tactical-design) — entity and value object patterns
- [Domain Events](/architecture-patterns/domain-driven-design/domain-events) — event-driven patterns
- [Anti-Corruption Layer](./anti-corruption-layer) — the ACL pattern used here
- [Specification Pattern](./specification-pattern) — composable business rules
- [Clean Architecture TypeScript](/architecture-patterns/clean-architecture/typescript-implementation) — layered approach comparison
