---
title: "Spring Batch Deep Dive"
description: "Comprehensive guide to Spring Batch — Job/Step architecture, chunk vs tasklet processing, ItemReader implementations (JDBC, file, JPA, Kafka), ItemProcessor chains, ItemWriter (DB, file, REST), partitioned parallel processing, skip/retry policies, JobRepository internals, scheduling with @Scheduled and Quartz, monitoring, and performance tuning."
tags: [spring-batch, batch-processing, etl, java, data-pipeline]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, spring-data-jpa, relational-databases]
lastReviewed: "2026-03-25"
---

# Spring Batch Deep Dive

Spring Batch is the de-facto standard for batch processing on the JVM. It provides a robust, scalable framework for reading, processing, and writing large volumes of data with built-in support for transaction management, job restart, skip/retry logic, and resource management.

## 1. Core Architecture

Spring Batch separates concerns into three layers: **Application** (your business logic), **Batch Core** (runtime classes for launching and controlling jobs), and **Batch Infrastructure** (readers, writers, retry templates).

```
+-------------------------------------------------------------+
|                      Application Layer                       |
|  (Your Jobs, Steps, Readers, Processors, Writers)            |
+-------------------------------------------------------------+
|                      Batch Core Layer                        |
|  (Job, Step, JobLauncher, JobRepository, StepExecution)      |
+-------------------------------------------------------------+
|                   Batch Infrastructure                       |
|  (ItemReader, ItemWriter, RetryTemplate, RepeatTemplate)     |
+-------------------------------------------------------------+
```

### 1.1 Job and Step Model

A **Job** is a container for Steps. Each **Step** encapsulates an independent, sequential phase of batch processing.

```java
import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
public class BatchJobConfig {

    @Bean
    public Job importCustomerJob(JobRepository jobRepository,
                                  Step validateStep,
                                  Step importStep,
                                  Step reportStep) {
        return new JobBuilder("importCustomerJob", jobRepository)
                .start(validateStep)
                .next(importStep)
                .next(reportStep)
                .build();
    }

    @Bean
    public Step validateStep(JobRepository jobRepository,
                             PlatformTransactionManager transactionManager) {
        return new StepBuilder("validateStep", jobRepository)
                .tasklet((contribution, chunkContext) -> {
                    System.out.println("Validating input files...");
                    // Validation logic here
                    return RepeatStatus.FINISHED;
                }, transactionManager)
                .build();
    }
}
```

### 1.2 JobInstance and JobExecution

A **JobInstance** represents a logical run of a job (identified by job name + job parameters). A **JobExecution** represents a single attempt to run that instance. If a job fails and is restarted with the same parameters, it creates a new JobExecution under the same JobInstance.

```java
import org.springframework.batch.core.JobParameters;
import org.springframework.batch.core.JobParametersBuilder;
import org.springframework.batch.core.launch.JobLauncher;

@Service
public class JobTriggerService {

    private final JobLauncher jobLauncher;
    private final Job importCustomerJob;

    public JobTriggerService(JobLauncher jobLauncher, Job importCustomerJob) {
        this.jobLauncher = jobLauncher;
        this.importCustomerJob = importCustomerJob;
    }

    public void triggerJob(String fileName) throws Exception {
        JobParameters params = new JobParametersBuilder()
                .addString("inputFile", fileName)
                .addLocalDateTime("runTime", LocalDateTime.now())
                .toJobParameters();

        JobExecution execution = jobLauncher.run(importCustomerJob, params);
        System.out.println("Job Status: " + execution.getStatus());
        System.out.println("Job Exit: " + execution.getExitStatus());
    }
}
```

## 2. Chunk-Oriented Processing

The chunk model is the heart of Spring Batch. It reads items one at a time, processes them, and writes them in chunks (batches). Each chunk is wrapped in a transaction.

```
Read Item 1 -> Process Item 1
Read Item 2 -> Process Item 2
Read Item 3 -> Process Item 3
... (chunk-size items)
Write [Item1, Item2, Item3, ...]  <-- single transaction
```

### 2.1 Basic Chunk Step

```java
@Bean
public Step importStep(JobRepository jobRepository,
                       PlatformTransactionManager transactionManager,
                       ItemReader<CustomerCsv> reader,
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
            .listener(new ChunkLogListener())
            .build();
}
```

### 2.2 Chunk Size Tuning

Chunk size directly affects performance and memory usage. Larger chunks reduce transaction overhead but increase memory consumption and rollback cost on failure.

```java
// Small chunk — good for complex processing, lower memory
.<Input, Output>chunk(10, transactionManager)

// Medium chunk — balanced for most ETL workloads
.<Input, Output>chunk(100, transactionManager)

// Large chunk — maximize throughput for simple transformations
.<Input, Output>chunk(1000, transactionManager)

// Dynamic chunk size based on CompletionPolicy
@Bean
public Step dynamicChunkStep(JobRepository jobRepository,
                              PlatformTransactionManager txManager) {
    return new StepBuilder("dynamicChunkStep", jobRepository)
            .<String, String>chunk(new TimeoutTerminationPolicy(2000), txManager)
            .reader(itemReader())
            .writer(itemWriter())
            .build();
}
```

