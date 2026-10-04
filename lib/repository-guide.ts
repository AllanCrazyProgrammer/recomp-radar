// Documentation is source material, never an instruction to execute a command.
export type GuideSection={title:string;markdown:string;url:string};
export type GuideDocument={path:string;url:string;ref:string|null;markdown:string};
export type RepositoryGuide={repo:string;tag:string|null;ref:string|null;checkedAt:string;install:GuideSection[];update:GuideSection[];documents:GuideDocument[];stale?:boolean;retryAt?:number;notice?:string};
export const GUIDE_CACHE_MS=24*60*60*1000;
const clean=(text:string)=>text.replace(/<[^>]*>/g,'').replace(/[\*_`]/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const installHeading=(s:string)=>/\b(install(?:ation|ing)?|setup|getting started|quick ?start|playing|plug and play|how to (?:play|run)|play directly|running|usage|download(?:s)?|requirements|prerequisites|instalacion|instalar|requisitos|como jugar|primeros pasos)\b/.test(clean(s));
const updateHeading=(s:string)=>/\b(updat(?:e|es|ing)|upgrad(?:e|es|ing)|migration|migrat(?:e|ing)|actualizar|actualizacion|migracion|save (?:data|files|location)|savegames|partidas)\b/.test(clean(s));
const developerHeading=(s:string)=>/\b(build(?:ing)?|compil(?:e|ing|ar|acion)|development|contribut(?:e|ing)|developer)\b/.test(clean(s));

export function safeGuideLink(value:string,base:string):string|null{
 try{const url=new URL(value,base);return url.protocol==='https:'?url.href:null;}catch{return null;}
}

type Heading={title:string;level:number;start:number;body:number;end:number;developer:boolean};
function headings(markdown:string){
 const lines=markdown.replace(/\r/g,'').split('\n'),rows:Heading[]=[];
 let fence:{character:string;length:number}|null=null;
 for(let i=0;i<lines.length;i++){
  const f=lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
  if(f){if(!fence)fence={character:f[1][0],length:f[1].length};else if(f[1][0]===fence.character&&f[1].length>=fence.length)fence=null;continue;}
  if(fence)continue;
  const atx=lines[i].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/),setext=i+1<lines.length&&lines[i].trim()?lines[i+1].match(/^\s{0,3}(=+|-+)\s*$/):null;
  if(!atx&&!setext)continue;
  const level=atx?atx[1].length:setext![1][0]==='='?1:2,title=atx?atx[2]:lines[i].trim();
  const parent=[...rows].reverse().find(row=>row.level<level);
  rows.push({title,level,start:i,body:i+(atx?1:2),end:lines.length,developer:developerHeading(title)||!!parent?.developer});
  if(setext)i++;
 }
 for(let i=0;i<rows.length;i++)rows[i].end=rows.slice(i+1).find(row=>row.level<=rows[i].level)?.start??lines.length;
 return {lines,rows};
}

export function extractGuide(document:GuideDocument):{install:GuideSection[];update:GuideSection[]}{
 const {lines,rows}=headings(document.markdown);
 function selected(match:(text:string)=>boolean){
  const ranges=rows.filter(row=>!row.developer&&match(row.title));
  return ranges.filter(row=>!ranges.some(parent=>parent!==row&&parent.start<row.start&&parent.end>=row.end)).map(row=>({title:row.title,markdown:lines.slice(row.body,row.end).join('\n').trim(),url:document.url})).filter(row=>row.markdown);
 }
 let install=selected(installHeading),update=selected(updateHeading);
 // A standalone INSTALL/UPGRADING file often has no headings at all.
 const filename=document.path.split('/').pop()??'';
 if(!install.length&&/^(install|setup|getting[-_ ]?started)/i.test(filename)&&document.markdown.trim())install=[{title:'Instalación · '+filename,markdown:document.markdown,url:document.url}];
 if(!update.length&&/^(updat|upgrad|migrat)/i.test(filename)&&document.markdown.trim())update=[{title:'Actualizar · '+filename,markdown:document.markdown,url:document.url}];
 // Some projects document updates as paragraphs inside a platform/install section.
 if(!update.length){
  const end=rows.find(row=>row.level<=2&&row.developer)?.start??lines.length;
  const prose=lines.slice(0,end).join('\n');
  const paragraphs=prose.split(/\n\s*\n/).filter(p=>!p.includes('```')&&!p.includes('~~~')&&/(?:to update|to upgrade|when updating|when upgrading|when a new release|para actualizar|para instalar una nueva version)/i.test(clean(p)));
  update=paragraphs.slice(0,6).map(p=>({title:'Actualización documentada',markdown:p.trim(),url:document.url}));
 }
 return {install,update};
}

// Follow only explicitly linked Markdown/text guides inside this same repository.
// No crawling arbitrary websites, redirects from README links, or guessing filenames.
export function linkedGuidePaths(document:GuideDocument,repo:string):string[]{
 const paths:string[]=[];
 for(const match of document.markdown.matchAll(/\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
  if(!installHeading(match[1])&&!updateHeading(match[1])&&!/\b(install|upgrad|updat|setup)\b/i.test(match[2]))continue;
  if(match[2].startsWith('#'))continue;
  const href=safeGuideLink(match[2],document.url);if(!href)continue;
  const url=new URL(href);if(url.hostname!=='github.com')continue;
  const prefix='/'+repo+'/blob/';if(!url.pathname.toLowerCase().startsWith(prefix.toLowerCase()))continue;
  const ref=document.ref?encodeURIComponent(document.ref):null;
  const tail=url.pathname.slice(prefix.length);
  // html_url tells us the actual source ref; linked guides must use that same ref.
  const reference=ref?[ref,document.ref!].find(value=>tail.startsWith(value+'/')):null;
  const remainder=ref?(reference?tail.slice(reference.length+1):null):tail.includes('/')?tail.slice(tail.indexOf('/')+1):null;
  if(!remainder)continue;
  const path=decodeURIComponent(remainder);if(path.includes('..')||! /\.(?:md|markdown|txt)$/i.test(path)||path.length>240)continue;
  if(!paths.includes(path)&&path!==document.path)paths.push(path);
 }
 return paths.slice(0,2);
}
