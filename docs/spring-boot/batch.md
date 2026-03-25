---
title: "Spring Batch"
description: "Complete guide to Spring Batch — Job and Step configuration, ItemReader/ItemProcessor/ItemWriter pattern, chunk-oriented processing, partitioning for parallel execution, retry and skip policies, scheduling batch jobs, and monitoring with Actuator"
tags: [spring-boot, batch, etl, processing, data-pipeline]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Spring Batch

Spring Batch is a framework for building batch processing applications — programs that process large volumes of data without human interaction. ETL pipelines, report generation, data migration, nightly reconciliation, bulk email sending, and file import/export are all batch processing workloads. They share common patterns: read from a source, process each record, write to a destination, handle errors gracefully, and provide restart capability if the job fails partway through.

Spring Batch provides the infrastructure for these patterns: chunk-oriented processing, transaction management, declarative I/O, retry and skip policies, parallel execution, and a job repository that tracks execution history for restartability.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                          Job                                  │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                    Step 1                              │    │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │    │
│  │  │ ItemReader  │→│ItemProcessor  │→│ ItemWriter    │  │    │
│  │  │             │  │               │  │              │  │    │
│  │  │ Read 1000   │  │ Transform     │  │ Write 1000   │  │    │
│  │  │ records     │  │ each record   │  │ records      │  │    │
│  │  └────────────┘  └──────────────┘  └─────────────┘  │    │
│  │                                                        │    │
│  │  Chunk size: 100 → Process 100, commit, repeat         │    │
│  └──────────────────────────────────────────────────────┘    │
│                            │                                  │
│                            ▼                                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                    Step 2                              │    │
│  │  Tasklet (single operation, not chunk-based)          │    │
│  │  e.g., cleanup temp files, send completion email      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  Job Repository (tracks execution status, parameters)        │
└──────────────────────────────────────────────────────────────┘
```

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-batch</artifactId>
</dependency>
<!-- Job repository needs a database -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
```

```yaml
spring:
  batch:
    jdbc:
      initialize-schema: always  # Create batch tables automatically
    job:
      enabled: false             # Don't run jobs on startup
```

## Basic Job Configuration

### CSV Import Job

Import a CSV file of customer records into a database:

```java
@Configuration
public class CustomerImportJobConfig {

    private final JobRepository jobRepository;
    private final PlatformTransactionManager transactionManager;

    public CustomerImportJobConfig(JobRepository jobRepository,
                                    PlatformTransactionManager transactionManager) {
        this.jobRepository = jobRepository;
        this.transactionManager = transactionManager;
    }

    @Bean
    public Job customerImportJob(Step importStep, Step cleanupStep) {
        return new JobBuilder("customerImportJob", jobRepository)
                .incrementer(new RunIdIncrementer())
                .validator(new DefaultJobParametersValidator(
                        new String[]{"inputFile"},    // Required params
                        new String[]{"dryRun"}        // Optional params
                ))
                .start(importStep)
                .next(cleanupStep)
                .listener(jobCompletionListener())
                .build();
    }

    @Bean
    public Step importStep(ItemReader<CustomerCsv> reader,
                           ItemProcessor<CustomerCsv, Customer> processor,
                           ItemWriter<Customer> writer) {
        return new StepBuilder("importStep", jobRepository)
                .<CustomerCsv, Customer>chunk(100, transactionManager)
                .reader(reader)
                .processor(processor)
                .writer(writer)
                .faultTolerant()
                .skipLimit(10)
                .skip(FlatFileParseException.class)
                .retryLimit(3)
                .retry(DeadlockLoserDataAccessException.class)
                .listener(stepListener())
                .build();
    }

    @Bean
    public Step cleanupStep() {
        return new StepBuilder("cleanupStep", jobRepository)
                .tasklet((contribution, chunkContext) -> {
                    // Single-operation step: cleanup temp files
                    Path tempDir = Path.of("/tmp/batch-imports");
                    if (Files.exists(tempDir)) {
                        Files.walk(tempDir)
                             .sorted(Comparator.reverseOrder())
                             .forEach(p -> p.toFile().delete());
                    }
                    return RepeatStatus.FINISHED;
                }, transactionManager)
                .build();
    }
}
```

