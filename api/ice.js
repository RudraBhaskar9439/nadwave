const fallback=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]

export function createIceHandler({env=process.env,fetcher=fetch,now=Date.now}={}) {
  let cached
  let cachedAt=0
  const requests=new Map()
  return async function handler(req,res) {
    const reply=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body))}
    if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(405,{error:'method_not_allowed'})}
    const origin=req.headers.origin
    const host=req.headers.host
    if((req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'&&req.headers['sec-fetch-site']!=='none')||(origin&&origin!==`https://${host}`&&!(env.NODE_ENV!=='production'&&origin===`http://${host}`)))return reply(403,{error:'same_origin_required'})
    const timestamp=now()
    const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]
    const prior=requests.get(ip)
    // shortcut: throttling is per instance; use shared rate limiting when traffic grows.
    if(prior&&timestamp-prior.at<60000&&prior.count>=20){res.setHeader('Retry-After','60');return reply(429,{error:'retry_later'})}
    requests.set(ip,prior&&timestamp-prior.at<60000?{at:prior.at,count:prior.count+1}:{at:timestamp,count:1})
    if(requests.size>1000){for(const[key,value]of requests)if(timestamp-value.at>=60000)requests.delete(key);while(requests.size>1000)requests.delete(requests.keys().next().value)}
    const domain=env.METERED_TURN_DOMAIN
    const key=env.METERED_TURN_API_KEY
    if(!domain||!key)return reply(503,{error:'relay_not_configured',iceServers:fallback,relayConfigured:false})
    if(!/^[a-z0-9][a-z0-9-]*\.metered\.live$/i.test(domain))return reply(503,{error:'relay_not_configured',iceServers:fallback,relayConfigured:false})
    if(cached&&timestamp-cachedAt<300000)return reply(200,{iceServers:cached,relayConfigured:true})
    try {
      const url=new URL(`https://${domain}/api/v1/turn/credentials`)
      url.searchParams.set('apiKey',key)
      url.searchParams.set('region','global')
      const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)})
      if(!response.ok)throw new Error('Relay provider unavailable')
      const servers=await response.json()
      if(!Array.isArray(servers)||!servers.length||servers.length>16)throw new Error('Invalid ICE response')
      let relay=false
      const safe=servers.map(server=>{
        const urls=Array.isArray(server.urls)?server.urls:[server.urls]
        if(!urls.length||urls.length>8||urls.some(url=>typeof url!=='string'||!/^(stun|stuns|turn|turns):[^\s]+$/.test(url)))throw new Error('Invalid ICE response')
        const needsCredentials=urls.some(url=>/^turns?:/.test(url))
        if(needsCredentials&&(typeof server.username!=='string'||!server.username||typeof server.credential!=='string'||!server.credential))throw new Error('Invalid TURN credentials')
        relay ||= needsCredentials
        return {urls:server.urls,...server.username?{username:server.username}:{},...server.credential?{credential:server.credential}:{}}
      })
      if(!relay)throw new Error('No relay available')
      cached=safe;cachedAt=now()
      return reply(200,{iceServers:safe,relayConfigured:true})
    } catch {
      return reply(503,{error:'relay_unavailable',iceServers:fallback,relayConfigured:false})
    }
  }
}

export default createIceHandler()