## 3. Tasklet Processing

Tasklets are for steps that don't fit the read-process-write pattern: file cleanup, stored procedure calls, sending notifications.

```java
import org.springframework.batch.core.step.tasklet.Tasklet;
import org.springframework.batch.repeat.RepeatStatus;

@Component
public class FileDeletionTasklet implements Tasklet {

    private final String directory;

    public FileDeletionTasklet(@Value("${batch.temp.dir}") String directory) {
        this.directory = directory;
    }

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                 ChunkContext chunkContext) throws Exception {
        Path dir = Path.of(directory);
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.tmp")) {
            int count = 0;
            for (Path file : stream) {
                Files.delete(file);
                count++;
            }
            contribution.incrementWriteCount(count);
            System.out.println("Deleted " + count + " temp files");
        }
        return RepeatStatus.FINISHED;
    }
}

@Bean
public Step cleanupStep(JobRepository jobRepository,
                         PlatformTransactionManager transactionManager,
                         FileDeletionTasklet tasklet) {
    return new StepBuilder("cleanupStep", jobRepository)
            .tasklet(tasklet, transactionManager)
            .build();
}
```

## 4. ItemReader Implementations

### 4.1 FlatFileItemReader (CSV/TSV)

```java
@Bean
public FlatFileItemReader<CustomerCsv> csvReader(
        @Value("#{jobParameters['inputFile']}") String inputFile) {
    return new FlatFileItemReaderBuilder<CustomerCsv>()
            .name("customerCsvReader")
            .resource(new FileSystemResource(inputFile))
            .linesToSkip(1) // skip header
            .delimited()
            .delimiter(",")
            .names("id", "firstName", "lastName", "email", "balance")
            .fieldSetMapper(fieldSet -> {
                CustomerCsv c = new CustomerCsv();
                c.setId(fieldSet.readLong("id"));
                c.setFirstName(fieldSet.readString("firstName"));
                c.setLastName(fieldSet.readString("lastName"));
                c.setEmail(fieldSet.readString("email"));
                c.setBalance(fieldSet.readBigDecimal("balance"));
                return c;
            })
            .build();
}
```

### 4.2 JdbcCursorItemReader

```java
@Bean
public JdbcCursorItemReader<Order> jdbcCursorReader(DataSource dataSource) {
    return new JdbcCursorItemReaderBuilder<Order>()
            .name("orderJdbcReader")
            .dataSource(dataSource)
            .sql("""
                SELECT o.id, o.customer_id, o.total_amount, o.status, o.created_at
                FROM orders o
                WHERE o.status = 'PENDING'
                  AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
                ORDER BY o.created_at
                """)
            .rowMapper((rs, rowNum) -> {
                Order order = new Order();
                order.setId(rs.getLong("id"));
                order.setCustomerId(rs.getLong("customer_id"));
                order.setTotalAmount(rs.getBigDecimal("total_amount"));
                order.setStatus(rs.getString("status"));
                order.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
                return order;
            })
            .fetchSize(500)    // JDBC fetch size for streaming
            .saveState(true)   // enable restart
            .build();
}
```

### 4.3 JdbcPagingItemReader

```java
@Bean
public JdbcPagingItemReader<Transaction> jdbcPagingReader(DataSource dataSource) {
    Map<String, Order> sortKeys = new HashMap<>();
    sortKeys.put("id", Order.ASCENDING);

    PostgresPagingQueryProvider queryProvider = new PostgresPagingQueryProvider();
    queryProvider.setSelectClause("id, account_id, amount, type, created_at");
    queryProvider.setFromClause("transactions");
    queryProvider.setWhereClause("type = :type AND created_at >= :startDate");
    queryProvider.setSortKeys(sortKeys);

    Map<String, Object> params = new HashMap<>();
    params.put("type", "DEBIT");
    params.put("startDate", LocalDate.now().minusDays(7));

    return new JdbcPagingItemReaderBuilder<Transaction>()
            .name("transactionPagingReader")
            .dataSource(dataSource)
            .queryProvider(queryProvider)
            .parameterValues(params)
            .pageSize(200)
            .rowMapper(new BeanPropertyRowMapper<>(Transaction.class))
            .build();
}
```

### 4.4 JPA ItemReader

```java
@Bean
public JpaPagingItemReader<Product> jpaReader(EntityManagerFactory emf) {
    return new JpaPagingItemReaderBuilder<Product>()
            .name("productJpaReader")
            .entityManagerFactory(emf)
            .queryString("SELECT p FROM Product p WHERE p.active = true ORDER BY p.id")
            .pageSize(100)
            .build();
}

// With named query and parameters
@Bean
public JpaPagingItemReader<Invoice> invoiceReader(EntityManagerFactory emf) {
    Map<String, Object> params = new HashMap<>();
    params.put("status", InvoiceStatus.UNPAID);
    params.put("dueDate", LocalDate.now());

    return new JpaPagingItemReaderBuilder<Invoice>()
            .name("invoiceJpaReader")
            .entityManagerFactory(emf)
            .queryString("SELECT i FROM Invoice i WHERE i.status = :status AND i.dueDate <= :dueDate")
            .parameterValues(params)
            .pageSize(50)
            .build();
}
```

