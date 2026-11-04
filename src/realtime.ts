import {joinRoom,selfId} from 'trystero/nostr'
import {verifyMessage,type Address,type Hex} from 'viem'
import {seal,unseal,type Invite,type Sealed} from './crypto'
import {isMember,signIdentity} from './wallet'
import {createMediaPublisher,type MediaKind} from './media-publisher'

export type Person={id:string;name:string;address?:Address}
export type Chat={id:string;text:string;at:number;person:Person}
export type ConnectionReport={state:'connecting'|'connected'|'failed'|'closed';peers:number;relayConfigured:boolean;detail?:string}
export type RtcOptions={iceServers?:RTCIceServer[];iceTransportPolicy?:RTCIceTransportPolicy}
type Identity={name:string;address?:Address;signature?:Hex;expires:number}
type Handlers={
  onPeople:(people:Person[])=>void
  onChat:(chat:Chat)=>void
  onStream:(stream:MediaStream,id:string)=>void
  onLeave:(id:string)=>void
  onError:(message:string)=>void
  onLocalLink?:(connected:boolean)=>void
  onConnection?:(report:ConnectionReport)=>void
  onStreamRemoved?:(streamId:string,peerId:string)=>void
  onLocalMedia?:(kind:MediaKind,enabled:boolean)=>void
}
export function canAdmitPeer(peerId:string,known:Iterable<string>,pending:Iterable<string>=[]){
  const ids=new Set([...known,...pending])
  return ids.has(peerId)||ids.size<7
}
function connectionError(error:string){
  if(/not authorized|not approved|membership|signature|wallet/i.test(error))return 'A peer could not prove an approved wallet. Check the room membership and invitation.'
  if(/password|decrypt|key/i.test(error))return 'A peer could not verify the invitation key. Share the complete invitation link.'
  if(/full/i.test(error))return 'This room is full. Each room supports eight people.'
  if(/timed out|timeout/i.test(error))return 'The WebRTC connection timed out. Retry on another network or configure a TURN relay.'
  return 'A WebRTC connection could not be established. Check network access and the TURN relay configuration.'
}
function identityText(invite:Invite,peerId:string,expires:number){return `Nadwave room access\nRoom: ${invite.id}\nRegistry: ${invite.contract??'invite-only'}\nNetwork: Monad Testnet (10143)\nPeer: ${peerId}\nExpires: ${expires}`}
export async function startSession(invite:Invite,name:string,address:Address|undefined,handlers:Handlers,options:RtcOptions={}){
  const relayConfigured=Boolean(options.iceServers?.some(server=>(Array.isArray(server.urls)?server.urls:[server.urls]).some(url=>/^turns?:/i.test(url))))
  if(options.iceTransportPolicy==='relay'&&!relayConfigured)throw new Error('Relay-only mode needs a configured TURN server.')
  const identity:Identity={name:name.trim().slice(0,32)||'Anonymous listener',address,expires:Date.now()+60*60*1000}
  if(invite.contract){
    if(!address||!await isMember(invite.contract,invite.id,address))throw new Error('Your wallet is not an approved member. Ask the room owner to approve it on Monad.')
    identity.signature=await signIdentity(identityText(invite,selfId,identity.expires),address)
  }
  const people=new Map<string,Person>()
  const admissions=new Map<string,Person>()
  const reserved=new Set<string>()
  const localPeers=new Map<string,number>()
  const checking=new Set<string>()
  const remoteStreams=new Map<string,{stream:MediaStream;cleanup:()=>void}>()
  const peerListeners=new Map<string,()=>void>()
  let stopped=false
  const update=()=>handlers.onPeople([...people.values()])
  const report=(state:ConnectionReport['state']='connecting',detail?:string)=>{
    const peers=stopped?0:Object.values(room.getPeers()).filter(peer=>peer.connectionState==='connected').length
    handlers.onConnection?.({state:stopped?'closed':peers?'connected':state,peers,relayConfigured,...detail?{detail}:{}})
  }
  async function verify(peerId:string,value:Identity){
    if(!value||typeof value.name!=='string'||value.name.length>32||!Number.isFinite(value.expires)||value.expires<Date.now()||value.expires>Date.now()+61*60*1000)throw new Error('Invalid peer identity')
    if(invite.contract){
      if(!value.address||!value.signature||!await verifyMessage({address:value.address,message:identityText(invite,peerId,value.expires),signature:value.signature})||!await isMember(invite.contract,invite.id,value.address))throw new Error('Peer wallet is not authorized')
    }
    return {id:peerId,name:value.name,address:invite.contract?value.address:undefined}
  }
  const room=joinRoom({
    appId:'nadwave-monad-v1',password:invite.secret,maxReceiveBytes:64*1024,relayConfig:{redundancy:3},
    rtcConfig:{...(options.iceServers?.length?{iceServers:options.iceServers}:{}),iceTransportPolicy:options.iceTransportPolicy??'all'},
  },invite.id,{
    handshakeTimeoutMs:30000,
    onPeerHandshake:async(peerId,send,receive)=>{
      if(!canAdmitPeer(peerId,people.keys(),reserved))throw new Error('This room is full')
      reserved.add(peerId)
      try{
        await send(await seal(identity,invite.secret))
        const received=await receive()
        const person=await verify(peerId,await unseal<Identity>(received.data as Sealed,invite.secret))
        if(stopped)throw new Error('This session has ended.')
        admissions.set(peerId,person)
      }catch(error){reserved.delete(peerId);throw error}
    },
    onJoinError:details=>{
      reserved.delete(details.peerId);admissions.delete(details.peerId)
      const message=connectionError(details.error)
      report('failed',message)
      handlers.onError(message)
    },
  })
  function removeRemote(peerId:string,streamId:string){
    const key=peerId+':'+streamId
    const entry=remoteStreams.get(key)
    if(!entry)return
    entry.cleanup();remoteStreams.delete(key);handlers.onStreamRemoved?.(streamId,peerId)
  }
  function removePeerStreams(peerId:string){for(const [key,entry]of [...remoteStreams])if(key.startsWith(peerId+':'))removeRemote(peerId,entry.stream.id)}
  const action=room.makeAction<Sealed>('chat')
  const mediaAction=room.makeAction<Sealed>('media')
  const publisher=createMediaPublisher({
    capture:kind=>{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone and camera access require HTTPS or localhost.')
      return navigator.mediaDevices.getUserMedia(kind==='audio'?{audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}:{video:{width:{ideal:640},height:{ideal:360},frameRate:{ideal:24,max:30}},audio:false})
    },
    peers:()=>Object.keys(room.getPeers()),
    publish:async(stream,peerId)=>{await Promise.all(room.addStream(stream,{target:peerId}))},
    remove:stream=>room.removeStream(stream),
    onChange:(kind,enabled)=>handlers.onLocalMedia?.(kind,enabled),
    onRemoved:stream=>{if(!stopped)void seal({streamId:stream.id},invite.secret).then(value=>mediaAction.send(value)).catch(()=>{})},
  })
  const seen=new Set<string>()
  const receiveChat=(data:{id:string;text:string;at:number},peerId:string)=>{
    const person=people.get(peerId)
    if(!person||stopped||!data||typeof data.id!=='string'||data.id.length>50||typeof data.text!=='string'||!data.text.trim()||data.text.length>2000||!Number.isFinite(data.at)||Math.abs(Date.now()-data.at)>5*60*1000||seen.has(data.id))return
    seen.add(data.id);if(seen.size>500)seen.delete(seen.values().next().value!)
    handlers.onChat({...data,person})
  }
  action.onMessage=async(value,{peerId})=>{try{receiveChat(await unseal(value,invite.secret),peerId)}catch{/* Ignore malformed peer packets. */}}
  mediaAction.onMessage=async(value,{peerId})=>{
    try{const data=await unseal<{streamId:string}>(value,invite.secret);if(people.has(peerId)&&typeof data.streamId==='string'&&data.streamId.length<=128)removeRemote(peerId,data.streamId)}catch{/* Ignore malformed media notices. */}
  }
  // shortcut: same-origin tab chat is a fallback; audio/video still require WebRTC.
  const local=typeof BroadcastChannel==='undefined'?undefined:new BroadcastChannel('nadwave:'+invite.id+':'+(invite.contract??'invite'))
  const localStatus=()=>handlers.onLocalLink?.(localPeers.size>0)
  const postLocal=async(kind:string,value:unknown)=>{try{if(!stopped&&local){const frame=await seal({from:selfId,kind,value,at:Date.now()},invite.secret);if(!stopped)local.postMessage(frame)}}catch{/* Channel may close during encryption. */}}
  const dropLocal=(id:string)=>{localPeers.delete(id);if(!room.getPeers()[id]){people.delete(id);handlers.onLeave(id);update()}localStatus()}
  if(local)local.onmessage=async event=>{
    try{
      const frame=await unseal<{from:string;kind:string;value:unknown;at:number}>(event.data,invite.secret)
      if(stopped||typeof frame.from!=='string'||frame.from.length>128||frame.from===selfId||!Number.isFinite(frame.at)||Math.abs(Date.now()-frame.at)>15000)return
      if(frame.kind==='hello'){
        if(localPeers.has(frame.from)){localPeers.set(frame.from,Date.now());return}
        if(checking.has(frame.from)||!canAdmitPeer(frame.from,people.keys(),[...reserved,...checking]))return
        checking.add(frame.from)
        try{const person=await verify(frame.from,frame.value as Identity);if(stopped)return;people.set(frame.from,person);localPeers.set(frame.from,Date.now());update();localStatus();void postLocal('hello',identity)}finally{checking.delete(frame.from)}
      }else if(frame.kind==='chat'&&localPeers.has(frame.from))receiveChat(frame.value as {id:string;text:string;at:number},frame.from)
      else if(frame.kind==='leave')dropLocal(frame.from)
    }catch{/* Invalid local frames never admit a peer. */}
  }
  const localTimer=window.setInterval(()=>{void postLocal('hello',identity);for(const[id,last]of localPeers)if(Date.now()-last>7000)dropLocal(id)},2000)
  void postLocal('hello',identity)
  room.onPeerJoin=peerId=>{
    const person=admissions.get(peerId)
    if(person)people.set(peerId,person)
    admissions.delete(peerId);reserved.delete(peerId);update()
    const peer=room.getPeers()[peerId]
    if(peer){const onState=()=>report(peer.connectionState==='failed'?'failed':'connecting');peer.addEventListener('connectionstatechange',onState);peerListeners.set(peerId,()=>peer.removeEventListener('connectionstatechange',onState))}
    report()
    void publisher.addPeer(peerId).catch(()=>handlers.onError('A media stream could not connect. Rejoin the room to retry.'))
  }
  room.onPeerLeave=peerId=>{
    peerListeners.get(peerId)?.();peerListeners.delete(peerId);publisher.removePeer(peerId);reserved.delete(peerId);admissions.delete(peerId)
    removePeerStreams(peerId)
    if(!localPeers.has(peerId)){people.delete(peerId);update();handlers.onLeave(peerId)}
    report('connecting')
  }
  const receiveStream=(stream:MediaStream,peerId:string)=>{
    if(stopped||!people.has(peerId))return
    const key=peerId+':'+stream.id
    if(!remoteStreams.has(key)){
      const listeners=new Map<MediaStreamTrack,()=>void>()
      const watch=()=>{for(const track of stream.getTracks())if(!listeners.has(track)){const ended=()=>{if(stream.getTracks().every(item=>item.readyState==='ended'))removeRemote(peerId,stream.id)};track.addEventListener('ended',ended);listeners.set(track,()=>track.removeEventListener('ended',ended))}}
      const changed=()=>{watch();if(!stream.getTracks().length)removeRemote(peerId,stream.id)}
      watch();stream.addEventListener('addtrack',changed);stream.addEventListener('removetrack',changed)
      remoteStreams.set(key,{stream,cleanup:()=>{for(const cleanup of listeners.values())cleanup();stream.removeEventListener('addtrack',changed);stream.removeEventListener('removetrack',changed)}})
    }
    handlers.onStream(stream,peerId)
  }
  room.onPeerStream=receiveStream
  room.onPeerTrack=(_track,stream,peerId)=>receiveStream(stream,peerId)
  // shortcut: mesh is limited to eight people; use an SFU for larger streaming rooms.
  const interval=window.setInterval(async()=>{
    if(stopped||!invite.contract)return
    try{
      if(!address||!await isMember(invite.contract,invite.id,address)){leave();handlers.onError('Your membership expired or was removed. This session has ended.');return}
      for(const[id,person]of people)if(!person.address||!await isMember(invite.contract,invite.id,person.address)){room.getPeers()[id]?.close();removePeerStreams(id);localPeers.delete(id);people.delete(id);handlers.onLeave(id);update();localStatus()}
    }catch{leave();handlers.onError('Unable to verify membership on Monad. Session ended to protect room access.')}
  },15000)
  const expiry=window.setTimeout(()=>{leave();handlers.onError('This session has expired. Rejoin to renew your wallet signature.')},60*60*1000)
  function leave(){
    if(stopped)return
    stopped=true;clearInterval(interval);clearInterval(localTimer);clearTimeout(expiry)
    if(local)void seal({from:selfId,kind:'leave',value:null,at:Date.now()},invite.secret).then(frame=>local.postMessage(frame)).catch(()=>{}).finally(()=>local.close())
    publisher.close();localPeers.clear();localStatus()
    for(const entry of remoteStreams.values())entry.cleanup()
    remoteStreams.clear();for(const cleanup of peerListeners.values())cleanup();peerListeners.clear()
    admissions.clear();reserved.clear();void room.leave().catch(()=>{});people.clear();update();report('closed')
  }
  report('connecting','Waiting for another WebRTC participant.')
  return {
    self:{id:selfId,name:identity.name,address:invite.contract?address:undefined} as Person,
    async send(text:string){if(stopped)throw new Error('Rejoin the room to send messages.');if(!text.trim()||text.length>2000)throw new Error('Messages must contain 1–2,000 characters.');const data={id:crypto.randomUUID(),text:text.trim(),at:Date.now()};await Promise.all([action.send(await seal(data,invite.secret)),postLocal('chat',data)]);return {...data,person:{id:selfId,name:identity.name,address:invite.contract?address:undefined}} as Chat},
    async microphone(){const stream=await publisher.toggle('audio');return Boolean(stream.getAudioTracks().some(track=>track.readyState==='live'&&track.enabled))},
    camera:()=>publisher.toggle('video'),
    leave,
  }
}
export type Session=Awaited<ReturnType<typeof startSession>>
