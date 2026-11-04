import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createMediaPublisher,type MediaKind} from './media-publisher.ts'

class Track extends EventTarget {
  enabled=true
  readyState:'live'|'ended'='live'
  stops=0
  constructor(public kind:MediaKind){super()}
  stop(){this.stops++;this.readyState='ended'}
  end(){this.readyState='ended';this.dispatchEvent(new Event('ended'))}
}
function stream(kind:MediaKind){
  const track=new Track(kind)
  const value={id:crypto.randomUUID(),getTracks:()=>[track],getAudioTracks:()=>kind==='audio'?[track]:[],getVideoTracks:()=>kind==='video'?[track]:[]} as unknown as MediaStream
  return {track,value}
}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve}}

test('leaving while a device permission request is pending releases the acquired device',async()=>{
  const pending=deferred<MediaStream>(),media=stream('audio')
  let publishes=0
  const publisher=createMediaPublisher({capture:()=>pending.promise,peers:()=>['peer'],publish:async()=>{publishes++},remove:()=>{}})
  const request=publisher.toggle('audio')
  await Promise.resolve()
  publisher.close();pending.resolve(media.value)
  await assert.rejects(request,/ended/)
  assert.equal(media.track.stops,1);assert.equal(publishes,0)
})
test('camera off removes and stops media; enabling it again acquires a new stream',async()=>{
  const created:ReturnType<typeof stream>[]=[],removed:string[]=[]
  const publisher=createMediaPublisher({capture:async kind=>{const media=stream(kind);created.push(media);return media.value},peers:()=>['peer'],publish:async()=>{},remove:media=>removed.push(media.id)})
  await publisher.toggle('video');await publisher.toggle('video')
  assert.equal(created[0].track.readyState,'ended');assert.equal(created[0].track.enabled,false)
  assert.deepEqual(removed,[created[0].value.id])
  await publisher.toggle('video');assert.equal(created.length,2);assert.equal(created[1].track.readyState,'live')
  publisher.close();assert.equal(created[1].track.readyState,'ended')
})
test('microphone mute retains its track and a late peer receives it only once',async()=>{
  const media=stream('audio'),sent:string[]=[]
  const pending=deferred<void>()
  const publisher=createMediaPublisher({capture:async()=>media.value,peers:()=>['a'],publish:async(_media,id)=>{sent.push(id);await pending.promise},remove:()=>{}})
  const toggled=publisher.toggle('audio')
  await new Promise(resolve=>setTimeout(resolve,0))
  const joined=publisher.addPeer('a')
  pending.resolve();await Promise.all([toggled,joined])
  assert.deepEqual(sent,['a'])
  await publisher.toggle('audio');assert.equal(media.track.enabled,false);assert.equal(media.track.readyState,'live')
  await publisher.addPeer('b');await publisher.addPeer('b');assert.deepEqual(sent,['a','b'])
  publisher.close()
})
test('capture publication failure and external track end release media and update controls',async()=>{
  const media=stream('video'),changes:boolean[]=[]
  const publisher=createMediaPublisher({capture:async()=>media.value,peers:()=>['peer'],publish:async()=>{throw new Error('publish failed')},remove:()=>{},onChange:(_kind,enabled)=>changes.push(enabled)})
  await assert.rejects(()=>publisher.toggle('video'),/publish failed/)
  assert.equal(media.track.readyState,'ended');assert.deepEqual(changes,[false])
  const next=stream('audio'),ended:boolean[]=[]
  const active=createMediaPublisher({capture:async()=>next.value,peers:()=>[],publish:async()=>{},remove:()=>{},onChange:(_kind,enabled)=>ended.push(enabled)})
  await active.toggle('audio');next.track.end();assert.deepEqual(ended,[true,false])
  active.close()
})
test('a device that ends during publication never reports streaming ready',async()=>{
  const media=stream('video'),pending=deferred<void>(),changes:boolean[]=[]
  const publisher=createMediaPublisher({capture:async()=>media.value,peers:()=>['peer'],publish:()=>pending.promise,remove:()=>{},onChange:(_kind,enabled)=>changes.push(enabled)})
  const request=publisher.toggle('video')
  await new Promise(resolve=>setTimeout(resolve,0))
  media.track.end();pending.resolve()
  await assert.rejects(request,/device stopped/)
  assert.deepEqual(changes,[false])
  publisher.close()
})