### 4.5 Kafka ItemReader

```java
@Bean
public KafkaItemReader<String, OrderEvent> kafkaReader(
        ConsumerFactory<String, OrderEvent> consumerFactory) {
    Properties props = new Properties();
    props.put(ConsumerConfig.GROUP_ID_CONFIG, "batch-consumer");
    props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);

    return new KafkaItemReaderBuilder<String, OrderEvent>()
            .name("orderEventKafkaReader")
            .consumerProperties(props)
            .topic("order-events")
            .partitions(0, 1, 2, 3)
            .pollTimeout(Duration.ofSeconds(5))
            .saveState(true)
            .build();
}
```

### 4.6 JSON ItemReader

```java
@Bean
public JsonItemReader<Employee> jsonReader() {
    return new JsonItemReaderBuilder<Employee>()
            .name("employeeJsonReader")
            .resource(new ClassPathResource("data/employees.json"))
            .jsonObjectReader(new JacksonJsonObjectReader<>(Employee.class))
            .build();
}
```

## 5. ItemProcessor Chains

### 5.1 Single Processor

```java
@Component
public class CustomerValidationProcessor
        implements ItemProcessor<CustomerCsv, Customer> {

    private final CustomerRepository repository;

    public CustomerValidationProcessor(CustomerRepository repository) {
        this.repository = repository;
    }

    @Override
    public Customer process(CustomerCsv item) throws Exception {
        // Return null to skip/filter items
        if (item.getEmail() == null || !item.getEmail().contains("@")) {
            return null; // filtered out
        }

        // Check for duplicates
        if (repository.existsByEmail(item.getEmail())) {
            return null; // skip duplicate
        }

        // Transform CSV DTO to entity
        Customer customer = new Customer();
        customer.setFirstName(item.getFirstName().trim());
        customer.setLastName(item.getLastName().trim());
        customer.setEmail(item.getEmail().toLowerCase().trim());
        customer.setBalance(item.getBalance());
        customer.setCreatedAt(LocalDateTime.now());
        return customer;
    }
}
```

### 5.2 Composite Processor (Chain)

```java
@Bean
public CompositeItemProcessor<RawTransaction, EnrichedTransaction> compositeProcessor() {
    CompositeItemProcessor<RawTransaction, EnrichedTransaction> composite =
            new CompositeItemProcessor<>();

    composite.setDelegates(List.of(
            validationProcessor(),
            enrichmentProcessor(),
            classificationProcessor()
    ));
    return composite;
}

@Bean
public ItemProcessor<RawTransaction, ValidatedTransaction> validationProcessor() {
    return item -> {
        if (item.getAmount() == null || item.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return null; // filter invalid
        }
        ValidatedTransaction validated = new ValidatedTransaction();
        BeanUtils.copyProperties(item, validated);
        validated.setValidatedAt(Instant.now());
        return validated;
    };
}

@Bean
public ItemProcessor<ValidatedTransaction, EnrichedTransaction> enrichmentProcessor() {
    return item -> {
        EnrichedTransaction enriched = new EnrichedTransaction();
        BeanUtils.copyProperties(item, enriched);
        enriched.setCurrency(lookupCurrency(item.getAccountId()));
        enriched.setCategory(categorize(item.getMerchant()));
        return enriched;
    };
}

@Bean
public ItemProcessor<EnrichedTransaction, EnrichedTransaction> classificationProcessor() {
    return item -> {
        if (item.getAmount().compareTo(new BigDecimal("10000")) > 0) {
            item.setRiskLevel(RiskLevel.HIGH);
            item.setRequiresReview(true);
        } else {
            item.setRiskLevel(RiskLevel.NORMAL);
            item.setRequiresReview(false);
        }
        return item;
    };
}
```

## 6. ItemWriter Implementations

### 6.1 JPA Writer

```java
@Bean
public JpaItemWriter<Customer> jpaWriter(EntityManagerFactory emf) {
    JpaItemWriter<Customer> writer = new JpaItemWriter<>();
    writer.setEntityManagerFactory(emf);
    writer.setUsePersist(true); // use persist instead of merge
    return writer;
}
```

### 6.2 JDBC Batch Writer

```java
@Bean
public JdbcBatchItemWriter<Customer> jdbcWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<Customer>()
            .dataSource(dataSource)
            .sql("""
                INSERT INTO customers (first_name, last_name, email, balance, created_at)
                VALUES (:firstName, :lastName, :email, :balance, :createdAt)
                ON CONFLICT (email) DO UPDATE SET
                    balance = EXCLUDED.balance,
                    updated_at = NOW()
                """)
            .beanMapped()
            .build();
}
```

### 6.3 Flat File Writer

```java
@Bean
public FlatFileItemWriter<ReportLine> csvWriter() {
    return new FlatFileItemWriterBuilder<ReportLine>()
            .name("reportCsvWriter")
            .resource(new FileSystemResource("output/report.csv"))
            .headerCallback(writer -> writer.write("ID,Name,Amount,Status,Date"))
            .delimited()
            .delimiter(",")
            .names("id", "name", "amount", "status", "date")
            .footerCallback(writer -> writer.write("Generated: " + LocalDateTime.now()))
            .build();
}
```

