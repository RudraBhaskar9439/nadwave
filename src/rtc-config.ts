export type RtcConfiguration = {
  iceServers: RTCIceServer[]
  iceTransportPolicy?: RTCIceTransportPolicy
  relayConfigured: boolean
  warning?: string
}

const directServers: RTCIceServer[] = [
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun.cloudflare.com:3478'},
]

export async function loadRtcConfig({relayOnly=false}={}):Promise<RtcConfiguration> {
  try {
    const response=await fetch('/api/ice',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)})
    if(!response.ok)throw new Error('Relay unavailable')
    const body=await response.json() as {iceServers?:RTCIceServer[]}
    const servers=body.iceServers
    if(!Array.isArray(servers)||!servers.length||servers.length>16||servers.some(server=>{
      const urls=Array.isArray(server.urls)?server.urls:[server.urls]
      return !urls.length||urls.length>8||urls.some(url=>typeof url!=='string'||! /^(stun|stuns|turn|turns):[^\s]+$/.test(url))
    }))throw new Error('Invalid relay configuration')
    const hasRelay=servers.some(server=>(Array.isArray(server.urls)?server.urls:[server.urls]).some(url=>/^turns?:/.test(url)))
    if(!hasRelay)throw new Error('Relay unavailable')
    return {iceServers:servers,iceTransportPolicy:relayOnly?'relay':'all',relayConfigured:true}
  } catch {
    if(relayOnly)throw new Error('The audio/video relay is unavailable. Try again after relay setup is complete.')
    return {iceServers:directServers,relayConfigured:false,warning:'The audio/video relay is unavailable. Direct connections may still work; retry if media does not connect.'}
  }
}
