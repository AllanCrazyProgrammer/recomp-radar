import test from 'node:test';
import assert from 'node:assert/strict';
import {checksumFor,gameFolderName,installFormat,isInside,pickExecutable,safeArchiveEntry,validInstallRequest,allowedDownloadHost,parseInstalledGame,type ExecutableCandidate} from '../lib/desktop-install.ts';

const repo='Zelda64Recomp/Zelda64Recomp',tag='v1.2.0';
const url=(name:string)=>`https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
const request=(name:string,extra:Record<string,unknown>={})=>({repo,tag,releaseId:'1',asset:{name,url:url(name),size:10},...extra});

test('accepts only GitHub release assets from the same repository and tag',()=>{
 assert.ok(validInstallRequest(request('Zelda64Recompiled-macOS.zip')));
 for(const bad of [`https://evil.test/${repo}/releases/download/${tag}/a.zip`,`https://github.com/Other/Repo/releases/download/${tag}/a.zip`,`https://github.com/${repo}/releases/download/v0.1/a.zip`,url('a.zip')+'?x=1',`http://github.com/${repo}/releases/download/${tag}/a.zip`])
  assert.equal(validInstallRequest({...request('a.zip'),asset:{name:'a.zip',url:bad,size:1}}),null);
 assert.equal(validInstallRequest(request('../a.zip')),null);
 assert.equal(validInstallRequest({...request('a.zip'),repo:'owner/..'}),null);
 assert.equal(validInstallRequest(request('a.zip',{checksumUrl:'https://evil.test/SHA256SUMS'})),null);
 assert.ok(validInstallRequest(request('a.zip',{checksumUrl:url('SHA256SUMS')})));
});

test('download redirects stay on GitHub hosts',()=>{
 assert.ok(allowedDownloadHost('objects.githubusercontent.com'));
 assert.ok(allowedDownloadHost('release-assets.githubusercontent.com'));
 assert.equal(allowedDownloadHost('githubusercontent.com.evil.test'),false);
});

test('detects install formats per operating system',()=>{
 assert.equal(installFormat('Game-macOS.zip','macOS'),'zip');
 assert.equal(installFormat('game-linux.tar.xz','Linux'),'tar');
 assert.equal(installFormat('Game.dmg','macOS'),'dmg');
 assert.equal(installFormat('Game.dmg','Windows'),null);
 assert.equal(installFormat('Game-x86_64.AppImage','Linux'),'appimage');
 assert.equal(installFormat('Game.exe','Windows'),'exe');
 assert.equal(installFormat('Game.exe','macOS'),null);
 assert.equal(installFormat('Game.msi','Windows'),null);
 assert.equal(installFormat('game-linux','Linux'),'binary');
});

test('rejects archive entries that escape the install folder',()=>{
 for(const ok of ['Game/game.exe','a/b/c.txt','Game.app/Contents/MacOS/Game'])assert.ok(safeArchiveEntry(ok));
 for(const bad of ['../x','a/../../x','/etc/passwd','C:\\Windows\\x','..\\x',''])assert.equal(safeArchiveEntry(bad),false);
 assert.ok(isInside('/games/a','/games/a/b'));
 assert.equal(isInside('/games/a','/games/ab/c'),false);
 assert.equal(gameFolderName('Owner/Repo'),'owner__repo');
 assert.throws(()=>gameFolderName('../x'));
});

test('picks the game executable and skips helpers and installers',()=>{
 const c=(path:string,kind:ExecutableCandidate['kind'],size=100,depth=path.split('/').length-1):ExecutableCandidate=>({path,kind,size,depth});
 assert.equal(pickExecutable([c('unins000.exe','exe',9e6),c('vc_redist.x64.exe','exe',9e6),c('Zelda64Recompiled.exe','exe',5e6),c('tools/helper.exe','exe')],repo,'Windows')?.path,'Zelda64Recompiled.exe');
 assert.equal(pickExecutable([c('Zelda64Recompiled.app','app'),c('Zelda64Recompiled.app/Contents/MacOS/Zelda64Recompiled','macho',9e9)],repo,'macOS')?.path,'Zelda64Recompiled.app');
 assert.equal(pickExecutable([c('run.sh','script'),c('Game-x86_64.AppImage','appimage')],repo,'Linux')?.path,'Game-x86_64.AppImage');
 assert.equal(pickExecutable([c('Game.exe','exe')],repo,'macOS'),null);
});

test('finds the checksum of the downloaded asset, not the first line',()=>{
 const sums='a'.repeat(64)+'  Game-Windows.zip\n'+'b'.repeat(64)+' *Game-macOS.zip\n';
 assert.equal(checksumFor(sums,'SHA256SUMS','Game-macOS.zip'),'b'.repeat(64));
 assert.equal(checksumFor(sums,'SHA256SUMS','Game-Linux.zip'),null);
 assert.equal(checksumFor('C'.repeat(64)+'\n','Game-macOS.zip.sha256','Game-macOS.zip'),'c'.repeat(64));
});

test('parses saved install manifests defensively',()=>{
 assert.equal(parseInstalledGame({repo:'bad',tag:'x',installedAt:'now'}),null);
 const game=parseInstalledGame({repo,tag,installedAt:'2026-11-03T00:00:00Z',executable:'../../evil'});
 assert.equal(game?.executable,null);
});
