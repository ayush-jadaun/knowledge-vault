---
title: "File Uploads"
description: "Complete guide to file uploads in Spring Boot — MultipartFile handling, streaming uploads for large files, Amazon S3 integration, image processing and thumbnails, virus scanning with ClamAV, presigned URLs, and production-ready upload pipelines"
tags: [spring-boot, file-upload, s3, multipart, storage]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# File Uploads

File uploads are deceptively complex. The simple case — accept a file, save it to disk — works in a tutorial but breaks in production. Large files exhaust memory. Concurrent uploads saturate disk I/O. Malicious files bypass extension checks. Thumbnail generation blocks request threads. Storage fills up on a single server. And none of this is apparent until you have real users uploading real files.

Spring Boot provides solid multipart upload support through `MultipartFile`, but building a production-ready upload pipeline requires understanding streaming, async processing, external storage, and security scanning.

## Basic File Upload

### Configuration

```yaml
spring:
  servlet:
    multipart:
      enabled: true
      max-file-size: 10MB          # Maximum size per file
      max-request-size: 50MB       # Maximum size of entire request
      file-size-threshold: 2KB     # Below this, files stay in memory
      location: /tmp/uploads       # Temp directory for buffered files
```

### Simple Upload Endpoint

```java
@RestController
@RequestMapping("/api/files")
public class FileUploadController {

    private final FileStorageService storageService;

    public FileUploadController(FileStorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping("/upload")
    public ResponseEntity<FileUploadResponse> uploadFile(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UserDetails user) {

        // Validate
        if (file.isEmpty()) {
            throw new BadRequestException("File is empty");
        }

        // Store
        FileMetadata metadata = storageService.store(file, user.getUsername());

        return ResponseEntity.ok(new FileUploadResponse(
                metadata.getId(),
                metadata.getOriginalFilename(),
                metadata.getContentType(),
                metadata.getSize(),
                metadata.getDownloadUrl()
        ));
    }

    @PostMapping("/upload/multiple")
    public ResponseEntity<List<FileUploadResponse>> uploadMultiple(
            @RequestParam("files") List<MultipartFile> files,
            @AuthenticationPrincipal UserDetails user) {

        if (files.size() > 10) {
            throw new BadRequestException("Maximum 10 files per upload");
        }

        List<FileUploadResponse> responses = files.stream()
                .filter(f -> !f.isEmpty())
                .map(f -> storageService.store(f, user.getUsername()))
                .map(FileUploadResponse::from)
                .toList();

        return ResponseEntity.ok(responses);
    }
}
```

### File Validation

Never trust client-provided filenames, content types, or extensions:

```java
@Component
public class FileValidator {

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg", "image/png", "image/gif", "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    // Magic bytes for common file types
    private static final Map<String, byte[]> MAGIC_BYTES = Map.of(
            "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF},
            "image/png", new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47},
            "image/gif", new byte[]{0x47, 0x49, 0x46, 0x38},
            "application/pdf", new byte[]{0x25, 0x50, 0x44, 0x46}
    );

    public void validate(MultipartFile file) {
        // 1. Check size
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new FileValidationException("File exceeds maximum size of 10MB");
        }

        // 2. Check content type
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new FileValidationException("File type not allowed: " + contentType);
        }

        // 3. Verify magic bytes (don't trust Content-Type header)
        try {
            byte[] header = new byte[8];
            file.getInputStream().read(header);
            if (!verifyMagicBytes(contentType, header)) {
                throw new FileValidationException(
                        "File content does not match declared type: " + contentType);
            }
        } catch (IOException e) {
            throw new FileValidationException("Cannot read file header", e);
        }

        // 4. Sanitize filename
        String filename = file.getOriginalFilename();
        if (filename != null && (filename.contains("..") || filename.contains("/"))) {
            throw new FileValidationException("Invalid filename: " + filename);
        }
    }

    private boolean verifyMagicBytes(String contentType, byte[] header) {
        byte[] expected = MAGIC_BYTES.get(contentType);
        if (expected == null) return true; // No magic bytes to check
        for (int i = 0; i < expected.length; i++) {
            if (header[i] != expected[i]) return false;
        }
        return true;
    }
}
```

## Streaming Uploads for Large Files

`MultipartFile` buffers the entire file in memory (or temp directory) before your controller method runs. For large files, this is wasteful. Streaming lets you process bytes as they arrive:

