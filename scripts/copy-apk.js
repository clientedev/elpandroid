const fs = require('fs');
const path = require('path');

const srcApk = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const rootApk = path.join(__dirname, '..', 'ELP.apk');
const staticApk = path.join(__dirname, '..', 'static', 'ELP.apk');
const v2RootApk = path.join(__dirname, '..', '..', 'ObraFlowv2', 'ELP.apk');
const v2StaticApk = path.join(__dirname, '..', '..', 'ObraFlowv2', 'static', 'ELP.apk');

if (fs.existsSync(srcApk)) {
  fs.copyFileSync(srcApk, rootApk);
  const sizeMB = (fs.statSync(rootApk).size / (1024 * 1024)).toFixed(2);
  console.log(`✅ ELP.apk copiado para raiz! (${sizeMB} MB)`);

  const staticDir = path.join(__dirname, '..', 'static');
  if (fs.existsSync(staticDir)) {
    fs.copyFileSync(srcApk, staticApk);
    console.log(`✅ ELP.apk copiado para static/ELP.apk`);
  }

  if (fs.existsSync(path.dirname(v2RootApk))) {
    try {
      fs.copyFileSync(srcApk, v2RootApk);
      console.log(`✅ ELP.apk copiado para ObraFlowv2/ELP.apk`);
    } catch (e) {
      console.log(`(Aviso ObraFlowv2 root): ${e.message}`);
    }
  }

  const v2StaticDir = path.join(__dirname, '..', '..', 'ObraFlowv2', 'static');
  if (fs.existsSync(v2StaticDir)) {
    try {
      fs.copyFileSync(srcApk, v2StaticApk);
      console.log(`✅ ELP.apk copiado para ObraFlowv2/static/ELP.apk`);
    } catch (e) {
      console.log(`(Aviso ObraFlowv2 static): ${e.message}`);
    }
  }
} else {
  console.error(`❌ APK não encontrado em: ${srcApk}`);
}

