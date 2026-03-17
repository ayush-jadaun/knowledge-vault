# =============================================================================
# CloudFront — CDN for Static Assets
# =============================================================================
# Creates:
#   - S3 bucket for static assets (private)
#   - Origin Access Identity (OAI) for secure S3 access
#   - CloudFront distribution with caching and compression
#   - Cache policy optimized for static content
# =============================================================================

# ---------------------------------------------------------------------------
# S3 Bucket for static assets
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "static_assets" {
  count = var.enable_cloudfront ? 1 : 0

  bucket = "${local.name_prefix}-static-${random_id.suffix.hex}"

  tags = {
    Name = "${local.name_prefix}-static-assets"
  }
}

# Block all public access — CloudFront will access via OAI
resource "aws_s3_bucket_public_access_block" "static_assets" {
  count = var.enable_cloudfront ? 1 : 0

  bucket = aws_s3_bucket.static_assets[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning for rollback capability
resource "aws_s3_bucket_versioning" "static_assets" {
  count = var.enable_cloudfront ? 1 : 0

  bucket = aws_s3_bucket.static_assets[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "static_assets" {
  count = var.enable_cloudfront ? 1 : 0

  bucket = aws_s3_bucket.static_assets[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# CORS configuration for browser access
resource "aws_s3_bucket_cors_configuration" "static_assets" {
  count = var.enable_cloudfront ? 1 : 0

  bucket = aws_s3_bucket.static_assets[0].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["https://${var.domain_name}"]
    expose_headers  = ["ETag"]
    max_age_seconds = 86400
  }
}

# ---------------------------------------------------------------------------
# CloudFront Origin Access Identity (OAI)
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_identity" "static" {
  count = var.enable_cloudfront ? 1 : 0

  comment = "OAI for ${local.name_prefix} static assets"
}

# S3 bucket policy — allow CloudFront OAI to read objects
resource "aws_s3_bucket_policy" "static_assets" {
  count = var.enable_cloudfront ? 1 : 0

  bucket = aws_s3_bucket.static_assets[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAI"
        Effect = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.static[0].iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.static_assets[0].arn}/*"
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# CloudFront Cache Policy
# ---------------------------------------------------------------------------
resource "aws_cloudfront_cache_policy" "static" {
  count = var.enable_cloudfront ? 1 : 0

  name        = "${local.name_prefix}-static-cache-policy"
  comment     = "Cache policy for static assets"
  default_ttl = 86400    # 1 day
  max_ttl     = 31536000 # 1 year
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# ---------------------------------------------------------------------------
# CloudFront Distribution
# ---------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "static" {
  count = var.enable_cloudfront ? 1 : 0

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CDN for ${local.name_prefix} static assets"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  http_version        = "http2and3"

  # Custom domain (optional)
  aliases = var.cloudfront_certificate_arn != "" ? ["static.${var.domain_name}"] : []

  # S3 origin
  origin {
    domain_name = aws_s3_bucket.static_assets[0].bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.static_assets[0].id}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.static[0].cloudfront_access_identity_path
    }
  }

  # Default cache behavior
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.static_assets[0].id}"
    cache_policy_id        = aws_cloudfront_cache_policy.static[0].id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Security headers
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id
  }

  # Custom error responses — serve SPA fallback
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  # Geo restriction — no restrictions by default
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL/TLS
  viewer_certificate {
    # Use custom certificate if provided, otherwise use CloudFront default
    cloudfront_default_certificate = var.cloudfront_certificate_arn == ""
    acm_certificate_arn            = var.cloudfront_certificate_arn != "" ? var.cloudfront_certificate_arn : null
    ssl_support_method             = var.cloudfront_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = var.cloudfront_certificate_arn != "" ? "TLSv1.2_2021" : "TLSv1"
  }

  tags = {
    Name = "${local.name_prefix}-cdn"
  }
}

# ---------------------------------------------------------------------------
# Response Headers Policy — security headers
# ---------------------------------------------------------------------------
resource "aws_cloudfront_response_headers_policy" "security" {
  count = var.enable_cloudfront ? 1 : 0

  name    = "${local.name_prefix}-security-headers"
  comment = "Security headers for ${local.name_prefix}"

  security_headers_config {
    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000 # 2 years
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      override = true
      value    = "camera=(), microphone=(), geolocation=()"
    }
  }
}