```java
@PostMapping("/upload/stream")
public ResponseEntity<FileUploadResponse> streamUpload(HttpServletRequest request)
        throws IOException, ServletException {

    // Parse multipart stream without buffering entire file
    Collection<Part> parts = request.getParts();
    Part filePart = parts.stream()
            .filter(p -> "file".equals(p.getName()))
            .findFirst()
            .orElseThrow(() -> new BadRequestException("No file part found"));

    String originalFilename = filePart.getSubmittedFileName();
    String contentType = filePart.getContentType();
    String storageKey = generateStorageKey(originalFilename);

    // Stream directly to S3 without buffering
    try (InputStream inputStream = filePart.getInputStream()) {
        storageService.storeStream(storageKey, inputStream,
                filePart.getSize(), contentType);
    }

    return ResponseEntity.ok(new FileUploadResponse(storageKey, originalFilename));
}
```

### Chunked Upload for Very Large Files

For files over 100MB, implement chunked uploads so clients can resume interrupted transfers:

```java
@RestController
@RequestMapping("/api/files/chunked")
public class ChunkedUploadController {

    private final ChunkedUploadService uploadService;

    @PostMapping("/init")
    public ResponseEntity<ChunkedUploadSession> initUpload(
            @RequestBody InitUploadRequest request) {
        ChunkedUploadSession session = uploadService.initSession(
                request.getFilename(),
                request.getTotalSize(),
                request.getChunkSize(),
                request.getContentType()
        );
        return ResponseEntity.ok(session);
    }

    @PostMapping("/{sessionId}/chunk/{chunkIndex}")
    public ResponseEntity<ChunkUploadResult> uploadChunk(
            @PathVariable String sessionId,
            @PathVariable int chunkIndex,
            @RequestParam("chunk") MultipartFile chunk) {

        ChunkUploadResult result = uploadService.uploadChunk(
                sessionId, chunkIndex, chunk);

        if (result.isComplete()) {
            // All chunks received — assemble the file
            uploadService.assembleFile(sessionId);
        }

        return ResponseEntity.ok(result);
    }

    @GetMapping("/{sessionId}/status")
    public ResponseEntity<UploadStatus> getStatus(@PathVariable String sessionId) {
        return ResponseEntity.ok(uploadService.getStatus(sessionId));
    }
}
```

```java
@Service
public class ChunkedUploadService {

    private final Map<String, ChunkedUploadSession> sessions = new ConcurrentHashMap<>();

    public ChunkedUploadSession initSession(String filename, long totalSize,
                                             int chunkSize, String contentType) {
        String sessionId = UUID.randomUUID().toString();
        int totalChunks = (int) Math.ceil((double) totalSize / chunkSize);

        ChunkedUploadSession session = new ChunkedUploadSession(
                sessionId, filename, totalSize, chunkSize, totalChunks, contentType);
        sessions.put(sessionId, session);

        return session;
    }

    public ChunkUploadResult uploadChunk(String sessionId, int chunkIndex,
                                          MultipartFile chunk) {
        ChunkedUploadSession session = sessions.get(sessionId);
        if (session == null) {
            throw new NotFoundException("Upload session not found: " + sessionId);
        }

        // Save chunk to temp storage
        Path chunkPath = Path.of("/tmp/chunks", sessionId,
                String.format("chunk_%05d", chunkIndex));
        try {
            Files.createDirectories(chunkPath.getParent());
            chunk.transferTo(chunkPath);
        } catch (IOException e) {
            throw new StorageException("Failed to save chunk", e);
        }

        session.markChunkComplete(chunkIndex);

        return new ChunkUploadResult(
                chunkIndex,
                session.getCompletedChunks(),
                session.getTotalChunks(),
                session.isComplete()
        );
    }

    public void assembleFile(String sessionId) {
        ChunkedUploadSession session = sessions.get(sessionId);
        Path assembledPath = Path.of("/tmp/assembled", session.getFilename());

        try (OutputStream out = Files.newOutputStream(assembledPath)) {
            for (int i = 0; i < session.getTotalChunks(); i++) {
                Path chunkPath = Path.of("/tmp/chunks", sessionId,
                        String.format("chunk_%05d", i));
                Files.copy(chunkPath, out);
            }
        } catch (IOException e) {
            throw new StorageException("Failed to assemble file", e);
        }

        // Clean up chunks
        cleanupChunks(sessionId);
        sessions.remove(sessionId);
    }
}
```

## Amazon S3 Integration

Local file storage does not scale. With multiple application instances behind a load balancer, files uploaded to one server are invisible to others. Amazon S3 (or any S3-compatible storage like MinIO) is the standard solution.

