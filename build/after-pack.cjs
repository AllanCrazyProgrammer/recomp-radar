// Firma ad-hoc de la app de macOS antes de crear el DMG.
// Sin firma válida, macOS en Apple Silicon dice que la app "está dañada" y no deja abrirla.
// Con firma ad-hoc solo muestra el aviso normal de "desarrollador no identificado".
const {execFileSync}=require('node:child_process');
const {join}=require('node:path');

exports.default=async function afterPack(context){
  if(context.electronPlatformName!=='darwin')return;
  const app=join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign',['--force','--deep','--sign','-',app],{stdio:'inherit'});
};
