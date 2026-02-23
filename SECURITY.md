# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **DO NOT** open a public issue
2. Email the maintainers directly or use GitHub's private vulnerability reporting
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix release**: Depending on severity

## Security Best Practices

When running Synapse Live Debug:

- Run on localhost only (default behavior)
- Do not expose port 8421 to public internet
- Use behind a reverse proxy with authentication for remote access
- Keep dependencies updated

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers in our release notes.
