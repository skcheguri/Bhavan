#!/usr/bin/env bash
#
# Android smoke test: build, install, launch, and fail loudly if the app
# crashes or never renders.
#
#   bash scripts/android-smoke.sh
#
# Catches the catastrophic cases -- broken build, crash on launch, a
# release build whose plugins R8 stripped -- in about two minutes, so the
# manual matrix in MOBILE_TESTING.md is left for what a script cannot
# judge. It deliberately does not try to drive the UI: scripted taps
# against a React layout break whenever the design moves, and a test that
# is always slightly broken gets ignored.
#
# Pass `release` to smoke the minified build instead of debug, which is
# the one that matters for ProGuard breakage:
#
#   bash scripts/android-smoke.sh release

set -euo pipefail

VARIANT="${1:-debug}"
PKG="com.bhavan.app"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}}"
ADB="$SDK/platform-tools/adb"
[ -x "$ADB" ] || ADB="$ADB.exe"

# Android Studio ships a JDK; most machines have no separate one on PATH.
if [ -z "${JAVA_HOME:-}" ]; then
  for candidate in "/c/Program Files/Android/Android Studio/jbr" "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    [ -d "$candidate" ] && export JAVA_HOME="$candidate" && break
  done
fi

fail() { echo "FAIL: $*" >&2; exit 1; }

command -v "$ADB" >/dev/null 2>&1 || [ -x "$ADB" ] || fail "adb not found under $SDK"
"$ADB" get-state >/dev/null 2>&1 || fail "no device or emulator attached (adb devices)"

echo "==> Building web bundle"
npm run build >/dev/null || fail "web build failed"
npx cap sync android >/dev/null || fail "cap sync failed"

echo "==> Building Android ($VARIANT)"
if [ "$VARIANT" = "release" ]; then
  (cd android && ./gradlew assembleRelease --no-daemon -q) || fail "gradle assembleRelease failed"
else
  (cd android && ./gradlew assembleDebug --no-daemon -q) || fail "gradle assembleDebug failed"
fi

# The build directory may be relocated off a cloud-synced folder; ask
# Gradle where it actually wrote rather than assuming android/app/build.
BUILD_DIR=$(grep -E '^buildDir\.relocated=' android/local.properties 2>/dev/null | cut -d= -f2- || true)
APK_ROOT="${BUILD_DIR:+$BUILD_DIR/app}"
APK_ROOT="${APK_ROOT:-android/app/build}"
APK=$(ls "$APK_ROOT"/outputs/apk/"$VARIANT"/*.apk 2>/dev/null | head -1) || true
[ -n "${APK:-}" ] || fail "no APK produced under $APK_ROOT/outputs/apk/$VARIANT"
echo "    $APK ($(du -h "$APK" | cut -f1))"

echo "==> Installing"
"$ADB" install -r "$APK" >/dev/null 2>&1 || fail "install failed (unsigned release build? sign it first)"

echo "==> Launching"
"$ADB" logcat -c
"$ADB" shell am force-stop "$PKG"
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null
sleep 10

# A crash is the loudest failure and the easiest to miss in a wall of log.
if "$ADB" logcat -d 2>/dev/null | grep -qE "FATAL EXCEPTION|AndroidRuntime.*$PKG"; then
  "$ADB" logcat -d | grep -A15 "FATAL EXCEPTION" | head -25
  fail "app crashed on launch"
fi

# R8 stripping Capacitor plugins shows up here and nowhere else.
if "$ADB" logcat -d 2>/dev/null | grep -qE "ClassNotFoundException|NoSuchMethodError"; then
  "$ADB" logcat -d | grep -E "ClassNotFoundException|NoSuchMethodError" | head -5
  fail "missing class at runtime -- likely ProGuard/R8 stripped something (see android/app/proguard-rules.pro)"
fi

# Still resumed ten seconds in means it did not silently die.
"$ADB" shell dumpsys activity activities 2>/dev/null | grep -q "topResumedActivity.*$PKG" \
  || fail "app is not the resumed activity -- it exited or never started"

# The WebView loading is what distinguishes "launched" from "rendered".
"$ADB" logcat -d 2>/dev/null | grep -q "Capacitor" \
  || echo "WARN: no Capacitor log lines; verbose logging is off in release builds, so this is expected there"

mkdir -p .smoke
"$ADB" exec-out screencap -p > ".smoke/android-$VARIANT.png"
echo "==> PASS  screenshot: .smoke/android-$VARIANT.png"