### 6.4 Composite Writer (Multiple Destinations)

```java
@Bean
public CompositeItemWriter<ProcessedOrder> compositeWriter(
        JpaItemWriter<ProcessedOrder> dbWriter,
        FlatFileItemWriter<ProcessedOrder> fileWriter,
        KafkaItemWriter<String, ProcessedOrder> kafkaWriter) {

    CompositeItemWriter<ProcessedOrder> composite = new CompositeItemWriter<>();
    composite.setDelegates(List.of(dbWriter, fileWriter, kafkaWriter));
    return composite;
}

@Bean
public KafkaItemWriter<String, ProcessedOrder> kafkaWriter(KafkaTemplate<String, ProcessedOrder> template) {
    KafkaItemWriter<String, ProcessedOrder> writer = new KafkaItemWriter<>();
    writer.setKafkaTemplate(template);
    writer.setItemKeyMapper(order -> String.valueOf(order.getId()));
    writer.setDelete(false);
    return writer;
}
```

### 6.5 REST API Writer

```java
@Component
public class RestApiItemWriter implements ItemWriter<Customer> {

    private final RestClient restClient;

    public RestApiItemWriter(RestClient.Builder builder) {
        this.restClient = builder
                .baseUrl("https://api.crm.example.com")
                .defaultHeader("Authorization", "Bearer " + System.getenv("CRM_TOKEN"))
                .build();
    }

    @Override
    public void write(Chunk<? extends Customer> chunk) throws Exception {
        for (Customer customer : chunk) {
            restClient.post()
                    .uri("/api/v1/customers")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(customer)
                    .retrieve()
                    .toBodilessEntity();
        }
    }
}
```

## 7. Partitioning for Parallel Processing

Partitioning splits a Step into multiple sub-steps that run in parallel. Each partition processes a subset of the data.

### 7.1 Column-Range Partitioner

```java
@Component
public class ColumnRangePartitioner implements Partitioner {

    private final JdbcTemplate jdbcTemplate;

    public ColumnRangePartitioner(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Map<String, ExecutionContext> partition(int gridSize) {
        Long min = jdbcTemplate.queryForObject("SELECT MIN(id) FROM orders", Long.class);
        Long max = jdbcTemplate.queryForObject("SELECT MAX(id) FROM orders", Long.class);

        if (min == null || max == null) {
            return Map.of();
        }

        long range = (max - min) / gridSize + 1;
        Map<String, ExecutionContext> partitions = new HashMap<>();

        long start = min;
        for (int i = 0; i < gridSize; i++) {
            ExecutionContext context = new ExecutionContext();
            context.putLong("minId", start);
            context.putLong("maxId", Math.min(start + range - 1, max));
            context.putString("partitionName", "partition" + i);
            partitions.put("partition" + i, context);
            start += range;
        }

        return partitions;
    }
}
```

### 7.2 Partitioned Step Configuration

```java
@Bean
public Step partitionedImportStep(JobRepository jobRepository,
                                   ColumnRangePartitioner partitioner,
                                   Step workerStep) {
    return new StepBuilder("partitionedImportStep", jobRepository)
            .partitioner("workerStep", partitioner)
            .step(workerStep)
            .gridSize(8)
            .taskExecutor(batchTaskExecutor())
            .build();
}

@Bean
public Step workerStep(JobRepository jobRepository,
                        PlatformTransactionManager txManager,
                        DataSource dataSource) {
    JdbcPagingItemReader<Order> reader = new JdbcPagingItemReaderBuilder<Order>()
            .name("partitionedOrderReader")
            .dataSource(dataSource)
            .selectClause("id, customer_id, total_amount, status")
            .fromClause("orders")
            .whereClause("id >= :minId AND id <= :maxId")
            .sortKeys(Map.of("id", Order.ASCENDING))
            .pageSize(200)
            .rowMapper(new BeanPropertyRowMapper<>(Order.class))
            .build();

    return new StepBuilder("workerStep", jobRepository)
            .<Order, ProcessedOrder>chunk(100, txManager)
            .reader(reader)
            .processor(orderProcessor())
            .writer(orderWriter())
            .build();
}

@Bean
public TaskExecutor batchTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(8);
    executor.setMaxPoolSize(16);
    executor.setQueueCapacity(25);
    executor.setThreadNamePrefix("batch-partition-");
    executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
    executor.initialize();
    return executor;
}
```

### 7.3 Multi-Threaded Step (Simpler Alternative)

```java
@Bean
public Step multiThreadedStep(JobRepository jobRepository,
                               PlatformTransactionManager txManager) {
    return new StepBuilder("multiThreadedStep", jobRepository)
            .<Input, Output>chunk(100, txManager)
            .reader(synchronizedReader())  // must be thread-safe
            .processor(processor())
            .writer(writer())
            .taskExecutor(batchTaskExecutor())
            .throttleLimit(8)
            .build();
}

@Bean
public SynchronizedItemStreamReader<Input> synchronizedReader() {
    SynchronizedItemStreamReader<Input> syncReader = new SynchronizedItemStreamReader<>();
    syncReader.setDelegate(actualReader());
    return syncReader;
}
```

