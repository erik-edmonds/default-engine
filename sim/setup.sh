#!/usr/bin/env bash
# One-time setup for field generation: CropCraft at a pinned commit, and the
# three packages its Blender-side code imports.
#
#   sim/setup.sh
#
# Idempotent. Everything it creates lives under sim/.cache, which is ignored.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="$HERE/.cache"

# PINNED, because CropCraft is the source of the ground truth and an upstream
# change to how plants are placed would silently change every number measured
# against it. This is its head as of 2026-10-28 ("add optional
# CROPCRAFT_BLENDER env variable"). Apache-2.0.
CROPCRAFT_REPO="https://github.com/Romea/cropcraft.git"
CROPCRAFT_SHA="78f22056fa1d9e8f832ab5511036fb30553e4c94"

BLENDER="${CROPCRAFT_BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
if [ ! -x "$BLENDER" ]; then
  echo "Blender not found at $BLENDER -- set CROPCRAFT_BLENDER to its executable." >&2
  exit 1
fi

mkdir -p "$CACHE"

# HTTPS rather than SSH: the repository is public, and a clone that needs a
# key is a clone that fails on every machine but one.
if [ ! -d "$CACHE/cropcraft/.git" ]; then
  git clone --quiet "$CROPCRAFT_REPO" "$CACHE/cropcraft"
fi
git -C "$CACHE/cropcraft" fetch --quiet origin
git -C "$CACHE/cropcraft" -c advice.detachedHead=false checkout --quiet "$CROPCRAFT_SHA"
echo "cropcraft at $(git -C "$CACHE/cropcraft" rev-parse --short HEAD)"

# CropCraft's core/__init__.py pip-installs anything it cannot import INTO
# BLENDER'S OWN PYTHON -- that is, into Blender.app. Installing the same
# packages into a side directory and exposing it through PYTHONPATH means its
# find_spec() succeeds and the application bundle is never written to.
#
# FOUR PACKAGES, NOT THREE. The first version of this script installed pyyaml,
# appdirs and msgpack and missed pillow, so the very first CropCraft run
# installed pillow into Blender.app -- the exact side effect this block exists
# to prevent. The list below is every `_find_spec` check in that file except
# numpy, which Blender ships. If CropCraft is re-pinned, re-read that file.
#
# Blender's bundled interpreter does the installing, so compiled wheels match
# its ABI whatever the system Python happens to be.
BPY="$("$BLENDER" --background --python-expr 'import sys; print("BPY_EXE", sys.executable)' 2>/dev/null | awk '/^BPY_EXE/{print $2}')"
if [ -z "$BPY" ] || [ ! -x "$BPY" ]; then
  echo "could not locate Blender's bundled Python" >&2
  exit 1
fi
"$BPY" -m pip install --quiet --disable-pip-version-check --upgrade \
  --target "$CACHE/blender-site" pyyaml appdirs msgpack pillow
echo "blender-side packages in $CACHE/blender-site"