### Dependencies and Configuration

```xml
<dependency>
    <groupId>software.amazon.awssdk</groupId>
    <artifactId>s3</artifactId>
</dependency>
<dependency>
    <groupId>software.amazon.awssdk</groupId>
    <artifactId>s3-transfer-manager</artifactId>
</dependency>
```

```yaml
aws:
  s3:
    bucket: my-app-uploads
    region: us-east-1
    prefix: uploads/
  credentials:
    access-key: ${AWS_ACCESS_KEY_ID}
    secret-key: ${AWS_SECRET_ACCESS_KEY}
```

### S3 Storage Service

```java
@Service
public class S3StorageService implements FileStorageService {

    private final S3Client s3Client;
    private final S3Presigner presigner;
    private final String bucket;
    private final String prefix;

    public S3StorageService(S3Client s3Client, S3Presigner presigner,
                            @Value("${aws.s3.bucket}") String bucket,
                            @Value("${aws.s3.prefix}") String prefix) {
        this.s3Client = s3Client;
        this.presigner = presigner;
        this.bucket = bucket;
        this.prefix = prefix;
    }

    @Override
    public FileMetadata store(MultipartFile file, String uploadedBy) {
        String key = generateKey(file.getOriginalFilename());

        Map<String, String> metadata = Map.of(
                "uploaded-by", uploadedBy,
                "original-filename", file.getOriginalFilename(),
                "upload-timestamp", Instant.now().toString()
        );

        try {
            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(file.getContentType())
                    .contentLength(file.getSize())
                    .metadata(metadata)
                    .serverSideEncryption(ServerSideEncryption.AES256)
                    .build();

            s3Client.putObject(request,
                    RequestBody.fromInputStream(file.getInputStream(), file.getSize()));

            return new FileMetadata(
                    key,
                    file.getOriginalFilename(),
                    file.getContentType(),
                    file.getSize(),
                    generateDownloadUrl(key)
            );
        } catch (IOException e) {
            throw new StorageException("Failed to upload to S3", e);
        }
    }

    @Override
    public InputStream retrieve(String key) {
        GetObjectRequest request = GetObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build();
        return s3Client.getObject(request);
    }

    @Override
    public void delete(String key) {
        s3Client.deleteObject(DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build());
    }

    private String generateKey(String originalFilename) {
        String extension = getExtension(originalFilename);
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        return prefix + date + "/" + UUID.randomUUID() + "." + extension;
    }

    private String generateDownloadUrl(String key) {
        return "/api/files/download/" + URLEncoder.encode(key, StandardCharsets.UTF_8);
    }
}
```

## Presigned URLs

Presigned URLs let clients upload directly to S3, bypassing your application server entirely. This eliminates the upload bottleneck and bandwidth cost on your server:

```
┌──────────┐                    ┌──────────────┐                ┌─────┐
│  Client   │ ──1. Request ───→ │  App Server   │                │ S3  │
│           │ ←─2. Presigned ── │               │                │     │
│           │        URL        │               │                │     │
│           │ ──3. PUT file ────────────────────────────────────→│     │
│           │ ←─4. 200 OK ──────────────────────────────────────│     │
│           │ ──5. Confirm ───→ │               │                │     │
└──────────┘                    └──────────────┘                └─────┘
```

```java
@PostMapping("/upload/presigned")
public ResponseEntity<PresignedUploadResponse> getPresignedUrl(
        @RequestBody PresignedUploadRequest request,
        @AuthenticationPrincipal UserDetails user) {

    String key = generateKey(request.getFilename());

    PutObjectRequest objectRequest = PutObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .contentType(request.getContentType())
            .metadata(Map.of("uploaded-by", user.getUsername()))
            .build();

    PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
            .signatureDuration(Duration.ofMinutes(15))
            .putObjectRequest(objectRequest)
            .build();

    PresignedPutObjectRequest presigned = presigner.presignPutObject(presignRequest);

    return ResponseEntity.ok(new PresignedUploadResponse(
            presigned.url().toString(),
            key,
            presigned.expiration()
    ));
}

// Download with presigned URL
@GetMapping("/download/presigned/{key}")
public ResponseEntity<PresignedDownloadResponse> getPresignedDownloadUrl(
        @PathVariable String key) {

    GetObjectRequest getRequest = GetObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .build();

    GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
            .signatureDuration(Duration.ofHours(1))
            .getObjectRequest(getRequest)
            .build();

    PresignedGetObjectRequest presigned = presigner.presignGetObject(presignRequest);

    return ResponseEntity.ok(new PresignedDownloadResponse(
            presigned.url().toString(),
            presigned.expiration()
    ));
}
```