## 8. Skip and Retry Policies

### 8.1 Skip Policy

```java
@Bean
public Step faultTolerantStep(JobRepository jobRepository,
                               PlatformTransactionManager txManager) {
    return new StepBuilder("faultTolerantStep", jobRepository)
            .<RawRecord, ProcessedRecord>chunk(100, txManager)
            .reader(reader())
            .processor(processor())
            .writer(writer())
            .faultTolerant()
            // Skip configuration
            .skipLimit(50)
            .skip(FlatFileParseException.class)
            .skip(ValidationException.class)
            .noSkip(DatabaseUnavailableException.class)
            // Retry configuration
            .retryLimit(3)
            .retry(DeadlockLoserDataAccessException.class)
            .retry(OptimisticLockingFailureException.class)
            .noRetry(ValidationException.class)
            // Listeners for monitoring
            .listener(skipListener())
            .listener(retryListener())
            .build();
}
```

### 8.2 Custom Skip Policy

```java
public class FileErrorSkipPolicy implements SkipPolicy {

    private static final int MAX_SKIP = 100;
    private final AtomicInteger skipCount = new AtomicInteger(0);

    @Override
    public boolean shouldSkip(Throwable t, long skipCount) throws SkipLimitExceededException {
        if (t instanceof FlatFileParseException parseEx) {
            if (this.skipCount.incrementAndGet() > MAX_SKIP) {
                throw new SkipLimitExceededException(MAX_SKIP, t);
            }
            // Log the problematic line
            System.err.println("Skipping line " + parseEx.getLineNumber()
                    + ": " + parseEx.getInput());
            return true;
        }
        return false; // don't skip other exceptions
    }
}
```

### 8.3 Skip Listener for Auditing

```java
@Component
public class BatchSkipListener implements SkipListener<RawRecord, ProcessedRecord> {

    private final SkipRecordRepository skipRepo;

    public BatchSkipListener(SkipRecordRepository skipRepo) {
        this.skipRepo = skipRepo;
    }

    @Override
    public void onSkipInRead(Throwable t) {
        skipRepo.save(new SkipRecord("READ", t.getMessage(), Instant.now()));
    }

    @Override
    public void onSkipInProcess(RawRecord item, Throwable t) {
        skipRepo.save(new SkipRecord("PROCESS", item.toString(),
                t.getMessage(), Instant.now()));
    }

    @Override
    public void onSkipInWrite(ProcessedRecord item, Throwable t) {
        skipRepo.save(new SkipRecord("WRITE", item.toString(),
                t.getMessage(), Instant.now()));
    }
}
```

## 9. JobRepository

The JobRepository persists metadata about job executions, step executions, and execution contexts. Spring Batch requires a relational database for this metadata.

### 9.1 Configuration

```java
@Configuration
public class BatchInfraConfig {

    @Bean
    public JobRepository jobRepository(DataSource dataSource,
                                        PlatformTransactionManager txManager) throws Exception {
        JobRepositoryFactoryBean factory = new JobRepositoryFactoryBean();
        factory.setDataSource(dataSource);
        factory.setTransactionManager(txManager);
        factory.setTablePrefix("BATCH_");    // default table prefix
        factory.setIsolationLevelForCreate("ISOLATION_SERIALIZABLE");
        factory.setMaxVarCharLength(2500);
        factory.afterPropertiesSet();
        return factory.getObject();
    }

    // For development/testing only — in-memory repository
    @Bean
    @Profile("test")
    public JobRepository inMemoryJobRepository() throws Exception {
        JobRepositoryFactoryBean factory = new JobRepositoryFactoryBean();
        factory.setDataSource(new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .addScript("/org/springframework/batch/core/schema-h2.sql")
                .build());
        factory.setTransactionManager(new ResourcelessTransactionManager());
        factory.afterPropertiesSet();
        return factory.getObject();
    }
}
```

### 9.2 Schema Tables

```sql
-- Core tables created by Spring Batch schema scripts
-- BATCH_JOB_INSTANCE    — one row per unique job name + parameters combination
-- BATCH_JOB_EXECUTION   — one row per attempt to run a job instance
-- BATCH_JOB_EXECUTION_PARAMS — job parameters for each execution
-- BATCH_STEP_EXECUTION  — one row per step attempt
-- BATCH_STEP_EXECUTION_CONTEXT — serialized execution context for restart
-- BATCH_JOB_EXECUTION_CONTEXT  — serialized job-level execution context

-- Useful queries for monitoring
SELECT je.JOB_EXECUTION_ID, ji.JOB_NAME, je.STATUS, je.EXIT_CODE,
       je.START_TIME, je.END_TIME,
       TIMESTAMPDIFF(SECOND, je.START_TIME, je.END_TIME) AS duration_seconds
FROM BATCH_JOB_EXECUTION je
JOIN BATCH_JOB_INSTANCE ji ON je.JOB_INSTANCE_ID = ji.JOB_INSTANCE_ID
WHERE je.START_TIME >= CURRENT_DATE
ORDER BY je.START_TIME DESC;

-- Failed step details
SELECT se.STEP_NAME, se.STATUS, se.READ_COUNT, se.WRITE_COUNT,
       se.SKIP_COUNT, se.ROLLBACK_COUNT, se.EXIT_MESSAGE
FROM BATCH_STEP_EXECUTION se
WHERE se.JOB_EXECUTION_ID = ?
  AND se.STATUS = 'FAILED';
```

