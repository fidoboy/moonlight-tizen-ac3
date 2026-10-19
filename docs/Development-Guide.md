---
layout: docs-page
lang: en
title: "Development Guide"
description: "Build Moonlight Tizen locally, inspect CI artifacts and publish versioned releases."
---

# Development Guide

## Repository and dependencies

Clone this repository before building:

```bash
git clone https://github.com/fidoboy/moonlight-tizen-ac3.git
cd moonlight-tizen-ac3
```

The current repository has no active Git submodules: the required dependency source trees are committed directly to the repository. A normal clone is sufficient; `git submodule update --init --recursive` is not required.

## Build with Docker

The repository Dockerfile includes the build environment and packages the Tizen widget. From the repository root, build the standard variant:

```bash
docker build --tag moonlight-tizen-ac3:standard --build-arg BUILD_TYPE=release --build-arg REPO_OWNER=fidoboy --build-arg REPO_NAME=moonlight-tizen-ac3 --build-arg FORCE_GAME_MODE=false .
container_id=$(docker create moonlight-tizen-ac3:standard)
docker cp "$container_id:/home/moonlight/Moonlight.wgt" ./Moonlight.wgt
docker rm "$container_id"
```

To build the ForceGM package, repeat the build with `FORCE_GAME_MODE=true` and extract `/home/moonlight/Moonlight-ForceGM.wgt`.

## Continuous integration

The **Build WGT (CI)** workflow validates startup JavaScript, locale consistency and required documentation pages, then builds the standard and ForceGM package variants. It runs on changes to the `master` branch and on pull requests, and can also be launched manually. CI artifacts are temporary test builds, not versioned public releases.

## Publish a versioned public release

The project uses its own semantic version sequence, starting at **1.0.0**. The Tizen widget version in `res/config.xml` is the source of truth.

1. Update the version in `res/config.xml` (for example, `1.0.1` for the next patch release).
2. Add release notes near the top of `CHANGELOG.md`.
3. Commit and merge the release changes to `master`.
4. Open Actions → **Release WGTs**, run it on `master`, and enter the same version. The workflow validates the version, refuses to overwrite an existing public release, builds both WGT variants and publishes a public GitHub Release tagged `vVERSION`.

Alternatively, push a Git tag such as `v1.0.1` after setting the matching `res/config.xml` version. The same workflow builds the packages and attaches them to the release automatically. Stable releases use the plain semantic version tag; prerelease builds use a `-dev` suffix.

## Audio development notes

Dolby passthrough requires the Tizen client and a compatible experimental Sunshine host. It is optional and must never disable the default OPUS path for hosts that do not offer AC-3/E-AC-3. When testing, verify actual negotiation and output through the TV's intended optical path, not merely the selected setting.

Keep pull requests focused, retain license notices, and document hardware-dependent behavior and test conditions.
