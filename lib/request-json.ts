export class PayloadError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export async function boundedJson(request:Request,limit:number,allowEmpty=false):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader){if(allowEmpty)return {};throw new PayloadError('Solicitud inválida.');}
 const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new PayloadError('Solicitud demasiado grande.',413);}chunks.push(value);}
 if(!size&&allowEmpty)return {};const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new PayloadError('Solicitud inválida.');}
}
