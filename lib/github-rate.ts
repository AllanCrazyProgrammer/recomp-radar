export type Rate={remaining:number|null;limit:number|null;reset:number|null;blockedUntil:number|null};
export class GithubError extends Error {
  status:number;
  constructor(message:string,status=502){super(message);this.status=status;}
}
export class GithubRateLimitError extends GithubError {
  retryAt:number;
  cachedData:unknown;
  constructor(retryAt:number,cachedData?:unknown){
    super('GitHub ha pausado las consultas por su límite de peticiones.',429);
    this.retryAt=retryAt;
    this.cachedData=cachedData;
  }
}
export function rateResumeAt(rate:Rate,now=Date.now()):number|null {
  const deadline=Math.max(rate.blockedUntil??0,rate.remaining===0?(rate.reset??0)*1000:0);
  return deadline>now?deadline:null;
}