## 10. Conditional Flow

```java
@Bean
public Job conditionalJob(JobRepository jobRepository,
                           Step extractStep,
                           Step transformStep,
                           Step loadStep,
                           Step errorStep,
                           Step notifyStep) {
    return new JobBuilder("conditionalJob", jobRepository)
            .start(extractStep)
                .on("FAILED").to(errorStep)
                .on("*").to(transformStep)  // any other status
            .from(transformStep)
                .on("COMPLETED WITH SKIPS").to(notifyStep)
                .on("COMPLETED").to(loadStep)
                .on("FAILED").to(errorStep)
            .from(loadStep)
                .on("*").to(notifyStep)
            .from(errorStep)
                .on("*").fail()
            .end()
            .build();
}
```

## 11. Scheduling Batch Jobs

### 11.1 With @Scheduled

```java
@Component
@EnableScheduling
public class BatchScheduler {

    private final JobLauncher jobLauncher;
    private final Job dailyReportJob;

    public BatchScheduler(JobLauncher jobLauncher,
                           @Qualifier("dailyReportJob") Job dailyReportJob) {
        this.jobLauncher = jobLauncher;
        this.dailyReportJob = dailyReportJob;
    }

    @Scheduled(cron = "0 0 2 * * ?")  // 2:00 AM daily
    public void runDailyReport() {
        try {
            JobParameters params = new JobParametersBuilder()
                    .addLocalDate("reportDate", LocalDate.now().minusDays(1))
                    .addLong("timestamp", System.currentTimeMillis())
                    .toJobParameters();

            JobExecution execution = jobLauncher.run(dailyReportJob, params);
            if (execution.getStatus() == BatchStatus.FAILED) {
                // Alert on failure
                alertService.sendAlert("Daily report job failed: "
                        + execution.getExitStatus().getExitDescription());
            }
        } catch (Exception e) {
            alertService.sendAlert("Failed to launch daily report: " + e.getMessage());
        }
    }
}
```

### 11.2 With Quartz

```java
@Configuration
public class QuartzBatchConfig {

    @Bean
    public JobDetail batchJobDetail() {
        return JobBuilder.newJob(BatchQuartzJob.class)
                .withIdentity("importJob", "batchGroup")
                .usingJobData("jobName", "importCustomerJob")
                .storeDurably()
                .build();
    }

    @Bean
    public Trigger batchJobTrigger(JobDetail batchJobDetail) {
        return TriggerBuilder.newTrigger()
                .forJob(batchJobDetail)
                .withIdentity("importTrigger", "batchGroup")
                .withSchedule(CronScheduleBuilder
                        .cronSchedule("0 0 3 * * ?")   // 3 AM daily
                        .withMisfireHandlingInstructionFireAndProceed())
                .build();
    }
}

public class BatchQuartzJob extends QuartzJobBean {

    @Autowired
    private JobLauncher jobLauncher;

    @Autowired
    private ApplicationContext context;

    @Override
    protected void executeInternal(JobExecutionContext quartzContext) {
        String jobName = quartzContext.getMergedJobDataMap().getString("jobName");
        try {
            Job job = context.getBean(jobName, Job.class);
            JobParameters params = new JobParametersBuilder()
                    .addLong("quartzFireTime",
                            quartzContext.getFireTime().getTime())
                    .toJobParameters();
            jobLauncher.run(job, params);
        } catch (Exception e) {
            throw new RuntimeException("Batch job failed: " + jobName, e);
        }
    }
}
```

## 12. Monitoring Batch Jobs

### 12.1 Job Execution Listener

```java
@Component
public class JobCompletionListener implements JobExecutionListener {

    private static final Logger log = LoggerFactory.getLogger(JobCompletionListener.class);
    private final MeterRegistry meterRegistry;
    private final NotificationService notificationService;

    public JobCompletionListener(MeterRegistry meterRegistry,
                                  NotificationService notificationService) {
        this.meterRegistry = meterRegistry;
        this.notificationService = notificationService;
    }

    @Override
    public void beforeJob(JobExecution jobExecution) {
        log.info("Job {} starting with parameters: {}",
                jobExecution.getJobInstance().getJobName(),
                jobExecution.getJobParameters());
        meterRegistry.counter("batch.job.started",
                "job", jobExecution.getJobInstance().getJobName()).increment();
    }

    @Override
    public void afterJob(JobExecution jobExecution) {
        String jobName = jobExecution.getJobInstance().getJobName();
        Duration duration = Duration.between(
                jobExecution.getStartTime(), jobExecution.getEndTime());

        meterRegistry.timer("batch.job.duration", "job", jobName)
                .record(duration);

        // Aggregate step stats
        long totalRead = 0, totalWritten = 0, totalSkipped = 0;
        for (StepExecution step : jobExecution.getStepExecutions()) {
            totalRead += step.getReadCount();
            totalWritten += step.getWriteCount();
            totalSkipped += step.getSkipCount();
        }

        log.info("Job {} finished: status={}, duration={}s, read={}, written={}, skipped={}",
                jobName, jobExecution.getStatus(), duration.toSeconds(),
                totalRead, totalWritten, totalSkipped);

        if (jobExecution.getStatus() == BatchStatus.FAILED) {
            notificationService.notifyFailure(jobName,
                    jobExecution.getAllFailureExceptions());
        }
    }
}
```

