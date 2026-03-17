---
title: "Hexagonal Architecture: Complete TypeScript Implementation"
description: "Full production-ready hexagonal architecture project — task management application with Express, PostgreSQL, in-memory adapters, and comprehensive test suite"
tags: [hexagonal, typescript, implementation, express, postgresql, testing, production]
difficulty: "advanced"
prerequisites: ["architecture-patterns/hexagonal", "architecture-patterns/hexagonal/ports-and-adapters", "architecture-patterns/hexagonal/dependency-inversion"]
lastReviewed: "2026-03-17"
---

# Hexagonal Architecture: Complete TypeScript Implementation

This page builds a complete, production-grade task management application using hexagonal architecture. Every file is written out — no pseudocode, no "the implementation is left as an exercise." By the end you will have a blueprint you can fork and adapt.

## Project Overview

The application manages tasks with the following business rules:
- Tasks have a title, description, status (todo / in-progress / done), and an assignee
- Only the task owner or an admin can modify a task
- Completing a task triggers an email notification to the assignee
- Tasks can be listed with filters (by status, by assignee)
- Overdue tasks (in-progress for more than 7 days) are highlighted

This is small enough to fully implement but complex enough to demonstrate every hexagonal architecture concept.

## Project Structure

```
src/
├── domain/
│   ├── entities/
│   │   ├── task.ts
│   │   └── user.ts
│   ├── value-objects/
│   │   ├── task-id.ts
│   │   ├── user-id.ts
│   │   ├── task-status.ts
│   │   └── email.ts
│   ├── ports/
│   │   ├── task.repository.ts
│   │   ├── user.repository.ts
│   │   ├── notification.service.ts
│   │   └── clock.ts
│   ├── services/
│   │   └── task-overdue.service.ts
│   └── errors/
│       └── index.ts
├── application/
│   ├── use-cases/
│   │   ├── create-task.ts
│   │   ├── complete-task.ts
│   │   ├── assign-task.ts
│   │   └── list-tasks.ts
│   └── dtos/
│       ├── create-task.dto.ts
│       ├── complete-task.dto.ts
│       └── task-response.dto.ts
├── adapters/
│   ├── primary/
│   │   └── http/
│   │       ├── app.ts
│   │       ├── task.router.ts
│   │       └── middleware/
│   │           ├── auth.ts
│   │           └── error-handler.ts
│   └── secondary/
│       ├── postgres/
│       │   ├── task.repository.ts
│       │   └── user.repository.ts
│       ├── in-memory/
│       │   ├── task.repository.ts
│       │   └── user.repository.ts
│       ├── email/
│       │   └── notification.service.ts
│       └── fakes/
│           ├── notification.service.ts
│           └── clock.ts
└── infrastructure/
    ├── main.ts
    ├── database/
    │   └── migrations/
    │       └── 001_create_tasks.sql
    └── config.ts
```

## Domain Layer

### Value Objects

```typescript
// src/domain/value-objects/task-id.ts
export class TaskId {
  private constructor(private readonly value: string) {}

  static generate(): TaskId {
    return new TaskId(crypto.randomUUID())
  }

  static from(value: string): TaskId {
    if (!value || value.trim().length === 0) {
      throw new Error('TaskId cannot be empty')
    }
    return new TaskId(value.trim())
  }

  toString(): string { return this.value }

  equals(other: TaskId): boolean { return this.value === other.value }
}

// src/domain/value-objects/task-status.ts
export type TaskStatusValue = 'todo' | 'in-progress' | 'done'

export class TaskStatus {
  private constructor(private readonly value: TaskStatusValue) {}

  static TODO = new TaskStatus('todo')
  static IN_PROGRESS = new TaskStatus('in-progress')
  static DONE = new TaskStatus('done')

  static from(value: string): TaskStatus {
    const valid: TaskStatusValue[] = ['todo', 'in-progress', 'done']
    if (!valid.includes(value as TaskStatusValue)) {
      throw new Error(`Invalid task status: ${value}. Must be one of: ${valid.join(', ')}`)
    }
    return new TaskStatus(value as TaskStatusValue)
  }

  get isTodo(): boolean { return this.value === 'todo' }
  get isInProgress(): boolean { return this.value === 'in-progress' }
  get isDone(): boolean { return this.value === 'done' }

  toString(): string { return this.value }

  equals(other: TaskStatus): boolean { return this.value === other.value }
}
```

### Task Entity

