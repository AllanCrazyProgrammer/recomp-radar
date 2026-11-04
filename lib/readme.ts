// Markdown mínimo y seguro para la ficha del juego: produce bloques de datos, nunca HTML.
// Cubre lo habitual en un README (títulos, párrafos, listas, código, citas) y descarta HTML incrustado.
import {validRepo} from './desktop-install.ts';

export type Inline={kind:'text'|'code'|'strong'|'em';text:string}|{kind:'link';text:string;href:string};
export type Block=
 |{kind:'heading';level:1|2|3;inline:Inline[]}
 |{kind:'paragraph';inline:Inline[]}
 |{kind:'list';ordered:boolean;items:Inline[][]}
 |{kind:'code';text:string}
 |{kind:'quote';inline:Inline[]};

export const README_MAX_BYTES=200_000;

/** Solo enlaces http(s). Rutas relativas se resuelven contra el repositorio en GitHub. */
export function safeHref(href:string,repo:string):string|null{
 const h=href.trim();
 if(!h||h.startsWith('#'))return null;
 try{
  const u=new URL(h,`https://github.com/${repo}/blob/HEAD/`);
  return u.protocol==='https:'||u.protocol==='http:'?u.href:null;
 }catch{return null;}
}

/** Énfasis que contiene enlaces o código: se analiza por dentro; el texto simple conserva el énfasis. */
function emphasis(kind:'strong'|'em',inner:string,repo:string):Inline[]{
 const parts=parseInline(inner,repo);
 return parts.every(p=>p.kind==='text')?[{kind,text:inner}]:parts.map(p=>p.kind==='text'?{kind,text:p.text}:p);
}

export function parseInline(text:string,repo:string):Inline[]{
 const out:Inline[]=[];
 // Imágenes ![alt](src) se convierten en su texto alternativo; insignias sin alt desaparecen.
 const source=text.replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/<[^>]+>/g,'');
 const re=/`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*([^*\s][^*]*)\*|(https?:\/\/[^\s<>()]+)/g;
 let last=0;
 for(const m of source.matchAll(re)){
  if(m.index>last)out.push({kind:'text',text:source.slice(last,m.index)});
  if(m[1]!==undefined)out.push({kind:'code',text:m[1]});
  else if(m[2]!==undefined||m[3]!==undefined)out.push(...emphasis('strong',m[2]??m[3],repo));
  else if(m[4]!==undefined){const label=m[4].replace(/`/g,''),href=safeHref(m[5],repo);out.push(href?{kind:'link',text:label,href}:{kind:'text',text:label});}
  else if(m[6]!==undefined)out.push(...emphasis('em',m[6],repo));
  else if(m[7]!==undefined)out.push({kind:'link',text:m[7],href:m[7]});
  last=m.index+m[0].length;
 }
 if(last<source.length)out.push({kind:'text',text:source.slice(last)});
 return out.filter(p=>p.text.length>0);
}

export function parseReadme(markdown:string,repo:string):Block[]{
 const lines=markdown.slice(0,README_MAX_BYTES).replace(/<!--[\s\S]*?-->/g,'').split(/\r?\n/);
 const blocks:Block[]=[];let para:string[]=[];let list:{ordered:boolean;items:string[]}|null=null;
 const flush=()=>{
  if(para.length){const inline=parseInline(para.join(' '),repo);if(inline.length)blocks.push({kind:'paragraph',inline});para=[];}
  if(list){blocks.push({kind:'list',ordered:list.ordered,items:list.items.map(i=>parseInline(i,repo))});list=null;}
 };
 for(let i=0;i<lines.length;i++){
  const line=lines[i],trim=line.trim();
  const fence=trim.match(/^(```|~~~)/);
  if(fence){flush();const body:string[]=[];for(i++;i<lines.length&&!lines[i].trim().startsWith(fence[1]);i++)body.push(lines[i]);blocks.push({kind:'code',text:body.join('\n')});continue;}
  if(!trim){flush();continue;}
  if(/^<\/?[a-z][^>]*>\s*$/i.test(trim))continue; // Línea de HTML (centrado de logos, <p align>…).
  const heading=trim.match(/^(#{1,6})\s+(.+?)\s*#*$/);
  if(heading){flush();blocks.push({kind:'heading',level:Math.min(3,heading[1].length) as 1|2|3,inline:parseInline(heading[2],repo)});continue;}
  if(/^(?:-{3,}|\*{3,}|_{3,})$/.test(trim)){flush();continue;}
  if(/^\|.*\|$/.test(trim)){flush();if(!/^\|[\s:|-]+\|$/.test(trim))blocks.push({kind:'paragraph',inline:parseInline(trim.slice(1,-1).split('|').map(c=>c.trim()).filter(Boolean).join(' · '),repo)});continue;}
  const item=trim.match(/^(?:([-*+])|(\d+)[.)])\s+(.*)$/);
  if(item){const ordered=!!item[2];if(para.length||(list&&list.ordered!==ordered))flush();list??={ordered,items:[]};list.items.push(item[3].replace(/^\[[ xX]\]\s*/,''));continue;}
  if(trim.startsWith('>')){flush();blocks.push({kind:'quote',inline:parseInline(trim.replace(/^>\s?/,'').replace(/^\[!(\w+)\]\s*/,'$1: '),repo)});continue;}
  if(list&&/^\s{2,}/.test(line)){list.items[list.items.length-1]+=' '+trim;continue;}
  if(list)flush();
  para.push(trim);
 }
 flush();
 return blocks.filter(b=>b.kind!=='quote'||b.inline.length);
}

export function readmeUrl(repo:string):string|null{
 return validRepo(repo)?`https://raw.githubusercontent.com/${repo}/HEAD/README.md`:null;
}
