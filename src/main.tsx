import React from 'react';
import {createRoot} from 'react-dom/client';
import Radar from '../components/radar';
import {DesktopLogin} from '../components/desktop-login';
import {parseLoginParams} from '../lib/desktop-auth';
import '../app/globals.css';
import '../app/retro.css';
import '../app/comfort.css';
import '../app/friends.css';
import '../app/animations.css';
import '../app/desktop.css';
import '../app/discover.css';
// En el navegador del sistema, ?desktop-login=… muestra la página de inicio de sesión para la app de escritorio.
const desktopLogin=window.radarDesktop?null:parseLoginParams(window.location.search);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{desktopLogin?<DesktopLogin params={desktopLogin}/>:<Radar/>}</React.StrictMode>);