## Image Processing

### Thumbnail Generation

```java
@Service
public class ImageProcessingService {

    private static final Map<String, int[]> THUMBNAIL_SIZES = Map.of(
            "small", new int[]{150, 150},
            "medium", new int[]{400, 400},
            "large", new int[]{800, 800}
    );

    @Async("imageProcessingExecutor")
    public CompletableFuture<Map<String, String>> generateThumbnails(
            String originalKey, InputStream imageStream) {

        try {
            BufferedImage original = ImageIO.read(imageStream);
            if (original == null) {
                throw new ImageProcessingException("Cannot read image");
            }

            Map<String, String> thumbnailKeys = new HashMap<>();

            for (Map.Entry<String, int[]> entry : THUMBNAIL_SIZES.entrySet()) {
                String size = entry.getKey();
                int maxWidth = entry.getValue()[0];
                int maxHeight = entry.getValue()[1];

                BufferedImage thumbnail = resize(original, maxWidth, maxHeight);
                String thumbnailKey = originalKey.replace(".", "_" + size + ".");

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                ImageIO.write(thumbnail, "jpeg", baos);

                s3StorageService.storeBytes(thumbnailKey, baos.toByteArray(),
                        "image/jpeg");
                thumbnailKeys.put(size, thumbnailKey);
            }

            return CompletableFuture.completedFuture(thumbnailKeys);
        } catch (IOException e) {
            return CompletableFuture.failedFuture(
                    new ImageProcessingException("Thumbnail generation failed", e));
        }
    }

    private BufferedImage resize(BufferedImage original, int maxWidth, int maxHeight) {
        int width = original.getWidth();
        int height = original.getHeight();
        double ratio = Math.min(
                (double) maxWidth / width,
                (double) maxHeight / height
        );

        if (ratio >= 1.0) return original; // Don't upscale

        int newWidth = (int) (width * ratio);
        int newHeight = (int) (height * ratio);

        BufferedImage resized = new BufferedImage(newWidth, newHeight,
                BufferedImage.TYPE_INT_RGB);
        Graphics2D g = resized.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(original, 0, 0, newWidth, newHeight, null);
        g.dispose();

        return resized;
    }
}
```

### EXIF Stripping and Auto-Rotation

```java
public BufferedImage stripExifAndAutoRotate(InputStream imageStream) throws IOException {
    Metadata metadata = ImageMetadataReader.readMetadata(imageStream);
    ExifIFD0Directory exifDir = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);

    BufferedImage image = ImageIO.read(imageStream);

    if (exifDir != null && exifDir.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) {
        int orientation = exifDir.getInt(ExifIFD0Directory.TAG_ORIENTATION);
        image = applyOrientation(image, orientation);
    }

    return image;
}

private BufferedImage applyOrientation(BufferedImage image, int orientation) {
    return switch (orientation) {
        case 3 -> rotate(image, 180);
        case 6 -> rotate(image, 90);
        case 8 -> rotate(image, 270);
        default -> image;
    };
}
```

## Virus Scanning with ClamAV

Every file upload from untrusted users should be scanned for malware. ClamAV is the standard open-source solution:

```java
@Service
public class VirusScanService {

    private final String clamavHost;
    private final int clamavPort;

    public VirusScanService(
            @Value("${clamav.host:localhost}") String clamavHost,
            @Value("${clamav.port:3310}") int clamavPort) {
        this.clamavHost = clamavHost;
        this.clamavPort = clamavPort;
    }

    /**
     * Scans a file using ClamAV's INSTREAM protocol.
     * Returns true if the file is clean.
     */
    public ScanResult scan(InputStream fileStream) {
        try (Socket socket = new Socket(clamavHost, clamavPort);
             OutputStream out = socket.getOutputStream();
             InputStream in = socket.getInputStream()) {

            // Send INSTREAM command
            out.write("zINSTREAM\0".getBytes());

            // Send file in chunks
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = fileStream.read(buffer)) != -1) {
                // Each chunk: 4-byte length prefix (big-endian) + data
                out.write(intToBytes(bytesRead));
                out.write(buffer, 0, bytesRead);
            }

            // End of stream marker: zero-length chunk
            out.write(intToBytes(0));
            out.flush();

            // Read response
            String response = new String(in.readAllBytes()).trim();
            boolean clean = response.endsWith("OK");

            return new ScanResult(clean, response);
        } catch (IOException e) {
            log.error("ClamAV scan failed", e);
            throw new VirusScanException("Virus scan unavailable", e);
        }
    }

    private byte[] intToBytes(int value) {
        return ByteBuffer.allocate(4).putInt(value).array();
    }
}
```

