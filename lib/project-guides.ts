export type GuidePlatform='Windows'|'Linux'|'macOS'|'Android';
export type GuideMethod={requirements:string[];install:string[];update:string[];data:string;note?:string};
export type ProjectGuide={project:string;reviewedTag:string;reviewedAt:string;platforms:Partial<Record<GuidePlatform,GuideMethod>>};

// Reviewed release documentation, bundled locally: switching tabs never calls GitHub.
const nectar:ProjectGuide={
 project:'Open Nectar · Pikmin',reviewedTag:'0.9.2',reviewedAt:'2026-10-04',platforms:{
  Windows:{
   requirements:['Windows de 64 bits, controlador gráfico con OpenGL 3.3+ y aproximadamente 1 GB libre.','Tu imagen de Pikmin USA Rev. 1 o Europa en ISO/GCM. RVZ/WIA/GCZ requiere el conversor de una instalación de Dolphin y 1.4 GiB temporales adicionales.'],
   install:['Descarga nectar-windows.zip en el bloque de descargas y extrae el paquete.','Abre nectar-launcher.exe; elige tu imagen del disco y la carpeta donde quieres instalar el juego.','Espera la verificación y extracción. Después abre el launcher de esa carpeta y pulsa la portada de Pikmin para jugar.'],
   update:['Cierra el juego y abre nectar-launcher.exe de tu instalación.','Pulsa Update debajo de la portada de Pikmin. El launcher descarga e instala la nueva versión.','Si descargaste el ZIP nuevo por separado, abre su launcher, pulsa Update y selecciona la carpeta ya instalada. No necesitas volver a aportar el disco.'],
   data:'El actualizador conserva partidas, ajustes, texturas y assets. En tu carpeta están save\\card0\\, pikmin_settings.conf y assets\\.'
  },
  Linux:{
   requirements:['Linux x86-64 con glibc 2.29+, controlador OpenGL y zenity o kdialog para seleccionar archivos.','Tu ISO/GCM de Pikmin USA Rev. 1 o Europa. Para RVZ/WIA/GCZ se usa dolphin-tool de una instalación de Dolphin.'],
   install:['Descarga el AppImage o nectar-linux.tar.gz de esta release.','Para AppImage, permite ejecutar el archivo en sus propiedades y ábrelo. Para tar.gz, extrae la carpeta y abre nectar-launcher.','Pulsa Install bajo la portada de Pikmin, elige tu disco y una carpeta. Para jugar después, abre nectar-launcher de la instalación.'],
   update:['Cierra el juego y abre nectar-launcher de tu instalación.','Pulsa Update debajo de la portada; el launcher actualiza el juego.','También puedes abrir el launcher de un paquete recién descargado, pulsar Update y elegir tu carpeta instalada. No hace falta extraer el disco otra vez.'],
   data:'Se mantienen partidas, ajustes, packs de texturas y datos extraídos dentro de la carpeta de instalación.'
  },
  Android:{
   requirements:['Android 10+, dispositivo ARM64, OpenGL ES 3.0 y aproximadamente 1 GB libre.','Tu ISO/GCM de Pikmin USA Rev. 1 o Europa. Convierte los discos comprimidos en un ordenador antes de usarlos aquí.'],
   install:['Descarga el APK de esta release y ábrelo desde Descargas o Archivos.','Instala Open Nectar y ábrelo. Cuando lo solicite, selecciona tu ISO/GCM con el selector de archivos.','Espera a que verifique y extraiga los datos; después la app iniciará directamente el juego.'],
   update:['Cierra Open Nectar y descarga el APK nuevo.','Instálalo encima de la aplicación existente, sin desinstalar la anterior.','Abre el juego: la actualización conserva los datos extraídos y las partidas.'],
   data:'Android guarda el juego y las partidas en el almacenamiento privado de la app. Desinstalarla elimina esos datos.'
  }
 }
};
const conkerData={Windows:'%LOCALAPPDATA%\\ConkerRecompiled',Linux:'~/.config/ConkerRecompiled',macOS:'~/Library/Application Support/ConkerRecompiled'};
const conker:ProjectGuide={project:'Conker Recompiled',reviewedTag:'V0.1.5',reviewedAt:'2026-10-04',platforms:{}};
for(const platform of ['Windows','Linux','macOS'] as const){
 const executable=platform==='Windows'?'ConkerRecomp.exe':platform==='macOS'?'ConkerRecomp.app':'ConkerRecomp';
 conker.platforms[platform]={
  requirements:["Tu ROM estadounidense de Conker’s Bad Fur Day en formato .z64. El paquete no incluye los datos del juego.",platform==='macOS'?'El paquete macOS requiere Apple Silicon y macOS 15 o posterior; usa Metal.':platform==='Linux'?'Usa el paquete Linux y un controlador con Vulkan.':'Usa el ZIP Windows; el renderizador puede usar Direct3D 12 o Vulkan.'],
  install:[`Descarga el paquete ${platform} de esta release y extrae su contenido. El ZIP Mods es un complemento, no el juego.`,`Abre ${executable}; en el launcher pulsa Load ROM y elige tu archivo .z64 estadounidense.`,'Pulsa Start Game. Para ajustar controles y gráficos, abre Settings en el launcher.'],
  update:['Cierra el juego y descarga el nuevo paquete para tu sistema.','Extrae el paquete en una carpeta nueva y abre su ejecutable.','Con el almacenamiento normal, el nuevo ejecutable usa la misma carpeta de datos de tu usuario. Si te pide una ROM, selecciona tu .z64.'],
  data:`Partidas, ajustes y ROM se guardan en ${conkerData[platform]}. Si usas portable.txt, los datos están junto al ejecutable: copia esa carpeta antes de cambiar el paquete y conserva su contenido.`,
  note:platform==='Windows'?'En V0.1.5, si Direct3D 12 falla, prueba Vulkan desde Settings > Graphics.':'Revisa las notas de esta release para cambios de compatibilidad y mods.'
 };
}

export function projectGuide(repo:string):ProjectGuide|null{
 switch(repo.toLowerCase()){
  case 'ssunnking/open-nectar---pikmin-native-pc-mobile-port':return nectar;
  case 'sciaschi/cbfd-recompiled':return conker;
  default:return null;
 }
}
export function guideReadme(repo:string,tag?:string|null){
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo))return null;
 return `https://github.com/${repo}${tag?`/blob/${encodeURIComponent(tag)}/README.md`:'#readme'}`;
}
