import test from 'node:test';
import assert from 'node:assert/strict';
import {artFallbackOrder,DEFAULT_LIBRARY_VIEW,normalizeVariant,parseLibraryViewOptions,rankInstallAssets,type ReleaseDownload} from '../lib/release-assets.ts';

const asset=(name:string,platform:ReleaseDownload['platform'],architecture:string|null=null):ReleaseDownload=>({name,url:`https://github.com/o/r/releases/download/v1/${name}`,size:100,platform,architecture});

test('recomienda sistema y arquitectura antes de formato y filtra archivos auxiliares',()=>{
 const files=[asset('game-win-x64.exe','Windows','x64'),asset('game-linux-x64.tar.gz','Linux','x64'),asset('game-linux.zip','Linux',null),asset('game-linux-arm64.zip','Linux','ARM64'),asset('game-linux.zip.sig','Linux',null),asset('game-source.tar.gz','Otros archivos',null)];
 assert.equal(rankInstallAssets(files,{os:'Linux',arch:'x64'})[0]?.name,'game-linux-x64.tar.gz');
 assert.deepEqual(rankInstallAssets(files,{os:'Linux',arch:'x64'}).map(f=>f.name),['game-linux-x64.tar.gz','game-linux.zip','game-linux-arm64.zip','game-win-x64.exe']);
});

test('recuerda variante limpia sin versión ni sistema y aplica restricciones de MSI/APK',()=>{
 assert.equal(normalizeVariant('MiJuego-2.4-Windows-x64.zip'),'mijuego');
 const files=[asset('game.msi','Windows'),asset('game.apk','Android'),asset('game.zip','Otros archivos')];
 assert.equal(rankInstallAssets(files,{os:'Android',arch:'unknown'},'game')[0]?.name,'game.apk');
 assert.equal(rankInstallAssets(files,{os:'Linux',arch:'unknown'}).some(f=>f.name==='game.msi'||f.name==='game.apk'),false);
});

test('el orden de portada pone la imagen personal antes de las opciones existentes y el mosaico',()=>{
 assert.deepEqual(artFallbackOrder(true,['wiki.jpg','readme.png']),['custom','wiki.jpg','readme.png','placeholder']);
 assert.deepEqual(artFallbackOrder(false,[]),['placeholder']);
});

test('valida preferencias de vista y recupera valores predeterminados para datos inválidos',()=>{
 assert.deepEqual(parseLibraryViewOptions({layout:'list',image:'icon',size:'large',showNames:false,sort:'update',installed:'missing'}),{layout:'list',image:'icon',size:'large',showNames:false,sort:'update',installed:'missing'});
 assert.deepEqual(parseLibraryViewOptions({layout:'oops',sort:'x',installed:'bad'}),DEFAULT_LIBRARY_VIEW);
 assert.deepEqual(parseLibraryViewOptions(null),DEFAULT_LIBRARY_VIEW);
});