### 12.2 REST Endpoint for Job Status

```java
@RestController
@RequestMapping("/api/batch")
public class BatchMonitoringController {

    private final JobExplorer jobExplorer;
    private final JobOperator jobOperator;

    public BatchMonitoringController(JobExplorer jobExplorer,
                                      JobOperator jobOperator) {
        this.jobExplorer = jobExplorer;
        this.jobOperator = jobOperator;
    }

    @GetMapping("/jobs")
    public List<String> listJobs() {
        return jobExplorer.getJobNames();
    }

    @GetMapping("/jobs/{jobName}/executions")
    public List<JobExecutionSummary> getExecutions(
            @PathVariable String jobName,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        List<JobInstance> instances = jobExplorer.getJobInstances(jobName, page * size, size);
        return instances.stream()
                .flatMap(i -> jobExplorer.getJobExecutions(i).stream())
                .sorted(Comparator.comparing(JobExecution::getStartTime).reversed())
                .map(this::toSummary)
                .toList();
    }

    @PostMapping("/jobs/{jobName}/stop/{executionId}")
    public ResponseEntity<String> stopJob(@PathVariable long executionId) throws Exception {
        jobOperator.stop(executionId);
        return ResponseEntity.ok("Stop signal sent");
    }

    @PostMapping("/jobs/{jobName}/restart/{executionId}")
    public ResponseEntity<Long> restartJob(@PathVariable long executionId) throws Exception {
        long newExecutionId = jobOperator.restart(executionId);
        return ResponseEntity.ok(newExecutionId);
    }

    private JobExecutionSummary toSummary(JobExecution je) {
        return new JobExecutionSummary(
                je.getId(),
                je.getJobInstance().getJobName(),
                je.getStatus().toString(),
                je.getStartTime(),
                je.getEndTime(),
                je.getStepExecutions().stream()
                        .mapToLong(StepExecution::getWriteCount).sum()
        );
    }
}
```

## 13. Performance Tuning

### 13.1 Key Configuration Properties

```yaml
# application.yml
spring:
  batch:
    jdbc:
      initialize-schema: always  # never in production
      table-prefix: BATCH_
    job:
      enabled: false  # don't auto-run on startup

  datasource:
    hikari:
      maximum-pool-size: 20         # enough for partitioned steps
      minimum-idle: 5
      connection-timeout: 30000

# For chunk steps
batch:
  chunk-size: 500
  thread-pool-size: 8
  partition-grid-size: 10
```

### 13.2 Performance Checklist

```java
/**
 * Performance tuning summary:
 *
 * 1. CHUNK SIZE: Start at 100, benchmark up to 1000.
 *    Larger = fewer transactions, more memory, bigger rollback window.
 *
 * 2. JDBC FETCH SIZE: Match or exceed chunk size.
 *    reader.setFetchSize(chunkSize) to avoid round-trips.
 *
 * 3. JDBC BATCH WRITE: Ensure batch updates are enabled.
 *    spring.jpa.properties.hibernate.jdbc.batch_size=100
 *
 * 4. PARTITIONING: For data-parallel workloads, partition by
 *    primary key ranges. Grid size = 2-4x CPU cores.
 *
 * 5. MULTI-THREADED STEP: Simpler than partitioning but reader
 *    must be thread-safe. Use SynchronizedItemStreamReader.
 *
 * 6. ASYNC PROCESSOR/WRITER: Offload expensive processing.
 *    Use AsyncItemProcessor + AsyncItemWriter pair.
 *
 * 7. SKIP vs FAIL: Configure skip for recoverable errors.
 *    Every rollback-and-retry is expensive.
 *
 * 8. INDEXES: Ensure WHERE clause columns used in readers
 *    are properly indexed.
 *
 * 9. DISABLE LOGGING in tight loops. Use DEBUG only when needed.
 *
 * 10. JOB REPOSITORY: Use a separate datasource for metadata
 *     to avoid contention with business data.
 */
```

### 13.3 Async Processing

```java
@Bean
public Step asyncStep(JobRepository jobRepository,
                       PlatformTransactionManager txManager) {
    return new StepBuilder("asyncStep", jobRepository)
            .<RawData, Future<ProcessedData>>chunk(100, txManager)
            .reader(reader())
            .processor(asyncProcessor())
            .writer(asyncWriter())
            .build();
}

@Bean
public AsyncItemProcessor<RawData, ProcessedData> asyncProcessor() {
    AsyncItemProcessor<RawData, ProcessedData> async = new AsyncItemProcessor<>();
    async.setDelegate(expensiveProcessor());  // the actual processor
    async.setTaskExecutor(new SimpleAsyncTaskExecutor("async-proc-"));
    return async;
}

@Bean
public AsyncItemWriter<ProcessedData> asyncWriter() {
    AsyncItemWriter<ProcessedData> async = new AsyncItemWriter<>();
    async.setDelegate(actualWriter());
    return async;
}
```

