import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const label=Buffer.from(type),crc=Buffer.alloc(4),size=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([label,data])));return Buffer.concat([size,label,data,crc]);}
function png(name,green){const width=400,height=300,header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;const rows=Buffer.alloc(height*(width*3+1));for(let y=0;y<height;y++){for(let x=0;x<width;x++){const at=y*(width*3+1)+1+x*3;rows[at]=50+Math.floor(x/width*100);rows[at+1]=green?130+Math.floor(y/height*90):100+Math.floor(y/height*80);rows[at+2]=green?80:220;}}writeFileSync(new URL('./fixtures/'+name,import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));}
png('cover-blue.png',false);png('cover-green.png',true);
writeFileSync(new URL('./fixtures/invalid.svg',import.meta.url),'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
