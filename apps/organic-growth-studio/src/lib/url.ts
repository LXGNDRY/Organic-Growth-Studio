export function normalizeTargetUrl(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>2048)throw new Error('Enter a target URL under 2,048 characters.');const u=new URL(value.includes('://')?value:`https://${value}`);if(!['http:','https:'].includes(u.protocol))throw new Error('Only http and https URLs are supported.');if(u.username||u.password)throw new Error('URLs with embedded credentials are not allowed.');return u.toString();}

// Behind a reverse proxy the request URL carries the container's own listening
// address, so a short link built from it comes out as http://0.0.0.0:3010/go/...
// - syntactically valid and completely unusable. Tracked links are how every
// experiment is measured, so that silently voids the measurement.
//
// PUBLIC_BASE_URL is set explicitly at deploy time rather than read from the
// Host or X-Forwarded-Host header, which a caller can forge: a forged value
// would mint links pointing at someone else's domain.
export function publicBaseUrl(requestUrl:string):string{
  const configured=process.env.PUBLIC_BASE_URL?.trim();
  if(configured){
    try{
      const u=new URL(configured);
      if(['http:','https:'].includes(u.protocol))return u.origin;
    }catch{/* fall through to the request's own origin */}
  }
  return new URL(requestUrl).origin;
}
