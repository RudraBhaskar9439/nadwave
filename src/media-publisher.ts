export type MediaKind='audio'|'video'
type PublisherOptions={
  capture:(kind:MediaKind)=>Promise<MediaStream>
  peers:()=>string[]
  publish:(stream:MediaStream,peerId:string)=>Promise<void>
  remove:(stream:MediaStream)=>void
  onChange?:(kind:MediaKind,enabled:boolean)=>void
  onRemoved?:(stream:MediaStream)=>void
}

export function createMediaPublisher(options:PublisherOptions){
  const streams=new Map<MediaKind,MediaStream>()
  const published=new Map<string,Set<string>>()
  const pending=new Map<MediaKind,Promise<MediaStream>>()
  let closed=false
  function remove(kind:MediaKind,stream:MediaStream){
    if(streams.get(kind)!==stream)return
    streams.delete(kind)
    options.remove(stream)
    for(const ids of published.values())ids.delete(stream.id)
    for(const track of stream.getTracks()){track.enabled=false;track.stop()}
    options.onChange?.(kind,false)
    options.onRemoved?.(stream)
  }
  async function share(stream:MediaStream,peerIds:string[]){
    await Promise.all(peerIds.map(async peerId=>{
      if(closed)return
      let ids=published.get(peerId)
      if(!ids){ids=new Set();published.set(peerId,ids)}
      if(ids.has(stream.id))return
      ids.add(stream.id)
      try{await options.publish(stream,peerId)}catch(error){ids.delete(stream.id);throw error}
    }))
  }
  async function change(kind:MediaKind){
    if(closed)throw new Error('This session has ended.')
    const current=streams.get(kind)
    const live=current?.getTracks().find(track=>track.kind===kind&&track.readyState==='live')
    if(current&&live){
      if(kind==='video')remove(kind,current)
      else {live.enabled=!live.enabled;options.onChange?.(kind,live.enabled)}
      return current
    }
    const stream=await options.capture(kind)
    if(closed){stream.getTracks().forEach(track=>track.stop());throw new Error('This session has ended.')}
    const track=stream.getTracks().find(item=>item.kind===kind&&item.readyState==='live')
    if(!track){stream.getTracks().forEach(item=>item.stop());throw new Error(`No ${kind} track is available.`)}
    streams.set(kind,stream)
    track.addEventListener('ended',()=>remove(kind,stream),{once:true})
    try{
      await share(stream,options.peers())
      if(closed){remove(kind,stream);throw new Error('This session has ended.')}
      if(streams.get(kind)!==stream||track.readyState!=='live')throw new Error('The media device stopped before streaming started.')
      options.onChange?.(kind,true)
      return stream
    }catch(error){remove(kind,stream);throw error}
  }
  return {
    toggle(kind:MediaKind){
      const operation=(pending.get(kind)?.catch(()=>undefined)??Promise.resolve()).then(()=>change(kind))
      pending.set(kind,operation)
      void operation.finally(()=>{if(pending.get(kind)===operation)pending.delete(kind)}).catch(()=>{})
      return operation
    },
    async addPeer(peerId:string){await Promise.all([...streams.values()].map(stream=>share(stream,[peerId])))},
    removePeer(peerId:string){published.delete(peerId)},
    close(){if(closed)return;closed=true;for(const [kind,stream]of [...streams])remove(kind,stream);published.clear()},
  }
}
