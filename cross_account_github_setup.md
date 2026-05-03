# Cross-Account GitHub Release Setup

## Context
This project (`mictab`) is configured to build on a **private repository** hosted on a new GitHub account, but publish its release files (`.exe`, `.dmg`) to a **public repository** (`sayedaljohon/mictab-releases`) hosted on the original GitHub account.

## How it works
1. **`package.json` configuration**: 
   The `build.publish` section is hardcoded to target the original public repository:
   ```json
   "publish": {
     "provider": "github",
     "owner": "sayedaljohon",
     "repo": "mictab-releases",
     "releaseType": "draft"
   }
   ```

2. **GitHub Actions Workflows**:
   The workflow files (`.github/workflows/build-and-release.yml`, `build-mac.yml`, `build-windows.yml`) are configured to use a custom secret for authentication instead of the default `GITHUB_TOKEN`:
   ```yaml
   env:
     GH_TOKEN: ${{ secrets.RELEASE_TOKEN }}
     GITHUB_TOKEN: ${{ secrets.RELEASE_TOKEN }}
   ```

## Setup Requirements (For the New Account)
For this setup to work on a new GitHub account, the following must be done:
1. Generate a **Classic Personal Access Token (PAT)** from the original account (`sayedaljohon`) with the `repo` scope.
2. Go to the new private repository on the new account.
3. Navigate to **Settings > Secrets and variables > Actions**.
4. Add a new repository secret named `RELEASE_TOKEN` and paste the PAT from step 1.

By referencing this file, future AI assistants will instantly understand how the cross-account release architecture is structured without needing to investigate the `.github/workflows` or `package.json` manually.
