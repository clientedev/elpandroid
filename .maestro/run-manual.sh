#!/usr/bin/env bash
# Executado dentro do emulador já ligado (android-emulator-runner).
set -u
mkdir -p manual-out/screens manual-out/logs
adb shell settings put system screen_off_timeout 1800000
adb shell locksettings set-disable true || true
adb install -r -g ELP-x86_64.apk
adb shell pm grant com.obraflow.app android.permission.POST_NOTIFICATIONS || true
adb logcat -c
# Esconde diálogos de sistema ("X isn't responding") que cobrem o app no emulador do CI
adb shell settings put global hide_error_dialogs 1 || true
dismiss_anr() {
  if adb shell dumpsys window 2>/dev/null | grep -qiE "Application Not Responding|isn't responding"; then
    echo "fechando diálogo de sistema (ANR)"
    adb shell input keyevent KEYCODE_BACK || true
    sleep 2
  fi
}

# Foto de teste na galeria do emulador (usada nos relatórios do manual)
adb push .maestro/assets/foto-teste.jpg /sdcard/Pictures/foto-teste.jpg >/dev/null 2>&1 || true
adb push .maestro/assets/foto-teste.jpg /sdcard/DCIM/foto-teste-2.jpg >/dev/null 2>&1 || true
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/foto-teste.jpg >/dev/null 2>&1 || true
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/foto-teste-2.jpg >/dev/null 2>&1 || true
adb shell content call --method scan_volume --uri content://media --arg external_primary >/dev/null 2>&1 || true
for perm in READ_MEDIA_IMAGES READ_EXTERNAL_STORAGE ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION CAMERA; do
  adb shell pm grant com.obraflow.app android.permission.$perm >/dev/null 2>&1 || true
done

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

# ---- Roteiros por seção (.maestro/tour, .maestro/crud, ...): cada arquivo NNN-nome.yaml é um passo;
# depois de cada passo salva print + hierarquia (elementos com posições) para as anotações do manual.
# Um arquivo .maestro/<seção>/.glob define quais passos rodam (ex.: "2[0-9][0-9]*.yaml"; "nenhum" desliga a seção).
# Senha dos usuários de teste: derivada do segredo, nunca gravada no repositório.
TPASS="Mt-$(printf '%s' "${MANUAL_PASS:-x}manual-elp" | sha256sum | cut -c1-10)"
if [ -n "${MANUAL_USER:-}" ]; then
  for sec in ${SECTIONS:-tour crud}; do
    dir=".maestro/$sec"
    [ -d "$dir" ] || continue
    glob='[0-9]*.yaml'
    [ -f "$dir/.glob" ] && glob=$(tr -d '[:space:]' < "$dir/.glob")
    [ "$sec" = "tour" ] && [ -n "${TOUR:-}" ] && [ "${TOUR}" != '[0-9]*.yaml' ] && glob="$TOUR"
    mkdir -p "manual-out/$sec"
    for step in $dir/$glob; do
      [ -f "$step" ] || continue
      name=$(basename "$step" .yaml)
      echo "::group::$sec $name"
      dismiss_anr
      run_step() { maestro test "$step" -e USER="$MANUAL_USER" -e PASS="$MANUAL_PASS" -e TPASS="$TPASS" \
           --test-output-dir "manual-out/logs/$sec-$name" > "manual-out/logs/$sec-$name.txt" 2>&1; }
      # Passos com launchApp (login) podem ser repetidos com segurança se um diálogo de sistema atrapalhou
      if run_step || { grep -q "clearState" "$step" && { dismiss_anr; sleep 5; dismiss_anr; run_step; }; }; then
        sleep 1
        adb exec-out screencap -p > "manual-out/$sec/$name.png"
        maestro hierarchy > "manual-out/$sec/$name.json" 2>/dev/null || true
        echo "ok $name"
      else
        echo "::warning::passo $sec/$name falhou"; tail -5 "manual-out/logs/$sec-$name.txt"
        adb exec-out screencap -p > "manual-out/$sec/$name-FALHOU.png"
        maestro hierarchy > "manual-out/$sec/$name-FALHOU.json" 2>/dev/null || true
        status=1
        [ "${TOUR_STOP_ON_FAIL:-0}" = "1" ] && break
      fi
      echo "::endgroup::"
    done
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