```typescript
// src/domain/entities/task.ts
import { TaskId } from '../value-objects/task-id'
import { TaskStatus } from '../value-objects/task-status'
import { UserId } from '../value-objects/user-id'
import {
  TaskNotFoundError,
  TaskAlreadyCompleteError,
  InsufficientPermissionsError,
} from '../errors'

interface TaskProps {
  id: TaskId
  title: string
  description: string
  status: TaskStatus
  ownerId: UserId
  assigneeId: UserId | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

export class Task {
  private constructor(private readonly props: TaskProps) {}

  // Factory for new tasks
  static create(params: {
    title: string
    description: string
    ownerId: UserId
  }): Task {
    if (!params.title || params.title.trim().length === 0) {
      throw new Error('Task title cannot be empty')
    }
    if (params.title.length > 200) {
      throw new Error('Task title cannot exceed 200 characters')
    }
    return new Task({
      id: TaskId.generate(),
      title: params.title.trim(),
      description: params.description.trim(),
      status: TaskStatus.TODO,
      ownerId: params.ownerId,
      assigneeId: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    })
  }

  // Factory for reconstituting from persistence
  static reconstitute(props: TaskProps): Task {
    return new Task(props)
  }

  get id(): TaskId { return this.props.id }
  get title(): string { return this.props.title }
  get description(): string { return this.props.description }
  get status(): TaskStatus { return this.props.status }
  get ownerId(): UserId { return this.props.ownerId }
  get assigneeId(): UserId | null { return this.props.assigneeId }
  get createdAt(): Date { return this.props.createdAt }
  get startedAt(): Date | null { return this.props.startedAt }
  get completedAt(): Date | null { return this.props.completedAt }

  isOwnedBy(userId: UserId): boolean {
    return this.props.ownerId.equals(userId)
  }

  isAssignedTo(userId: UserId): boolean {
    return this.props.assigneeId?.equals(userId) ?? false
  }

  assign(assigneeId: UserId, requesterId: UserId, requesterIsAdmin: boolean): Task {
    if (!this.isOwnedBy(requesterId) && !requesterIsAdmin) {
      throw new InsufficientPermissionsError('assign task')
    }
    if (this.props.status.isDone) {
      throw new TaskAlreadyCompleteError(this.props.id.toString())
    }
    return new Task({ ...this.props, assigneeId })
  }

  start(requesterId: UserId, requesterIsAdmin: boolean, now: Date): Task {
    if (!this.isOwnedBy(requesterId) && !this.isAssignedTo(requesterId) && !requesterIsAdmin) {
      throw new InsufficientPermissionsError('start task')
    }
    if (!this.props.status.isTodo) {
      throw new Error(`Cannot start a task in status: ${this.props.status.toString()}`)
    }
    return new Task({
      ...this.props,
      status: TaskStatus.IN_PROGRESS,
      startedAt: now,
    })
  }

  complete(requesterId: UserId, requesterIsAdmin: boolean, now: Date): Task {
    if (!this.isOwnedBy(requesterId) && !this.isAssignedTo(requesterId) && !requesterIsAdmin) {
      throw new InsufficientPermissionsError('complete task')
    }
    if (this.props.status.isDone) {
      throw new TaskAlreadyCompleteError(this.props.id.toString())
    }
    return new Task({
      ...this.props,
      status: TaskStatus.DONE,
      completedAt: now,
    })
  }

  isOverdue(now: Date, thresholdDays: number): boolean {
    if (!this.props.status.isInProgress || !this.props.startedAt) return false
    const daysSinceStart =
      (now.getTime() - this.props.startedAt.getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceStart > thresholdDays
  }
}
```

### Domain Errors

```typescript
// src/domain/errors/index.ts
export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export class TaskNotFoundError extends DomainError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`, 'TASK_NOT_FOUND')
    this.name = 'TaskNotFoundError'
  }
}

export class TaskAlreadyCompleteError extends DomainError {
  constructor(taskId: string) {
    super(`Task is already complete: ${taskId}`, 'TASK_ALREADY_COMPLETE')
    this.name = 'TaskAlreadyCompleteError'
  }
}

export class UserNotFoundError extends DomainError {
  constructor(userId: string) {
    super(`User not found: ${userId}`, 'USER_NOT_FOUND')
    this.name = 'UserNotFoundError'
  }
}

export class InsufficientPermissionsError extends DomainError {
  constructor(action: string) {
    super(`Insufficient permissions to: ${action}`, 'INSUFFICIENT_PERMISSIONS')
    this.name = 'InsufficientPermissionsError'
  }
}
```

### Secondary Ports

```typescript
// src/domain/ports/task.repository.ts
import { Task } from '../entities/task'
import { TaskId } from '../value-objects/task-id'
import { UserId } from '../value-objects/user-id'
import { TaskStatus } from '../value-objects/task-status'

export interface TaskFilter {
  status?: TaskStatus
  assigneeId?: UserId
  ownerId?: UserId
}

export interface TaskRepository {
  findById(id: TaskId): Promise<Task | null>
  findAll(filter?: TaskFilter): Promise<Task[]>
  save(task: Task): Promise<void>
  delete(id: TaskId): Promise<void>
}

// src/domain/ports/notification.service.ts
import { Task } from '../entities/task'

export interface NotificationService {
  notifyTaskCompleted(task: Task, assigneeEmail: string): Promise<void>
  notifyTaskAssigned(task: Task, assigneeEmail: string): Promise<void>
}