## ItemReader Implementations

### FlatFileItemReader (CSV)

```java
@Bean
@StepScope
public FlatFileItemReader<CustomerCsv> csvReader(
        @Value("#{jobParameters['inputFile']}") String inputFile) {

    return new FlatFileItemReaderBuilder<CustomerCsv>()
            .name("customerCsvReader")
            .resource(new FileSystemResource(inputFile))
            .linesToSkip(1)  // Skip header row
            .delimited()
            .delimiter(",")
            .names("firstName", "lastName", "email", "phone", "birthDate")
            .fieldSetMapper(fieldSet -> {
                CustomerCsv csv = new CustomerCsv();
                csv.setFirstName(fieldSet.readString("firstName"));
                csv.setLastName(fieldSet.readString("lastName"));
                csv.setEmail(fieldSet.readString("email"));
                csv.setPhone(fieldSet.readString("phone"));
                csv.setBirthDate(fieldSet.readString("birthDate"));
                return csv;
            })
            .build();
}
```

### JdbcCursorItemReader (Database)

```java
@Bean
public JdbcCursorItemReader<Order> orderReader(DataSource dataSource) {
    return new JdbcCursorItemReaderBuilder<Order>()
            .name("orderReader")
            .dataSource(dataSource)
            .sql("""
                SELECT id, customer_id, total_amount, status, created_at
                FROM orders
                WHERE status = 'PENDING'
                  AND created_at < NOW() - INTERVAL '7 days'
                ORDER BY created_at
                """)
            .rowMapper((rs, rowNum) -> {
                Order order = new Order();
                order.setId(rs.getString("id"));
                order.setCustomerId(rs.getString("customer_id"));
                order.setTotalAmount(rs.getBigDecimal("total_amount"));
                order.setStatus(OrderStatus.valueOf(rs.getString("status")));
                order.setCreatedAt(rs.getTimestamp("created_at").toInstant());
                return order;
            })
            .fetchSize(500)
            .build();
}
```

### JpaPagingItemReader

```java
@Bean
@StepScope
public JpaPagingItemReader<Transaction> transactionReader(
        EntityManagerFactory emf,
        @Value("#{jobParameters['startDate']}") String startDate) {

    Map<String, Object> params = new HashMap<>();
    params.put("startDate", LocalDate.parse(startDate));

    return new JpaPagingItemReaderBuilder<Transaction>()
            .name("transactionReader")
            .entityManagerFactory(emf)
            .queryString("SELECT t FROM Transaction t WHERE t.date >= :startDate ORDER BY t.date")
            .parameterValues(params)
            .pageSize(200)
            .build();
}
```

### Custom ItemReader (API Pagination)

```java
@Component
@StepScope
public class ApiPaginatingReader implements ItemReader<ExternalRecord> {

    private final RestTemplate restTemplate;
    private int currentPage = 0;
    private List<ExternalRecord> currentBatch = new ArrayList<>();
    private int currentIndex = 0;
    private boolean exhausted = false;

    @Override
    public ExternalRecord read() {
        if (exhausted) return null;

        if (currentIndex >= currentBatch.size()) {
            // Fetch next page
            ApiResponse response = restTemplate.getForObject(
                    "https://api.example.com/records?page={page}&size=100",
                    ApiResponse.class, currentPage);

            if (response == null || response.getRecords().isEmpty()) {
                exhausted = true;
                return null;
            }

            currentBatch = response.getRecords();
            currentIndex = 0;
            currentPage++;
        }

        return currentBatch.get(currentIndex++);
    }
}
```

## ItemProcessor

