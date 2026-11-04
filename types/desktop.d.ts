// Puente expuesto por electron/preload.cts. Solo existe en la versión de escritorio.
import type {DesktopOS,InstallProgress,InstallRequest,InstalledGame} from '../lib/desktop-install';

export type RadarDesktop={
  platform():Promise<{os:DesktopOS;arch:'x64'|'ARM64'|'x86'}>;
  list():Promise<InstalledGame[]>;
  install(request:InstallRequest):Promise<InstalledGame>;
  launch(repo:string):Promise<InstalledGame>;
  uninstall(repo:string):Promise<boolean>;
  reveal(repo:string):Promise<boolean>;
  chooseExecutable(repo:string):Promise<InstalledGame|null>;
  onProgress(listener:(progress:InstallProgress)=>void):()=>void;
};

declare global {
  interface Window {radarDesktop?:RadarDesktop}
}