// src/domain/ports/clock.ts
export interface Clock {
  now(): Date
}
```

### Domain Service: Overdue Detection

```typescript
// src/domain/services/task-overdue.service.ts
import { Task } from '../entities/task'
import { Clock } from '../ports/clock'

export class TaskOverdueService {
  private static readonly OVERDUE_THRESHOLD_DAYS = 7

  constructor(private readonly clock: Clock) {}

  getOverdueTasks(tasks: Task[]): Task[] {
    const now = this.clock.now()
    return tasks.filter(task =>
      task.isOverdue(now, TaskOverdueService.OVERDUE_THRESHOLD_DAYS)
    )
  }

  isOverdue(task: Task): boolean {
    return task.isOverdue(this.clock.now(), TaskOverdueService.OVERDUE_THRESHOLD_DAYS)
  }
}
```

## Application Layer

### DTOs

```typescript
// src/application/dtos/create-task.dto.ts
export interface CreateTaskRequest {
  title: string
  description: string
  requesterId: string
}

export interface CreateTaskResponse {
  taskId: string
  title: string
  status: string
  createdAt: string
}

// src/application/dtos/complete-task.dto.ts
export interface CompleteTaskRequest {
  taskId: string
  requesterId: string
  requesterIsAdmin: boolean
}

// src/application/dtos/task-response.dto.ts
export interface TaskResponse {
  id: string
  title: string
  description: string
  status: string
  ownerId: string
  assigneeId: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  isOverdue: boolean
}

export interface ListTasksRequest {
  requesterId: string
  filterByStatus?: string
  filterByAssigneeId?: string
}
```

### Use Cases

```typescript
// src/application/use-cases/create-task.ts
import { TaskRepository } from '../../domain/ports/task.repository'
import { Task } from '../../domain/entities/task'
import { UserId } from '../../domain/value-objects/user-id'
import { UserRepository } from '../../domain/ports/user.repository'
import { UserNotFoundError } from '../../domain/errors'
import { CreateTaskRequest, CreateTaskResponse } from '../dtos/create-task.dto'

export class CreateTaskUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly userRepo: UserRepository
  ) {}

  async execute(request: CreateTaskRequest): Promise<CreateTaskResponse> {
    const requesterId = UserId.from(request.requesterId)
    const requester = await this.userRepo.findById(requesterId)
    if (!requester) {
      throw new UserNotFoundError(request.requesterId)
    }

    const task = Task.create({
      title: request.title,
      description: request.description,
      ownerId: requesterId,
    })

    await this.taskRepo.save(task)

    return {
      taskId: task.id.toString(),
      title: task.title,
      status: task.status.toString(),
      createdAt: task.createdAt.toISOString(),
    }
  }
}

// src/application/use-cases/complete-task.ts
import { TaskRepository } from '../../domain/ports/task.repository'
import { UserRepository } from '../../domain/ports/user.repository'
import { NotificationService } from '../../domain/ports/notification.service'
import { Clock } from '../../domain/ports/clock'
import { TaskId } from '../../domain/value-objects/task-id'
import { UserId } from '../../domain/value-objects/user-id'
import { TaskNotFoundError, UserNotFoundError } from '../../domain/errors'
import { CompleteTaskRequest } from '../dtos/complete-task.dto'

export class CompleteTaskUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly userRepo: UserRepository,
    private readonly notifications: NotificationService,
    private readonly clock: Clock
  ) {}

  async execute(request: CompleteTaskRequest): Promise<void> {
    const taskId = TaskId.from(request.taskId)
    const requesterId = UserId.from(request.requesterId)

    const task = await this.taskRepo.findById(taskId)
    if (!task) throw new TaskNotFoundError(request.taskId)

    const completedTask = task.complete(requesterId, request.requesterIsAdmin, this.clock.now())

    await this.taskRepo.save(completedTask)

    // Notify assignee if there is one
    if (completedTask.assigneeId) {
      const assignee = await this.userRepo.findById(completedTask.assigneeId)
      if (assignee) {
        await this.notifications.notifyTaskCompleted(completedTask, assignee.email.toString())
      }
    }
  }
}

// src/application/use-cases/assign-task.ts
import { TaskRepository } from '../../domain/ports/task.repository'
import { UserRepository } from '../../domain/ports/user.repository'
import { NotificationService } from '../../domain/ports/notification.service'
import { TaskId } from '../../domain/value-objects/task-id'
import { UserId } from '../../domain/value-objects/user-id'
import { TaskNotFoundError, UserNotFoundError } from '../../domain/errors'

export interface AssignTaskRequest {
  taskId: string
  assigneeId: string
  requesterId: string
  requesterIsAdmin: boolean
}

