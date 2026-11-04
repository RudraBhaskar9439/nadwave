import {joinRoom,selfId} from 'trystero/nostr'
import {verifyMessage,type Address,type Hex} from 'viem'
import {seal,unseal,type Invite,type Sealed} from './crypto'
import {isMember,signIdentity} from './wallet'

export type Person={id:string;name:string;address?:Address}
export type Chat={id:string;text:string;at:number;person:Person}
type Identity={name:string;address?:Address;signature?:Hex;expires:number}
type Handlers={onPeople:(people:Person[])=>void;onChat:(chat:Chat)=>void;onStream:(stream:MediaStream,id:string)=>void;onLeave:(id:string)=>void;onError:(message:string)=>void}
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
  action.onMessage=async(value,{peerId})=>{
    try {
      const person=people.get(peerId);if(!person || stopped)return
      const data=await unseal<{id:string;text:string;at:number}>(value,invite.secret)
      if(typeof data.id!=='string'||data.id.length>50||typeof data.text!=='string'||!data.text.trim()||data.text.length>2000||!Number.isFinite(data.at)||Math.abs(Date.now()-data.at)>5*60*1000||seen.has(data.id))return
      seen.add(data.id);if(seen.size>500)seen.delete(seen.values().next().value!)
      handlers.onChat({...data,person})
    }catch { /* Ignore malformed or unauthenticated peer packets. */ }
  }
  room.onPeerJoin=peerId=>{update();if(localStream)void room.addStream(localStream,{target:peerId});if(cameraStream)void room.addStream(cameraStream,{target:peerId})}
  room.onPeerLeave=peerId=>{people.delete(peerId);update();handlers.onLeave(peerId)}
  room.onPeerStream=(stream,peerId)=>{if(people.has(peerId))handlers.onStream(stream,peerId)}
  // shortcut: full mesh targets small groups; use an SFU plus managed TURN before scaling beyond eight people.
  const interval=window.setInterval(async()=>{
    if(stopped || !invite.contract)return
    try {
      if(!address||!await isMember(invite.contract,invite.id,address)) { leave();handlers.onError('Your membership expired or was removed. This session has ended.');return }
      for(const [id,person] of people)if(!person.address||!await isMember(invite.contract,invite.id,person.address)){room.getPeers()[id]?.close();people.delete(id);handlers.onLeave(id);update()}
    } catch { leave();handlers.onError('Unable to verify membership on Monad. Session ended to protect room access.') }
  },15000)
  const expiry=window.setTimeout(()=>{leave();handlers.onError('This session has expired. Rejoin to renew your wallet signature.')},60*60*1000)
  function leave(){if(stopped)return;stopped=true;clearInterval(interval);clearTimeout(expiry);localStream?.getTracks().forEach(t=>t.stop());cameraStream?.getTracks().forEach(t=>t.stop());room.leave();people.clear();update()}
  return {
    self:{id:selfId,name:identity.name,address:invite.contract?address:undefined} as Person,
    async send(text:string){if(stopped)throw new Error('Rejoin the room to send messages.');if(!text.trim()||text.length>2000)throw new Error('Messages must contain 1–2,000 characters.');const data={id:crypto.randomUUID(),text:text.trim(),at:Date.now()};await action.send(await seal(data,invite.secret));return {...data,person:{id:selfId,name:identity.name,address:invite.contract?address:undefined}} as Chat},
    async microphone(){
      if(stopped)throw new Error('Rejoin the room to enable audio.')
      if(localStream){localStream.getTracks().forEach(t=>{t.enabled=!t.enabled});return localStream.getAudioTracks()[0].enabled}
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires HTTPS or localhost.')
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})
      if(stopped){stream.getTracks().forEach(t=>t.stop());throw new Error('This session has ended.')}
      localStream=stream
      try{await room.addStream(stream);return true}catch(error){stream.getTracks().forEach(t=>t.stop());localStream=undefined;throw error}
    },
    async camera(){
      if(stopped)throw new Error('Rejoin the room to enable your camera.')
      if(cameraStream){cameraStream.getVideoTracks().forEach(t=>{t.enabled=!t.enabled});return cameraStream}
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires HTTPS or localhost.')
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:320},height:{ideal:240},frameRate:{ideal:12,max:15}},audio:false})
      if(stopped){stream.getTracks().forEach(t=>t.stop());throw new Error('This session has ended.')}
      cameraStream=stream
      try{await room.addStream(stream);return stream}catch(error){stream.getTracks().forEach(t=>t.stop());cameraStream=undefined;throw error}
    },
    leave,
  }
}
export type Session=Awaited<ReturnType<typeof startSession>>
