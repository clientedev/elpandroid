#!/usr/bin/env bash
# Executado dentro do emulador já ligado (android-emulator-runner).
set -u
mkdir -p manual-out/screens manual-out/logs
adb shell settings put system screen_off_timeout 1800000
adb shell locksettings set-disable true || true
adb install -r -g ELP-x86_64.apk
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
# prints automáticos do Maestro em caso de falha
find manual-out/logs -name "*.png" -exec cp {} manual-out/screens/ \; 2>/dev/null || true
adb exec-out screencap -p > manual-out/screens/zz-estado-final.png || true
echo "===== logcat (erros do app) ====="; grep -E "AndroidRuntime|FATAL|ReactNativeJS" manual-out/logs/logcat.txt | tail -60
ls -la manual-out/screens
exit $status