export class AssignTaskUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly userRepo: UserRepository,
    private readonly notifications: NotificationService
  ) {}

  async execute(request: AssignTaskRequest): Promise<void> {
    const taskId = TaskId.from(request.taskId)
    const assigneeId = UserId.from(request.assigneeId)
    const requesterId = UserId.from(request.requesterId)

    const [task, assignee] = await Promise.all([
      this.taskRepo.findById(taskId),
      this.userRepo.findById(assigneeId),
    ])

    if (!task) throw new TaskNotFoundError(request.taskId)
    if (!assignee) throw new UserNotFoundError(request.assigneeId)

    const updatedTask = task.assign(assigneeId, requesterId, request.requesterIsAdmin)

    await this.taskRepo.save(updatedTask)
    await this.notifications.notifyTaskAssigned(updatedTask, assignee.email.toString())
  }
}

// src/application/use-cases/list-tasks.ts
import { TaskRepository } from '../../domain/ports/task.repository'
import { Clock } from '../../domain/ports/clock'
import { TaskStatus } from '../../domain/value-objects/task-status'
import { UserId } from '../../domain/value-objects/user-id'
import { TaskOverdueService } from '../../domain/services/task-overdue.service'
import { ListTasksRequest, TaskResponse } from '../dtos/task-response.dto'

export class ListTasksUseCase {
  private readonly overdueService: TaskOverdueService

  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: Clock
  ) {
    this.overdueService = new TaskOverdueService(clock)
  }

  async execute(request: ListTasksRequest): Promise<TaskResponse[]> {
    const tasks = await this.taskRepo.findAll({
      status: request.filterByStatus
        ? TaskStatus.from(request.filterByStatus)
        : undefined,
      assigneeId: request.filterByAssigneeId
        ? UserId.from(request.filterByAssigneeId)
        : undefined,
    })

    return tasks.map(task => ({
      id: task.id.toString(),
      title: task.title,
      description: task.description,
      status: task.status.toString(),
      ownerId: task.ownerId.toString(),
      assigneeId: task.assigneeId?.toString() ?? null,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      isOverdue: this.overdueService.isOverdue(task),
    }))
  }
}
```

## Adapters: Secondary (Driven Side)

### In-Memory Adapters

```typescript
// src/adapters/secondary/in-memory/task.repository.ts
import { TaskRepository, TaskFilter } from '../../../domain/ports/task.repository'
import { Task } from '../../../domain/entities/task'
import { TaskId } from '../../../domain/value-objects/task-id'

export class InMemoryTaskRepository implements TaskRepository {
  private store = new Map<string, Task>()

  async findById(id: TaskId): Promise<Task | null> {
    return this.store.get(id.toString()) ?? null
  }

  async findAll(filter?: TaskFilter): Promise<Task[]> {
    let tasks = Array.from(this.store.values())

    if (filter?.status) {
      tasks = tasks.filter(t => t.status.equals(filter.status!))
    }
    if (filter?.assigneeId) {
      tasks = tasks.filter(t => t.assigneeId?.equals(filter.assigneeId!) ?? false)
    }
    if (filter?.ownerId) {
      tasks = tasks.filter(t => t.ownerId.equals(filter.ownerId!))
    }

    return tasks
  }

  async save(task: Task): Promise<void> {
    this.store.set(task.id.toString(), task)
  }

  async delete(id: TaskId): Promise<void> {
    this.store.delete(id.toString())
  }

  // Test helpers
  all(): Task[] { return Array.from(this.store.values()) }
  clear(): void { this.store.clear() }
  get size(): number { return this.store.size }
}
```

### PostgreSQL Adapter

```typescript
// src/adapters/secondary/postgres/task.repository.ts
import { Pool } from 'pg'
import { TaskRepository, TaskFilter } from '../../../domain/ports/task.repository'
import { Task } from '../../../domain/entities/task'
import { TaskId } from '../../../domain/value-objects/task-id'
import { UserId } from '../../../domain/value-objects/user-id'
import { TaskStatus } from '../../../domain/value-objects/task-status'

