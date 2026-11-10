#!/usr/bin/env bash
# Executado dentro do emulador já ligado (android-emulator-runner).
set -u
mkdir -p manual-out/screens manual-out/logs
adb shell settings put system screen_off_timeout 1800000
adb shell locksettings set-disable true || true
adb install -r -g ELP.apk
adb shell pm grant com.obraflow.app android.permission.POST_NOTIFICATIONS || true
adb logcat -c

status=0
for flow in .maestro/manual/${FLOWS:-[0-9]*.yaml}; do
  [ -f "$flow" ] || continue
  name=$(basename "$flow" .yaml)
  echo "::group::roteiro $name"
  maestro test "$flow" \
    -e USER="${MANUAL_USER:-}" -e PASS="${MANUAL_PASS:-}" \
    --test-output-dir "manual-out/logs/$name" \
    --format junit --output "manual-out/logs/$name.xml" || { echo "::warning::roteiro $name falhou"; status=1; }
  echo "::endgroup::"
done

# prints do Maestro (takeScreenshot grava no diretório atual)
mv ./*.png manual-out/screens/ 2>/dev/null || true
adb logcat -d -s ReactNativeJS:V ReactNative:V AndroidRuntime:E > manual-out/logs/logcat.txt || true
ls -la manual-out/screens
exit $status