```java
@Component
public class CustomerProcessor implements ItemProcessor<CustomerCsv, Customer> {

    private final CustomerRepository customerRepo;
    private final EmailValidator emailValidator;

    @Override
    public Customer process(CustomerCsv csv) throws Exception {
        // Returning null skips this record (filtered out)
        if (!emailValidator.isValid(csv.getEmail())) {
            log.warn("Skipping customer with invalid email: {}", csv.getEmail());
            return null;
        }

        // Check for duplicates
        if (customerRepo.existsByEmail(csv.getEmail())) {
            log.info("Skipping duplicate email: {}", csv.getEmail());
            return null;
        }

        // Transform CSV to entity
        Customer customer = new Customer();
        customer.setFirstName(csv.getFirstName().trim());
        customer.setLastName(csv.getLastName().trim());
        customer.setEmail(csv.getEmail().toLowerCase().trim());
        customer.setPhone(normalizePhone(csv.getPhone()));
        customer.setBirthDate(parseBirthDate(csv.getBirthDate()));
        customer.setStatus(CustomerStatus.ACTIVE);
        customer.setImportedAt(Instant.now());

        return customer;
    }
}
```

### Composite Processor (Chained Processing)

```java
@Bean
public CompositeItemProcessor<RawTransaction, EnrichedTransaction> compositeProcessor() {
    CompositeItemProcessor<RawTransaction, EnrichedTransaction> processor =
            new CompositeItemProcessor<>();

    processor.setDelegates(List.of(
            validationProcessor(),   // Validate → return null to skip
            enrichmentProcessor(),   // Add external data
            transformProcessor()     // Final transformation
    ));

    return processor;
}
```

## ItemWriter

### JpaItemWriter

```java
@Bean
public JpaItemWriter<Customer> customerWriter(EntityManagerFactory emf) {
    JpaItemWriter<Customer> writer = new JpaItemWriter<>();
    writer.setEntityManagerFactory(emf);
    return writer;
}
```

### JdbcBatchItemWriter (Bulk INSERT)

```java
@Bean
public JdbcBatchItemWriter<Customer> jdbcWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<Customer>()
            .dataSource(dataSource)
            .sql("""
                INSERT INTO customers (id, first_name, last_name, email, phone, birth_date, status)
                VALUES (:id, :firstName, :lastName, :email, :phone, :birthDate, :status)
                ON CONFLICT (email) DO UPDATE SET
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    phone = EXCLUDED.phone
                """)
            .beanMapped()
            .build();
}
```

### Composite Writer (Write to Multiple Destinations)

```java
@Bean
public CompositeItemWriter<ProcessedOrder> compositeWriter() {
    CompositeItemWriter<ProcessedOrder> writer = new CompositeItemWriter<>();
    writer.setDelegates(List.of(
            databaseWriter(),      // Write to database
            elasticsearchWriter(), // Index in Elasticsearch
            kafkaWriter()          // Publish to Kafka topic
    ));
    return writer;
}
```

## Partitioning for Parallel Processing

Process large datasets in parallel by splitting the work:

```
                    ┌──────────────────────┐
                    │   Manager Step        │
                    │   (Partitioner)       │
                    └──────────┬───────────┘
                               │
               ┌───────────────┼───────────────┐
               │               │               │
               ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │ Worker 1     │ │ Worker 2     │ │ Worker 3     │
        │ IDs 1-1000   │ │ IDs 1001-    │ │ IDs 2001-    │
        │              │ │    2000      │ │    3000      │
        └─────────────┘ └─────────────┘ └─────────────┘
```

```java
@Bean
public Step partitionedStep(Step workerStep) {
    return new StepBuilder("partitionedStep", jobRepository)
            .partitioner("workerStep", rangePartitioner())
            .step(workerStep)
            .gridSize(10)  // 10 partitions
            .taskExecutor(batchTaskExecutor())
            .build();
}

@Bean
public Partitioner rangePartitioner() {
    return gridSize -> {
        long min = orderRepository.findMinId();
        long max = orderRepository.findMaxId();
        long range = (max - min) / gridSize + 1;

        Map<String, ExecutionContext> partitions = new HashMap<>();
        for (int i = 0; i < gridSize; i++) {
            ExecutionContext context = new ExecutionContext();
            context.putLong("minId", min + (i * range));
            context.putLong("maxId", min + ((i + 1) * range) - 1);
            partitions.put("partition" + i, context);
        }
        return partitions;
    };
}

@Bean
public TaskExecutor batchTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(5);
    executor.setMaxPoolSize(10);
    executor.setQueueCapacity(25);
    executor.setThreadNamePrefix("batch-worker-");
    return executor;
}

@Bean
@StepScope
public JdbcCursorItemReader<Order> partitionedReader(
        DataSource dataSource,
        @Value("#{stepExecutionContext['minId']}") Long minId,
        @Value("#{stepExecutionContext['maxId']}") Long maxId) {

    return new JdbcCursorItemReaderBuilder<Order>()
            .name("partitionedOrderReader")
            .dataSource(dataSource)
            .sql("SELECT * FROM orders WHERE id BETWEEN ? AND ?")
            .preparedStatementSetter(ps -> {
                ps.setLong(1, minId);
                ps.setLong(2, maxId);
            })
            .rowMapper(orderRowMapper())
            .build();
}
```