### Integrating Scanning into the Upload Pipeline

```java
@Service
public class SecureFileUploadService {

    private final FileValidator validator;
    private final VirusScanService virusScanner;
    private final S3StorageService storageService;
    private final ImageProcessingService imageProcessor;

    /**
     * Full upload pipeline: validate → scan → store → process
     */
    @Transactional
    public FileMetadata upload(MultipartFile file, String userId) {
        // Step 1: Validate file type, size, magic bytes
        validator.validate(file);

        // Step 2: Virus scan
        try {
            ScanResult scanResult = virusScanner.scan(file.getInputStream());
            if (!scanResult.isClean()) {
                log.warn("Malware detected in upload from user {}: {}",
                        userId, scanResult.getDetails());
                throw new MalwareDetectedException(
                        "File rejected: malware detected");
            }
        } catch (IOException e) {
            throw new StorageException("Cannot read file for scanning", e);
        }

        // Step 3: Store original
        FileMetadata metadata = storageService.store(file, userId);

        // Step 4: Async post-processing (thumbnails, etc.)
        if (metadata.getContentType().startsWith("image/")) {
            try {
                imageProcessor.generateThumbnails(
                        metadata.getStorageKey(),
                        file.getInputStream());
            } catch (IOException e) {
                log.warn("Thumbnail generation failed for {}", metadata.getId(), e);
            }
        }

        return metadata;
    }
}
```

## Download Endpoint with Range Support

Support resumable downloads and video streaming with HTTP Range headers:

```java
@GetMapping("/download/{*key}")
public ResponseEntity<StreamingResponseBody> download(
        @PathVariable String key,
        @RequestHeader(value = "Range", required = false) String rangeHeader) {

    FileMetadata metadata = storageService.getMetadata(key);

    if (rangeHeader != null) {
        return handleRangeRequest(key, metadata, rangeHeader);
    }

    StreamingResponseBody body = outputStream -> {
        try (InputStream input = storageService.retrieve(key)) {
            input.transferTo(outputStream);
        }
    };

    return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"" + metadata.getOriginalFilename() + "\"")
            .contentType(MediaType.parseMediaType(metadata.getContentType()))
            .contentLength(metadata.getSize())
            .body(body);
}

private ResponseEntity<StreamingResponseBody> handleRangeRequest(
        String key, FileMetadata metadata, String rangeHeader) {

    long fileSize = metadata.getSize();
    long[] range = parseRange(rangeHeader, fileSize);
    long start = range[0];
    long end = range[1];
    long contentLength = end - start + 1;

    StreamingResponseBody body = outputStream -> {
        try (InputStream input = storageService.retrieveRange(key, start, end)) {
            input.transferTo(outputStream);
        }
    };

    return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
            .header(HttpHeaders.CONTENT_RANGE,
                    "bytes " + start + "-" + end + "/" + fileSize)
            .header(HttpHeaders.ACCEPT_RANGES, "bytes")
            .contentType(MediaType.parseMediaType(metadata.getContentType()))
            .contentLength(contentLength)
            .body(body);
}
```

## Production Checklist

| Concern | Recommendation |
|---------|---------------|
| Storage | Use S3 or S3-compatible (MinIO, GCS) — never local filesystem in multi-instance deployments |
| Size limits | Set `max-file-size` and `max-request-size` in config; validate in code too |
| File type validation | Check magic bytes, not just Content-Type header or extension |
| Virus scanning | ClamAV for all user-uploaded files |
| Filename sanitization | Strip path components, generate UUID-based storage keys |
| Access control | Presigned URLs with short TTL; never expose S3 keys directly |
| Encryption | S3 server-side encryption (SSE-S3 or SSE-KMS); TLS in transit |
| Cleanup | Lifecycle policies to delete orphaned files; scheduled cleanup jobs |
| Monitoring | Track upload sizes, failure rates, processing times, storage usage |
| CDN | CloudFront in front of S3 for downloads; invalidation on delete |

File uploads are a surface area for security vulnerabilities, performance problems, and operational headaches. Validate aggressively, scan for malware, store externally, process asynchronously, and serve through a CDN. The upload endpoint itself should do as little work as possible — accept the file, validate it, hand it off, and return immediately.
