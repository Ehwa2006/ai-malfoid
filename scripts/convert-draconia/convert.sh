#!/usr/bin/env bash
# Malfoy Draconia 원본 zip → public/models/malfoy-draconia.vrm
#
#   scripts/convert-draconia/convert.sh "Harry Potter Series - Malfoy Draconia Female (3D Model).zip"
#
# 필요한 것: Python 3.13(bpy 휠과 같은 버전, 다르면 PYTHON=python3.13 으로 지정), git, unzip.
# 처음 실행할 때 .cache/에 Blender(bpy)와 VRM Add-on for Blender를 받아 둔다.
set -euo pipefail

ZIP="${1:?원본 모델 zip 경로를 주세요 (README 참고)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CACHE="$HERE/.cache"
OUT="${2:-$ROOT/public/models/malfoy-draconia.vrm}"
BPY_VERSION=5.2.2
VRM_ADDON_TAG=v4.10.2

PYTHON="${PYTHON:-python3}"
mkdir -p "$CACHE"
if [ ! -x "$CACHE/venv/bin/python" ]; then
  # bpy 휠은 특정 파이썬 버전용으로만 나온다 (bpy 5.2 → Python 3.13)
  if ! "$PYTHON" -c 'import sys; sys.exit(sys.version_info[:2] != (3, 13))'; then
    echo "bpy $BPY_VERSION 에는 Python 3.13이 필요합니다. PYTHON=python3.13 $0 ... 처럼 지정해 주세요." >&2
    exit 1
  fi
  "$PYTHON" -m venv "$CACHE/venv"
  "$CACHE/venv/bin/pip" install --quiet "bpy==$BPY_VERSION"
fi
if [ ! -d "$CACHE/vrm-addon" ]; then
  git clone --quiet --depth 1 --branch "$VRM_ADDON_TAG" https://github.com/saturday06/VRM-Addon-for-Blender "$CACHE/vrm-addon"
fi
# 애드온을 사용자 스크립트 폴더에 두어야 addon_utils.enable이 환경설정까지 등록한다
mkdir -p "$CACHE/blender-scripts/addons"
ln -sfn "$CACHE/vrm-addon/src/io_scene_vrm" "$CACHE/blender-scripts/addons/io_scene_vrm"

# 필요한 파일(FBX와 텍스처)만 꺼낸다. .blend/.pmx/.xps는 쓰지 않는다.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
unzip -q -j "$ZIP" "Malfoy Draconia (3D Model).fbx" \
  "textures/Clothes_Tex.png" "textures/Face_Tex.png" "textures/Hair_Tex.png" -d "$WORK"

cd "$WORK"
BLENDER_USER_SCRIPTS="$CACHE/blender-scripts" "$CACHE/venv/bin/python" -I "$HERE/convert.py" \
  --fbx "$WORK/Malfoy Draconia (3D Model).fbx" --textures "$WORK" --out "$OUT"
