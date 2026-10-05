const fs = require('fs');
const path = require('path');

const srcApk = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const destApk = path.join(__dirname, '..', 'ELP.apk');

if (fs.existsSync(srcApk)) {
  fs.copyFileSync(srcApk, destApk);
  const sizeMB = (fs.statSync(destApk).size / (1024 * 1024)).toFixed(2);
  console.log(`✅ ELP.apk atualizado com sucesso na raiz! (${sizeMB} MB)`);
} else {
  console.error(`❌ APK não encontrado em: ${srcApk}`);
}