## Retry and Skip Policies

### Configuring Fault Tolerance

```java
@Bean
public Step faultTolerantStep() {
    return new StepBuilder("faultTolerantStep", jobRepository)
            .<Input, Output>chunk(100, transactionManager)
            .reader(reader())
            .processor(processor())
            .writer(writer())
            .faultTolerant()

            // Skip: continue processing if these exceptions occur
            .skipLimit(50)                               // Max 50 skips total
            .skip(ValidationException.class)
            .skip(FlatFileParseException.class)
            .noSkip(DatabaseException.class)             // Never skip this

            // Retry: retry on transient failures
            .retryLimit(3)
            .retry(DeadlockLoserDataAccessException.class)
            .retry(OptimisticLockingFailureException.class)
            .backOffPolicy(new ExponentialBackOffPolicy())  // 1s, 2s, 4s

            // Listeners for monitoring
            .listener(skipListener())
            .listener(retryListener())
            .build();
}

@Bean
public SkipListener<Input, Output> skipListener() {
    return new SkipListener<>() {
        @Override
        public void onSkipInRead(Throwable t) {
            log.warn("Skipped record during read: {}", t.getMessage());
            meterRegistry.counter("batch.skips", "phase", "read").increment();
        }

        @Override
        public void onSkipInProcess(Input item, Throwable t) {
            log.warn("Skipped during process: {} - {}", item, t.getMessage());
            meterRegistry.counter("batch.skips", "phase", "process").increment();
        }

        @Override
        public void onSkipInWrite(Output item, Throwable t) {
            log.warn("Skipped during write: {} - {}", item, t.getMessage());
            meterRegistry.counter("batch.skips", "phase", "write").increment();
        }
    };
}
```

## Conditional Flow

```java
@Bean
public Job conditionalJob(Step extractStep, Step transformStep,
                           Step loadStep, Step errorStep) {
    return new JobBuilder("conditionalJob", jobRepository)
            .start(extractStep)
                .on("FAILED").to(errorStep)   // If extract fails, go to error step
                .from(extractStep).on("*").to(transformStep)  // Otherwise, transform
            .from(transformStep)
                .on("COMPLETED").to(loadStep)
                .from(transformStep).on("FAILED").to(errorStep)
            .end()
            .build();
}

// Deciding next step based on business logic
@Bean
public Step decisionStep(JobExecutionDecider decider) {
    return new StepBuilder("decisionStep", jobRepository)
            .partitioner("worker", partitioner())
            .build();
}

@Bean
public JobExecutionDecider decider() {
    return (jobExecution, stepExecution) -> {
        long processedCount = stepExecution.getWriteCount();
        if (processedCount > 10000) {
            return new FlowExecutionStatus("LARGE_BATCH");
        }
        return new FlowExecutionStatus("SMALL_BATCH");
    };
}
```

## Scheduling Batch Jobs

### Spring Scheduler

```java
@Component
public class BatchJobScheduler {

    private final JobLauncher jobLauncher;
    private final Job customerImportJob;

    @Scheduled(cron = "0 0 2 * * *")  // Every day at 2 AM
    public void runDailyImport() {
        try {
            JobParameters params = new JobParametersBuilder()
                    .addString("inputFile", "/data/imports/customers_"
                            + LocalDate.now() + ".csv")
                    .addLong("timestamp", System.currentTimeMillis())
                    .toJobParameters();

            JobExecution execution = jobLauncher.run(customerImportJob, params);
            log.info("Daily import completed with status: {}",
                    execution.getStatus());
        } catch (Exception e) {
            log.error("Failed to launch daily import job", e);
        }
    }
}
```

