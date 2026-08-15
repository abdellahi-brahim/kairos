# Contributing

## Development Flow

1. Create a feature branch.
2. Make focused changes.
3. Run local checks.
4. Open a pull request with a clear description.

## Local Checks

```bash
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Commit Style

Use concise, imperative commit messages that describe the behavior change.

## Scope

Keep pull requests small and reviewable. Split large work into separate PRs.
