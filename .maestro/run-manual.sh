#!/usr/bin/env bash
# Executado dentro do emulador já ligado (android-emulator-runner).
set -u
mkdir -p manual-out/screens manual-out/logs
adb shell settings put system screen_off_timeout 1800000
adb shell locksettings set-disable true || true
adb install -r -g ELP-x86_64.apk
adb shell pm grant com.obraflow.app android.permission.POST_NOTIFICATIONS || true
adb logcat -c

# Barra de status limpa e fixa (modo demonstração do Android): 10:00, bateria cheia, sem notificações
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1000
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
adb shell am broadcast -a com.android.systemui.demo -e command network -e mobile show -e datatype none -e level 4
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false

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

# ---- Tour: cada arquivo .maestro/tour/NNN-nome.yaml é um passo; depois de cada passo
# salva print + hierarquia (elementos com posições) para as anotações do manual ----
if [ -n "${MANUAL_USER:-}" ] && ls .maestro/tour/[0-9]*.yaml >/dev/null 2>&1; then
  mkdir -p manual-out/tour
  for step in .maestro/tour/${TOUR:-[0-9]*.yaml}; do
    name=$(basename "$step" .yaml)
    echo "::group::passo $name"
    if maestro test "$step" -e USER="$MANUAL_USER" -e PASS="$MANUAL_PASS" --test-output-dir "manual-out/logs/tour-$name" > "manual-out/logs/tour-$name.txt" 2>&1; then
      sleep 1
      adb exec-out screencap -p > "manual-out/tour/$name.png"
      maestro hierarchy > "manual-out/tour/$name.json" 2>/dev/null || true
      echo "ok $name"
    else
      echo "::warning::passo $name falhou"; tail -5 "manual-out/logs/tour-$name.txt"
      adb exec-out screencap -p > "manual-out/tour/$name-FALHOU.png"
      maestro hierarchy > "manual-out/tour/$name-FALHOU.json" 2>/dev/null || true
      status=1
      [ "${TOUR_STOP_ON_FAIL:-1}" = "1" ] && break
    fi
    echo "::endgroup::"
  done
fi

# prints do Maestro (takeScreenshot grava no diretório atual)
mv ./*.png manual-out/screens/ 2>/dev/null || true
adb logcat -d -s ReactNativeJS:V ReactNative:V AndroidRuntime:E > manual-out/logs/logcat.txt || true
# prints automáticos do Maestro em caso de falha
find manual-out/logs -name "*.png" -exec cp {} manual-out/screens/ \; 2>/dev/null || true
adb exec-out screencap -p > manual-out/screens/zz-estado-final.png || true
echo "===== logcat (erros do app) ====="; grep -E "AndroidRuntime|FATAL|ReactNativeJS" manual-out/logs/logcat.txt | tail -60
ls -la manual-out/screens
exit $status