### REST Endpoint for Manual Triggering

```java
@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobLauncher asyncJobLauncher;
    private final Job customerImportJob;
    private final JobExplorer jobExplorer;

    @PostMapping("/customer-import")
    public ResponseEntity<Map<String, Object>> launchImport(
            @RequestParam String inputFile) throws Exception {

        JobParameters params = new JobParametersBuilder()
                .addString("inputFile", inputFile)
                .addLong("timestamp", System.currentTimeMillis())
                .toJobParameters();

        JobExecution execution = asyncJobLauncher.run(customerImportJob, params);

        return ResponseEntity.accepted().body(Map.of(
                "jobExecutionId", execution.getId(),
                "status", execution.getStatus().name(),
                "startTime", execution.getStartTime()
        ));
    }

    @GetMapping("/executions/{id}")
    public ResponseEntity<JobExecutionInfo> getExecution(@PathVariable Long id) {
        JobExecution execution = jobExplorer.getJobExecution(id);
        if (execution == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(new JobExecutionInfo(
                execution.getId(),
                execution.getJobInstance().getJobName(),
                execution.getStatus().name(),
                execution.getStartTime(),
                execution.getEndTime(),
                execution.getStepExecutions().stream()
                        .map(se -> new StepInfo(
                                se.getStepName(),
                                se.getReadCount(),
                                se.getWriteCount(),
                                se.getSkipCount(),
                                se.getStatus().name()))
                        .toList()
        ));
    }
}
```

## Job Completion Listener

```java
@Component
@Slf4j
public class JobCompletionNotificationListener implements JobExecutionListener {

    private final NotificationService notificationService;
    private final MeterRegistry meterRegistry;

    @Override
    public void beforeJob(JobExecution jobExecution) {
        log.info("Job {} starting with parameters: {}",
                jobExecution.getJobInstance().getJobName(),
                jobExecution.getJobParameters());
    }

    @Override
    public void afterJob(JobExecution jobExecution) {
        String jobName = jobExecution.getJobInstance().getJobName();
        BatchStatus status = jobExecution.getStatus();
        Duration duration = Duration.between(
                jobExecution.getStartTime(), jobExecution.getEndTime());

        // Metrics
        meterRegistry.timer("batch.job.duration",
                "job", jobName, "status", status.name())
                .record(duration);

        // Summarize step results
        StringBuilder summary = new StringBuilder();
        for (StepExecution step : jobExecution.getStepExecutions()) {
            summary.append(String.format(
                    "  Step '%s': read=%d, written=%d, skipped=%d, status=%s%n",
                    step.getStepName(),
                    step.getReadCount(),
                    step.getWriteCount(),
                    step.getSkipCount(),
                    step.getStatus()));
        }

        log.info("Job {} completed in {}s with status {}\n{}",
                jobName, duration.getSeconds(), status, summary);

        if (status == BatchStatus.FAILED) {
            notificationService.sendAlert(
                    "Batch job failed: " + jobName,
                    "Job failed after " + duration.getSeconds() + "s\n" + summary
            );
        }
    }
}
```

## Common Patterns

| Pattern | When to Use |
|---------|------------|
| Chunk processing | Standard read-process-write with transaction boundaries |
| Tasklet | Single operations (cleanup, notification, file move) |
| Partitioning | Parallel processing of independent data ranges |
| Multi-file | Process all files matching a pattern with `MultiResourceItemReader` |
| Conditional flow | Different steps based on previous step outcome |
| Late binding (`@StepScope`) | Job/step parameters injected at runtime |

Spring Batch handles the infrastructure — transactions, restartability, parallel execution, error handling — so you can focus on the business logic of reading, transforming, and writing data. For simple one-off scripts, it is overkill. For production batch workloads that must be reliable, monitorable, and restartable, it saves enormous amounts of custom plumbing.
