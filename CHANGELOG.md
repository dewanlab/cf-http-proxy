# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-26

### Added - v1.0.0

- **Universal HTTP Reverse Proxy**: Core Worker implementation in `src/index.ts`.
- **Dynamic Origin Config**: Support for `TARGET_URL` environment variable with path and trailing slash normalization.
- **Full Request Forwarding**: Complete preservation of HTTP methods, headers (Host header rewriting), query parameters, URL path hierarchies, and streaming request bodies (`duplex: "half"`).
- **Global CORS Support**: Global `Access-Control-Allow-Origin: *` headers across all proxied/error responses and `OPTIONS` preflight (204 No Content) handling.
- **Edge Error Handling**: Structured JSON error responses for configuration errors (`500`) and upstream origin connection failures (`502` / `504`).
- **Unit Testing**: Test suite written with Vitest and `@cloudflare/vitest-plugin`.
- **Linting & Formatting**: ESLint flat config (`eslint.config.js`), Prettier configuration (`.prettierrc`, `.prettierignore`), and typecheck scripts.
- **CI & Git Hooks**: GitHub Actions workflow (`.github/workflows/ci.yml`) and Husky pre-commit hooks (`lint-staged`).
- **Project Documentation**: `README.md`, `LICENSE`, and `.dev.vars.example`.
