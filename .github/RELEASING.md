# Releasing Kairos

The `Release Kairos` workflow builds and publishes Apple Silicon DMGs from `main`. Start it manually from the GitHub Actions page or with the GitHub CLI.

## Preview

Preview releases use ad-hoc signing and are published as GitHub prereleases. They include the DMG and `SHA256SUMS.txt`.

Use a prerelease tag such as `v0.1.0-preview.2`:

```bash
gh workflow run release.yml \
  --repo abdellahi-brahim/kairos \
  -f channel=preview \
  -f tag=v0.1.0-preview.2
```

Preview release notes must state that the build is not notarized and explain the macOS right-click **Open** flow.

## Stable

Stable releases require Developer ID signing and Apple notarization. The workflow refuses to publish a stable release when any required credential is missing.

Configure these repository secrets:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`
- `APPLE_CERTIFICATE_PASSWORD`: password used when exporting the `.p12`
- `APPLE_SIGNING_IDENTITY`: full Developer ID Application identity
- `APPLE_ID`: Apple ID used for notarization
- `APPLE_PASSWORD`: app-specific password for that Apple ID
- `APPLE_TEAM_ID`: Apple Developer team ID

Use a clean version tag that matches the versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`:

```bash
gh workflow run release.yml \
  --repo abdellahi-brahim/kairos \
  -f channel=stable \
  -f tag=v0.1.0
```

## Verification

Before dispatching either channel:

```bash
pnpm release:check
```

After the workflow finishes:

1. Confirm the release points to the intended `main` commit.
2. Download the published DMG and `SHA256SUMS.txt`.
3. Verify the checksum with `shasum -a 256 -c SHA256SUMS.txt`.
4. For stable builds, verify Gatekeeper acceptance with `spctl -a -vv --type execute Kairos.app`.