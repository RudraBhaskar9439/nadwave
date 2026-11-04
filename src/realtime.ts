import {joinRoom,selfId} from 'trystero/nostr'
import {verifyMessage,type Address,type Hex} from 'viem'
import {seal,unseal,type Invite,type Sealed} from './crypto'
import {isMember,signIdentity} from './wallet'

export type Person={id:string;name:string;address?:Address}
export type Chat={id:string;text:string;at:number;person:Person}
type Identity={name:string;address?:Address;signature?:Hex;expires:number}
type Handlers={onPeople:(people:Person[])=>void;onChat:(chat:Chat)=>void;onStream:(stream:MediaStream,id:string)=>void;onLeave:(id:string)=>void;onError:(message:string)=>void;onLocalLink?:(connected:boolean)=>void}
function identityText(invite:Invite,peerId:string,expires:number) { return `Nadwave room access\nRoom: ${invite.id}\nRegistry: ${invite.contract??'invite-only'}\nNetwork: Monad Testnet (10143)\nPeer: ${peerId}\nExpires: ${expires}` }
export async function startSession(invite:Invite,name:string,address:Address|undefined,handlers:Handlers) {
  const identity:Identity={name:name.trim().slice(0,32)||'Anonymous listener',address,expires:Date.now()+60*60*1000}
  if(invite.contract) {
    if(!address || !await isMember(invite.contract,invite.id,address))throw new Error('Your wallet is not an approved member. Ask the room owner to approve it on Monad.')
    identity.signature=await signIdentity(identityText(invite,selfId,identity.expires),address)
  }
  const people=new Map<string,Person>()
  let localStream:MediaStream|undefined
  let cameraStream:MediaStream|undefined
  let stopped=false
  const update=()=>handlers.onPeople([...people.values()])
  async function verify(peerId:string,value:Identity) {
    if(!value || typeof value.name!=='string' || value.name.length>32 || !Number.isFinite(value.expires) || value.expires<Date.now() || value.expires>Date.now()+61*60*1000)throw new Error('Invalid peer identity')
    if(invite.contract) {
      if(!value.address || !value.signature || !await verifyMessage({address:value.address,message:identityText(invite,peerId,value.expires),signature:value.signature}) || !await isMember(invite.contract,invite.id,value.address))throw new Error('Peer wallet is not authorized')
    }
    return {id:peerId,name:value.name,address:invite.contract?value.address:undefined}
  }
  const room=joinRoom({appId:'nadwave-monad-v1',password:invite.secret,maxReceiveBytes:64*1024,relayConfig:{redundancy:3}},invite.id,{
    handshakeTimeoutMs:30000,
    onPeerHandshake:async(peerId,send,receive)=>{
      if(people.size>=7)throw new Error('This room is full')
      await send(await seal(identity,invite.secret))
      const received=await receive()
      const peer=await verify(peerId,await unseal<Identity>(received.data as Sealed,invite.secret))
      people.set(peerId,peer)
    },
    onJoinError:()=>handlers.onError('A peer could not connect. Check the invite and wallet approval; restrictive networks may need a TURN relay.')
  })
  const action=room.makeAction<Sealed>('chat')
  const seen=new Set<string>()
  const receiveChat=(data:{id:string;text:string;at:number},peerId:string)=>{
    const person=people.get(peerId);if(!person || stopped)return
      if(typeof data.id!=='string'||data.id.length>50||typeof data.text!=='string'||!data.text.trim()||data.text.length>2000||!Number.isFinite(data.at)||Math.abs(Date.now()-data.at)>5*60*1000||seen.has(data.id))return
      seen.add(data.id);if(seen.size>500)seen.delete(seen.values().next().value!)
      handlers.onChat({...data,person})
  }
  action.onMessage=async(value,{peerId})=>{try{receiveChat(await unseal(value,invite.secret),peerId)}catch{/* Ignore malformed peer packets. */}}

  // shortcut: BroadcastChannel provides same-origin tab chat when public discovery is unavailable; remote media still requires WebRTC.
  const local=typeof BroadcastChannel==='undefined'?undefined:new BroadcastChannel('nadwave:'+invite.id+':'+(invite.contract??'invite'))
  const localPeers=new Map<string,number>()
  const checking=new Set<string>()
  const localStatus=()=>handlers.onLocalLink?.(localPeers.size>0)
  const postLocal=async(kind:string,value:unknown)=>{try{if(!stopped&&local){const frame=await seal({from:selfId,kind,value,at:Date.now()},invite.secret);if(!stopped)local.postMessage(frame)}}catch{/* The channel may close while encryption finishes. */}}
  const dropLocal=(id:string)=>{localPeers.delete(id);if(!room.getPeers()[id]){people.delete(id);handlers.onLeave(id);update()}localStatus()}
  if(local)local.onmessage=async event=>{
    try{
      const frame=await unseal<{from:string;kind:string;value:unknown;at:number}>(event.data,invite.secret)
      if(stopped||typeof frame.from!=='string'||frame.from.length>128||frame.from===selfId||!Number.isFinite(frame.at)||Math.abs(Date.now()-frame.at)>15000)return
      if(frame.kind==='hello'){
        if(localPeers.has(frame.from)){localPeers.set(frame.from,Date.now());return}
        if(checking.has(frame.from)||people.size>=7)return
        checking.add(frame.from)
        try{const person=await verify(frame.from,frame.value as Identity);if(stopped)return;people.set(frame.from,person);localPeers.set(frame.from,Date.now());update();localStatus();void postLocal('hello',identity)}finally{checking.delete(frame.from)}
      }else if(frame.kind==='chat'&&localPeers.has(frame.from)){receiveChat(frame.value as {id:string;text:string;at:number},frame.from)}
      else if(frame.kind==='leave'){dropLocal(frame.from)}
    }catch{/* Wrong-key and invalid local frames never admit a peer. */}
  }
  const localTimer=window.setInterval(()=>{void postLocal('hello',identity);for(const[id,last]of localPeers)if(Date.now()-last>7000)dropLocal(id)},2000)
  void postLocal('hello',identity)
  room.onPeerJoin=peerId=>{update();for(const stream of [localStream,cameraStream])if(stream)void Promise.all(room.addStream(stream,{target:peerId})).catch(()=>handlers.onError('A media connection failed. Rejoin the room to reconnect.'))}
  room.onPeerLeave=peerId=>{if(!localPeers.has(peerId)){people.delete(peerId);update();handlers.onLeave(peerId)}}
  room.onPeerStream=(stream,peerId)=>{if(people.has(peerId))handlers.onStream(stream,peerId)}
  // shortcut: full mesh targets small groups; use an SFU plus managed TURN before scaling beyond eight people.
  const interval=window.setInterval(async()=>{
    if(stopped || !invite.contract)return
    try {
      if(!address||!await isMember(invite.contract,invite.id,address)) { leave();handlers.onError('Your membership expired or was removed. This session has ended.');return }
      for(const [id,person] of people)if(!person.address||!await isMember(invite.contract,invite.id,person.address)){room.getPeers()[id]?.close();localPeers.delete(id);people.delete(id);handlers.onLeave(id);update();localStatus()}
    } catch { leave();handlers.onError('Unable to verify membership on Monad. Session ended to protect room access.') }
  },15000)
  const expiry=window.setTimeout(()=>{leave();handlers.onError('This session has expired. Rejoin to renew your wallet signature.')},60*60*1000)
  function leave(){if(stopped)return;stopped=true;clearInterval(interval);clearInterval(localTimer);clearTimeout(expiry);if(local)void seal({from:selfId,kind:'leave',value:null,at:Date.now()},invite.secret).then(frame=>local.postMessage(frame)).catch(()=>{}).finally(()=>local.close());localPeers.clear();localStatus();localStream?.getTracks().forEach(t=>t.stop());cameraStream?.getTracks().forEach(t=>t.stop());void room.leave().catch(()=>{});people.clear();update()}
  return {
    self:{id:selfId,name:identity.name,address:invite.contract?address:undefined} as Person,
    async send(text:string){if(stopped)throw new Error('Rejoin the room to send messages.');if(!text.trim()||text.length>2000)throw new Error('Messages must contain 1–2,000 characters.');const data={id:crypto.randomUUID(),text:text.trim(),at:Date.now()};await Promise.all([action.send(await seal(data,invite.secret)),postLocal('chat',data)]);return {...data,person:{id:selfId,name:identity.name,address:invite.contract?address:undefined}} as Chat},
    async microphone(){
      if(stopped)throw new Error('Rejoin the room to enable audio.')
      if(localStream){localStream.getTracks().forEach(t=>{t.enabled=!t.enabled});return localStream.getAudioTracks()[0].enabled}
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires HTTPS or localhost.')
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})
      if(stopped){stream.getTracks().forEach(t=>t.stop());throw new Error('This session has ended.')}
      localStream=stream
      try{await Promise.all(room.addStream(stream));return true}catch(error){stream.getTracks().forEach(t=>t.stop());localStream=undefined;throw error}
    },
    async camera(){
      if(stopped)throw new Error('Rejoin the room to enable your camera.')
      if(cameraStream){cameraStream.getVideoTracks().forEach(t=>{t.enabled=!t.enabled});return cameraStream}
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires HTTPS or localhost.')
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:320},height:{ideal:240},frameRate:{ideal:12,max:15}},audio:false})
      if(stopped){stream.getTracks().forEach(t=>t.stop());throw new Error('This session has ended.')}
      cameraStream=stream
      try{await Promise.all(room.addStream(stream));return stream}catch(error){stream.getTracks().forEach(t=>t.stop());cameraStream=undefined;throw error}
    },
    leave,
  }
}
export type Session=Awaited<ReturnType<typeof startSession>>
