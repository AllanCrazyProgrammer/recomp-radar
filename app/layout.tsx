import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Recomp Radar · Tu próxima partida empieza aquí',description:'Tu radar personal de recompilaciones y ports: novedades reales desde GitHub, con fuentes y contexto para jugar.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