## 14. Testing Batch Jobs

```java
@SpringBatchTest
@SpringBootTest
class ImportCustomerJobTest {

    @Autowired
    private JobLauncherTestUtils jobLauncherTestUtils;

    @Autowired
    private JobRepositoryTestUtils jobRepositoryTestUtils;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanup() {
        jobRepositoryTestUtils.removeJobExecutions();
        jdbcTemplate.execute("DELETE FROM customers");
    }

    @Test
    void testFullJob() throws Exception {
        // Given — test CSV file in src/test/resources
        JobParameters params = new JobParametersBuilder()
                .addString("inputFile", "classpath:test-data/customers.csv")
                .addLong("timestamp", System.currentTimeMillis())
                .toJobParameters();

        // When
        JobExecution execution = jobLauncherTestUtils.launchJob(params);

        // Then
        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
        assertThat(execution.getExitStatus()).isEqualTo(ExitStatus.COMPLETED);

        int count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM customers", Integer.class);
        assertThat(count).isEqualTo(5);
    }

    @Test
    void testImportStepOnly() throws Exception {
        JobExecution execution = jobLauncherTestUtils.launchStep("importStep");

        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);

        StepExecution stepExecution = execution.getStepExecutions()
                .iterator().next();
        assertThat(stepExecution.getReadCount()).isEqualTo(5);
        assertThat(stepExecution.getWriteCount()).isEqualTo(5);
        assertThat(stepExecution.getSkipCount()).isZero();
    }
}
```

## 15. Complete Real-World Example: ETL Pipeline

```java
@Configuration
@RequiredArgsConstructor
public class DailySettlementBatchConfig {

    private final JobRepository jobRepository;
    private final PlatformTransactionManager txManager;
    private final DataSource dataSource;
    private final EntityManagerFactory emf;

    @Bean
    public Job dailySettlementJob(Step fetchTransactionsStep,
                                   Step calculateFeesStep,
                                   Step generateReportStep,
                                   Step archiveStep) {
        return new JobBuilder("dailySettlementJob", jobRepository)
                .incrementer(new RunIdIncrementer())
                .validator(new DefaultJobParametersValidator(
                        new String[]{"settlementDate"},  // required
                        new String[]{"dryRun"}            // optional
                ))
                .listener(new JobCompletionListener())
                .start(fetchTransactionsStep)
                .next(calculateFeesStep)
                .next(generateReportStep)
                .next(archiveStep)
                .build();
    }

    @Bean
    @StepScope
    public JdbcPagingItemReader<Transaction> transactionReader(
            @Value("#{jobParameters['settlementDate']}") LocalDate settlementDate) {

        Map<String, Order> sortKeys = Map.of("id", Order.ASCENDING);

        return new JdbcPagingItemReaderBuilder<Transaction>()
                .name("transactionReader")
                .dataSource(dataSource)
                .selectClause("id, merchant_id, amount, currency, status, created_at")
                .fromClause("transactions")
                .whereClause("DATE(created_at) = :settlementDate AND status = 'CAPTURED'")
                .sortKeys(sortKeys)
                .parameterValues(Map.of("settlementDate", settlementDate))
                .pageSize(500)
                .rowMapper(new BeanPropertyRowMapper<>(Transaction.class))
                .build();
    }

    @Bean
    public Step fetchTransactionsStep(JdbcPagingItemReader<Transaction> reader) {
        return new StepBuilder("fetchTransactionsStep", jobRepository)
                .<Transaction, SettlementLine>chunk(200, txManager)
                .reader(reader)
                .processor(settlementProcessor())
                .writer(settlementWriter())
                .faultTolerant()
                .skipLimit(20)
                .skip(CurrencyConversionException.class)
                .listener(new SettlementStepListener())
                .build();
    }

    @Bean
    public ItemProcessor<Transaction, SettlementLine> settlementProcessor() {
        return transaction -> {
            SettlementLine line = new SettlementLine();
            line.setTransactionId(transaction.getId());
            line.setMerchantId(transaction.getMerchantId());
            line.setGrossAmount(transaction.getAmount());

            // Calculate fees
            BigDecimal feeRate = getFeeRate(transaction.getMerchantId());
            BigDecimal fee = transaction.getAmount().multiply(feeRate)
                    .setScale(2, RoundingMode.HALF_UP);
            line.setFee(fee);
            line.setNetAmount(transaction.getAmount().subtract(fee));
            line.setSettledAt(Instant.now());
            return line;
        };
    }

    @Bean
    public JpaItemWriter<SettlementLine> settlementWriter() {
        JpaItemWriter<SettlementLine> writer = new JpaItemWriter<>();
        writer.setEntityManagerFactory(emf);
        return writer;
    }
}
```

This example demonstrates the full lifecycle of a Spring Batch application. Start with simple tasklet or chunk steps, add fault tolerance, then scale with partitioning or async processing as data volumes grow. Monitor everything through the JobRepository and custom metrics to keep batch pipelines healthy in production.