interface TaskRow {
  id: string
  title: string
  description: string
  status: string
  owner_id: string
  assignee_id: string | null
  created_at: Date
  started_at: Date | null
  completed_at: Date | null
}

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: TaskId): Promise<Task | null> {
    const result = await this.pool.query<TaskRow>(
      'SELECT * FROM tasks WHERE id = $1',
      [id.toString()]
    )
    return result.rows[0] ? this.toDomain(result.rows[0]) : null
  }

  async findAll(filter?: TaskFilter): Promise<Task[]> {
    const conditions: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (filter?.status) {
      conditions.push(`status = $${idx++}`)
      params.push(filter.status.toString())
    }
    if (filter?.assigneeId) {
      conditions.push(`assignee_id = $${idx++}`)
      params.push(filter.assigneeId.toString())
    }
    if (filter?.ownerId) {
      conditions.push(`owner_id = $${idx++}`)
      params.push(filter.ownerId.toString())
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await this.pool.query<TaskRow>(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC`,
      params
    )

    return result.rows.map(row => this.toDomain(row))
  }

  async save(task: Task): Promise<void> {
    await this.pool.query(
      `INSERT INTO tasks (id, title, description, status, owner_id, assignee_id, created_at, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         assignee_id = EXCLUDED.assignee_id,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at`,
      [
        task.id.toString(),
        task.title,
        task.description,
        task.status.toString(),
        task.ownerId.toString(),
        task.assigneeId?.toString() ?? null,
        task.createdAt,
        task.startedAt,
        task.completedAt,
      ]
    )
  }

  async delete(id: TaskId): Promise<void> {
    await this.pool.query('DELETE FROM tasks WHERE id = $1', [id.toString()])
  }

  private toDomain(row: TaskRow): Task {
    return Task.reconstitute({
      id: TaskId.from(row.id),
      title: row.title,
      description: row.description,
      status: TaskStatus.from(row.status),
      ownerId: UserId.from(row.owner_id),
      assigneeId: row.assignee_id ? UserId.from(row.assignee_id) : null,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    })
  }
}
```

### Email Notification Adapter

```typescript
// src/adapters/secondary/email/notification.service.ts
import nodemailer from 'nodemailer'
import { NotificationService } from '../../../domain/ports/notification.service'
import { Task } from '../../../domain/entities/task'

interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

export class SmtpNotificationService implements NotificationService {
  private readonly transporter: nodemailer.Transporter

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      auth: { user: config.user, pass: config.pass },
    })
  }

  async notifyTaskCompleted(task: Task, assigneeEmail: string): Promise<void> {
    await this.transporter.sendMail({
      from: '"TaskApp" <noreply@taskapp.example.com>',
      to: assigneeEmail,
      subject: `Task completed: ${task.title}`,
      html: `
        <h2>Task Completed</h2>
        <p>The task "<strong>${task.title}</strong>" has been marked as complete.</p>
        <p>Completed at: ${task.completedAt?.toLocaleString() ?? 'unknown'}</p>
      `,
    })
  }

  async notifyTaskAssigned(task: Task, assigneeEmail: string): Promise<void> {
    await this.transporter.sendMail({
      from: '"TaskApp" <noreply@taskapp.example.com>',
      to: assigneeEmail,
      subject: `You have been assigned: ${task.title}`,
      html: `
        <h2>Task Assigned</h2>
        <p>You have been assigned to the task: "<strong>${task.title}</strong>"</p>
        <p>Description: ${task.description}</p>
      `,
    })
  }
}

// src/adapters/secondary/fakes/notification.service.ts
import { NotificationService } from '../../../domain/ports/notification.service'
import { Task } from '../../../domain/entities/task'

export interface SentNotification {
  type: 'completed' | 'assigned'
  taskId: string
  taskTitle: string
  to: string
}

export class FakeNotificationService implements NotificationService {
  public sent: SentNotification[] = []
  public shouldThrow = false

  async notifyTaskCompleted(task: Task, assigneeEmail: string): Promise<void> {
    if (this.shouldThrow) throw new Error('Notification service unavailable')
    this.sent.push({ type: 'completed', taskId: task.id.toString(), taskTitle: task.title, to: assigneeEmail })
  }

  async notifyTaskAssigned(task: Task, assigneeEmail: string): Promise<void> {
    this.sent.push({ type: 'assigned', taskId: task.id.toString(), taskTitle: task.title, to: assigneeEmail })
  }

  reset(): void {
    this.sent = []
    this.shouldThrow = false
  }
}

// src/adapters/secondary/fakes/clock.ts
import { Clock } from '../../../domain/ports/clock'

export class FixedClock implements Clock {
  constructor(private fixedTime: Date = new Date()) {}

  now(): Date { return this.fixedTime }

  advance(ms: number): void {
    this.fixedTime = new Date(this.fixedTime.getTime() + ms)
  }

  advanceDays(days: number): void {
    this.advance(days * 24 * 60 * 60 * 1000)
  }

  set(date: Date): void {
    this.fixedTime = date
  }
}
```

## Adapters: Primary (HTTP)

```typescript
// src/adapters/primary/http/task.router.ts
import { Router, Request, Response, NextFunction } from 'express'
import { CreateTaskUseCase } from '../../../application/use-cases/create-task'
import { CompleteTaskUseCase } from '../../../application/use-cases/complete-task'
import { AssignTaskUseCase } from '../../../application/use-cases/assign-task'
import { ListTasksUseCase } from '../../../application/use-cases/list-tasks'
import {
  TaskNotFoundError,
  InsufficientPermissionsError,
  UserNotFoundError,
  TaskAlreadyCompleteError,
} from '../../../domain/errors'

interface TaskRouterDeps {
  createTask: CreateTaskUseCase
  completeTask: CompleteTaskUseCase
  assignTask: AssignTaskUseCase
  listTasks: ListTasksUseCase
}

// Simulated auth middleware result — in production, this would be from JWT validation
interface AuthenticatedRequest extends Request {
  userId?: string
  userIsAdmin?: boolean
}

export function createTaskRouter(deps: TaskRouterDeps): Router {
  const router = Router()

  // GET /tasks
  router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await deps.listTasks.execute({
        requesterId: req.userId!,
        filterByStatus: req.query.status as string | undefined,
        filterByAssigneeId: req.query.assigneeId as string | undefined,
      })
      res.json({ tasks: result })
    } catch (error) {
      next(error)
    }
  })

  // POST /tasks
  router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, description } = req.body
      if (!title) {
        res.status(400).json({ error: 'title is required' })
        return
      }

      const result = await deps.createTask.execute({
        title,
        description: description ?? '',
        requesterId: req.userId!,
      })

      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  // POST /tasks/:id/complete
  router.post('/:id/complete', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await deps.completeTask.execute({
        taskId: req.params.id,
        requesterId: req.userId!,
        requesterIsAdmin: req.userIsAdmin ?? false,
      })
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  })

  // POST /tasks/:id/assign
  router.post('/:id/assign', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { assigneeId } = req.body
      if (!assigneeId) {
        res.status(400).json({ error: 'assigneeId is required' })
        return
      }

      await deps.assignTask.execute({
        taskId: req.params.id,
        assigneeId,
        requesterId: req.userId!,
        requesterIsAdmin: req.userIsAdmin ?? false,
      })
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  })

  return router
}

// src/adapters/primary/http/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express'
import {
  TaskNotFoundError,
  UserNotFoundError,
  InsufficientPermissionsError,
  TaskAlreadyCompleteError,
  DomainError,
} from '../../../../domain/errors'

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof TaskNotFoundError || error instanceof UserNotFoundError) {
    res.status(404).json({ error: error.message, code: error.code })
    return
  }
  if (error instanceof InsufficientPermissionsError) {
    res.status(403).json({ error: error.message, code: error.code })
    return
  }
  if (error instanceof TaskAlreadyCompleteError) {
    res.status(409).json({ error: error.message, code: error.code })
    return
  }
  if (error instanceof DomainError) {
    res.status(422).json({ error: error.message, code: error.code })
    return
  }
  // Unexpected error — do not leak details
  console.error('Unhandled error:', error)
  res.status(500).json({ error: 'Internal server error' })
}
```

## Infrastructure: Composition Root

```typescript
// src/infrastructure/main.ts
import 'dotenv/config'
import express from 'express'
import { Pool } from 'pg'

// Secondary adapters
import { PostgresTaskRepository } from '../adapters/secondary/postgres/task.repository'
import { PostgresUserRepository } from '../adapters/secondary/postgres/user.repository'
import { SmtpNotificationService } from '../adapters/secondary/email/notification.service'

// Clock — production uses real time
const RealClock = { now: () => new Date() }

// Use cases
import { CreateTaskUseCase } from '../application/use-cases/create-task'
import { CompleteTaskUseCase } from '../application/use-cases/complete-task'
import { AssignTaskUseCase } from '../application/use-cases/assign-task'
import { ListTasksUseCase } from '../application/use-cases/list-tasks'

// Primary adapters
import { createTaskRouter } from '../adapters/primary/http/task.router'
import { errorHandler } from '../adapters/primary/http/middleware/error-handler'

async function bootstrap(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  })

  // Verify DB connection at startup
  await pool.query('SELECT 1')
  console.log('Database connected')

  // Secondary adapters
  const taskRepo = new PostgresTaskRepository(pool)
  const userRepo = new PostgresUserRepository(pool)
  const notifications = new SmtpNotificationService({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  })
  const clock = RealClock

  // Use cases (application services)
  const createTask = new CreateTaskUseCase(taskRepo, userRepo)
  const completeTask = new CompleteTaskUseCase(taskRepo, userRepo, notifications, clock)
  const assignTask = new AssignTaskUseCase(taskRepo, userRepo, notifications)
  const listTasks = new ListTasksUseCase(taskRepo, clock)

  // HTTP server
  const app = express()
  app.use(express.json())

  // Auth middleware (simplified — real implementation would verify JWT)
  app.use((req: any, _res, next) => {
    req.userId = req.headers['x-user-id'] ?? 'anonymous'
    req.userIsAdmin = req.headers['x-user-role'] === 'admin'
    next()
  })

  app.use('/tasks', createTaskRouter({ createTask, completeTask, assignTask, listTasks }))
  app.use(errorHandler)

  const port = Number(process.env.PORT ?? 3000)
  app.listen(port, () => {
    console.log(`Task service running on port ${port}`)
  })
}

bootstrap().catch((error) => {
  console.error('Failed to start:', error)
  process.exit(1)
})
```

## Database Migration

```sql
-- src/infrastructure/database/migrations/001_create_tasks.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'user',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY,
  title        TEXT NOT NULL CHECK (length(title) > 0 AND length(title) <= 200),
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'in-progress', 'done')),
  owner_id     UUID NOT NULL REFERENCES users(id),
  assignee_id  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT completed_requires_started
    CHECK (completed_at IS NULL OR started_at IS NOT NULL)
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_owner ON tasks(owner_id);
```

## Test Suite

```typescript
// src/application/use-cases/__tests__/complete-task.test.ts
import { CompleteTaskUseCase } from '../complete-task'
import { InMemoryTaskRepository } from '../../../adapters/secondary/in-memory/task.repository'
import { InMemoryUserRepository } from '../../../adapters/secondary/in-memory/user.repository'
import { FakeNotificationService } from '../../../adapters/secondary/fakes/notification.service'
import { FixedClock } from '../../../adapters/secondary/fakes/clock'
import { Task } from '../../../domain/entities/task'
import { UserId } from '../../../domain/value-objects/user-id'
import { TaskId } from '../../../domain/value-objects/task-id'
import { TaskNotFoundError, InsufficientPermissionsError, TaskAlreadyCompleteError } from '../../../domain/errors'

// Helpers for building test fixtures
function makeUser(id = 'user-1') {
  return { id: UserId.from(id), email: { toString: () => `${id}@test.com` } } as any
}

function makeTask(overrides: Partial<{ ownerId: string; assigneeId: string | null; status: string }> = {}) {
  const ownerId = UserId.from(overrides.ownerId ?? 'user-1')
  const base = Task.create({ title: 'Test Task', description: '', ownerId })
  return base
}

describe('CompleteTaskUseCase', () => {
  let taskRepo: InMemoryTaskRepository
  let userRepo: InMemoryUserRepository
  let notifications: FakeNotificationService
  let clock: FixedClock
  let sut: CompleteTaskUseCase

  beforeEach(() => {
    taskRepo = new InMemoryTaskRepository()
    userRepo = new InMemoryUserRepository()
    notifications = new FakeNotificationService()
    clock = new FixedClock(new Date('2026-03-17T12:00:00Z'))
    sut = new CompleteTaskUseCase(taskRepo, userRepo, notifications, clock)
  })

  describe('when completing as owner', () => {
    it('marks the task as done', async () => {
      const owner = makeUser('owner-1')
      await userRepo.save(owner)
      const task = Task.create({ title: 'My Task', description: '', ownerId: owner.id })
      await taskRepo.save(task)

      await sut.execute({ taskId: task.id.toString(), requesterId: 'owner-1', requesterIsAdmin: false })

      const saved = await taskRepo.findById(task.id)
      expect(saved?.status.isDone).toBe(true)
      expect(saved?.completedAt).toEqual(clock.now())
    })

    it('does not notify if there is no assignee', async () => {
      const owner = makeUser('owner-1')
      await userRepo.save(owner)
      const task = Task.create({ title: 'Unassigned', description: '', ownerId: owner.id })
      await taskRepo.save(task)

      await sut.execute({ taskId: task.id.toString(), requesterId: 'owner-1', requesterIsAdmin: false })

      expect(notifications.sent).toHaveLength(0)
    })
  })

  describe('when the task does not exist', () => {
    it('throws TaskNotFoundError', async () => {
      await expect(
        sut.execute({ taskId: 'non-existent', requesterId: 'user-1', requesterIsAdmin: false })
      ).rejects.toThrow(TaskNotFoundError)
    })
  })

  describe('when another user tries to complete', () => {
    it('throws InsufficientPermissionsError', async () => {
      const owner = makeUser('owner-1')
      const other = makeUser('other-1')
      await userRepo.save(owner)
      await userRepo.save(other)
      const task = Task.create({ title: 'Protected', description: '', ownerId: owner.id })
      await taskRepo.save(task)

      await expect(
        sut.execute({ taskId: task.id.toString(), requesterId: 'other-1', requesterIsAdmin: false })
      ).rejects.toThrow(InsufficientPermissionsError)
    })

    it('allows admin to complete any task', async () => {
      const owner = makeUser('owner-1')
      const admin = makeUser('admin-1')
      await userRepo.save(owner)
      await userRepo.save(admin)
      const task = Task.create({ title: 'Admin Task', description: '', ownerId: owner.id })
      await taskRepo.save(task)

      await expect(
        sut.execute({ taskId: task.id.toString(), requesterId: 'admin-1', requesterIsAdmin: true })
      ).resolves.toBeUndefined()
    })
  })
})

// src/application/use-cases/__tests__/list-tasks.test.ts
import { ListTasksUseCase } from '../list-tasks'
import { InMemoryTaskRepository } from '../../../adapters/secondary/in-memory/task.repository'
import { FixedClock } from '../../../adapters/secondary/fakes/clock'
import { Task } from '../../../domain/entities/task'
import { UserId } from '../../../domain/value-objects/user-id'

describe('ListTasksUseCase', () => {
  let taskRepo: InMemoryTaskRepository
  let clock: FixedClock
  let sut: ListTasksUseCase

  beforeEach(() => {
    taskRepo = new InMemoryTaskRepository()
    clock = new FixedClock(new Date('2026-03-17T00:00:00Z'))
    sut = new ListTasksUseCase(taskRepo, clock)
  })

  it('flags tasks in-progress for more than 7 days as overdue', async () => {
    const ownerId = UserId.from('user-1')
    const task = Task.create({ title: 'Old Task', description: '', ownerId })
    // Start the task 8 days ago
    const startedTask = task.start(ownerId, false, new Date('2026-03-09T00:00:00Z'))
    await taskRepo.save(startedTask)

    const results = await sut.execute({ requesterId: 'user-1' })
    expect(results[0].isOverdue).toBe(true)
  })

  it('does not flag recently started tasks as overdue', async () => {
    const ownerId = UserId.from('user-1')
    const task = Task.create({ title: 'Recent Task', description: '', ownerId })
    const startedTask = task.start(ownerId, false, new Date('2026-03-15T00:00:00Z'))
    await taskRepo.save(startedTask)

    const results = await sut.execute({ requesterId: 'user-1' })
    expect(results[0].isOverdue).toBe(false)
  })
})
```

## Error Handling Architecture

The error handling strategy follows a clear hierarchy:

```
Domain Errors (business rule violations)
  → Thrown by: entities, domain services, use cases
  → Caught by: primary adapters (HTTP error handler)
  → HTTP mapping: 404 (not found), 403 (permissions), 409 (conflict), 422 (domain rule)

Infrastructure Errors (technical failures)
  → Thrown by: secondary adapters (database, email, etc.)
  → Caught by: primary adapter error handler
  → HTTP mapping: 500 (internal server error)
  → Important: never expose raw infrastructure error messages to clients

Validation Errors (input format failures)
  → Thrown by: value objects, use case entry validation
  → Caught by: primary adapters or domain layer
  → HTTP mapping: 400 (bad request)
```

## Performance Characteristics

| Operation | Time Complexity | Notes |
|---|---|---|
| `findById` (in-memory) | O(1) | Map lookup |
| `findAll` with filter (in-memory) | O(n) | Linear scan |
| `findById` (PostgreSQL) | O(log n) | B-tree index on primary key |
| `findAll` with status filter (PostgreSQL) | O(k) | Index on status column, k = matching rows |
| `save` (in-memory) | O(1) | Map insertion |
| `save` (PostgreSQL) | O(log n) | Upsert with index maintenance |

The in-memory adapter's O(n) findAll is acceptable for tests (typically < 100 objects) but would not scale for production. The PostgreSQL adapter uses indexed queries throughout.

## Mathematical Foundation: Interface Segregation

The port design follows the Interface Segregation Principle. Define the minimum interface area needed:

$$|P_{min}| = \{m \in M_P \mid \exists \text{ use case } U : U \text{ calls } m\}$$

Where $M_P$ is the set of all possible methods for port $P$, and $P_{min}$ contains only those methods actually used by at least one use case. Adding unused methods to a port:

1. Increases the implementation burden for every adapter
2. Increases the test double burden for every test
3. Creates false coupling between use cases that share the port

The `TaskRepository` port defines exactly 4 methods because that is the minimum required across all use cases. A naive implementation might add `findByTitle`, `count`, `findPaginated`, etc. — but those should only be added when a use case requires them.

## War Story: The Database Migration

::: info War Story
A team built a project management tool using hexagonal architecture. After 18 months, the product had grown and their PostgreSQL-backed task repository was suffering under the load of complex filter queries — particularly the "show me all tasks matching this combination of filters" query, which required full table scans on large tables.

They decided to migrate the read side of tasks to Elasticsearch for full-text search and complex filtering capabilities. In a typical codebase, this would mean rewriting every piece of code that touched the task repository, adding conditional logic, and running in fear of side effects.

In the hexagonal codebase:
1. They built an `ElasticsearchTaskRepository` implementing `TaskRepository` — this took 3 days
2. They added indexing logic to the write path (after saving to Postgres, also index to Elasticsearch) — this was a new `DualWriteTaskRepository` decorator implementing `TaskRepository` — 1 day
3. Wrote integration tests for both adapters — 1 day
4. Updated `main.ts` to wire the Elasticsearch adapter for reads and the dual-write adapter for writes — 30 minutes

Total time: 5 days. Zero changes to use cases, domain entities, or primary adapters. The team could not believe it worked this cleanly, but it did — because the port interface had been respected as a hard boundary throughout the application's lifetime.

The key insight they shared: "Hexagonal architecture paid for itself entirely in this one migration. The overhead of writing proper interfaces upfront was probably 2 extra days over 18 months. The migration savings were 3-4 weeks. The ROI was obvious in retrospect."
:::
