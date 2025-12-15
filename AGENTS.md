# AGENTS.md Instructions

A two-way LAN file-sharing CLI tool built with Bun. Share files across your local network with a simple QR code scan.

## Setup commands

- Install dependencies: `bun install`
- Build project: `bun run build` (builds both UI and CLI binary)
- Build UI only: `bun run build:ui`
- Format code: `bun run format`
- Check formatting: `bun run format:check`
- Type check: `bun run check-types`
- Run CLI: `bun run index.ts` or `bun run start`

## Runtime and build system

- **Use Bun, not Node.js**: This project uses Bun as the runtime and build tool
- The project entry point is `index.ts`
- Binary compilation uses Bun's build API (see `build.ts`)
- No npm, pnpm, or yarn - use `bun` commands only

## Code style

- **TypeScript strict mode**: Enabled with strict type checking
- **Double quotes**: Use double quotes for strings (not single quotes)
- **Semicolons**: Always use semicolons
- **Print width**: 100 characters
- **Indentation**: 2 spaces (no tabs)
- **Trailing commas**: ES5 style
- **Arrow functions**: Always use parentheses around parameters

Run `bun run format` before committing to ensure consistent formatting.

## Project structure

- `src/cli.ts` - CLI argument parsing and command handling
- `src/server.ts` - HTTP server implementation
- `src/router.ts` - Route handlers
- `src/ui/` - React-based web UI
  - `src/ui/components/` - React components
  - `src/ui/build.ts` - UI build script
- `index.ts` - Main entry point
- `build.ts` - Binary compilation script
- `src/types/` - TypeScript type definitions

## Validation requirements (MANDATORY)

**ALL checks MUST pass before marking work complete. If any check fails, fix it and re-run ALL checks.**

### 1. Code quality

```bash
bun run format
bun run check-types   # MUST pass with zero errors
```

### 2. Build and runtime

```bash
bun run build
./dist/qrdrop --help  # MUST work
```

### 3. Functional testing (for feature changes)

Test relevant functionality:

- File sharing: `./dist/qrdrop --file <test-file>`
- File receiving: `./dist/qrdrop --output ./test-downloads`
- CLI commands: `./dist/qrdrop init`, `./dist/qrdrop status`, `./dist/qrdrop cert generate`
- Web UI: Verify UI loads and functions correctly

### 4. Code review checklist

- [ ] All TypeScript types are correct (no `any` unless necessary)
- [ ] No unused imports
- [ ] Proper error handling in all functions
- [ ] No console.log in production code (use logger)
- [ ] No hardcoded values that should be configurable
- [ ] Security considerations addressed (if applicable)
- [ ] Documentation updated (if adding features)

## Development workflow

1. Make code changes
2. Run validation checks (see above)
3. Test functionality
4. Verify no regressions
5. Update documentation if needed

## Important notes

- **No external system dependencies**: Self-signed certificates use `selfsigned` library (no OpenSSL), zip files use `archiver` (no `zip` command needed)
- **Configuration**: Supports TOML config files and environment variables (precedence: CLI args > config file > env vars)
- **Security features**: IP allowlists, rate limiting, file type restrictions, path traversal protection
- **Two-way sharing**: Supports simultaneous send and receive operations
- **Web UI**: Modern React-based interface with drag-and-drop, progress tracking, and real-time updates
