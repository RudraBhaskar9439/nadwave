import {useEffect,useRef,useState} from 'react'
import {Headphones,VolumeX,Volume2} from 'lucide-react'
import type {Person} from './realtime'

export function groupMedia(streams:Record<string,MediaStream>,people:Person[]) {
  const groups=new Map<string,{id:string;name:string;streams:MediaStream[]}>()
  for(const [key,stream] of Object.entries(streams)) {
    if(!stream.getTracks().some(track=>track.readyState==='live'))continue
    const person=people.find(person=>key.startsWith(person.id+':'))
    if(!person)continue
    const group=groups.get(person.id)??{id:person.id,name:person.name,streams:[]}
    if(!group.streams.some(item=>item.id===stream.id))group.streams.push(stream)
    groups.set(person.id,group)
  }
  return [...groups.values()]
}

function StreamPlayer({stream,name,muted,local=false}:{stream:MediaStream;name:string;muted:boolean;local?:boolean}) {
  const ref=useRef<HTMLMediaElement>(null)
  const [blocked,setBlocked]=useState(false)
  const hasVideo=stream.getVideoTracks().some(track=>track.readyState==='live')
  useEffect(()=>{
    const element=ref.current
    if(!element)return
    element.srcObject=stream
    void element.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true))
    return()=>{element.pause();element.srcObject=null}
  },[stream])
  const retry=()=>{void ref.current?.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true))}
  return <>
    {hasVideo?<video ref={element=>{ref.current=element}} autoPlay playsInline muted={local||muted} className="camera-tile" aria-label={local?'Your camera preview':`${name}'s camera`}/>:<audio ref={element=>{ref.current=element}} autoPlay playsInline muted={muted}/>}
    {blocked&&<button className="playback-button" onClick={retry}><Volume2 size={14}/>Play {name}'s {hasVideo?'video':'audio'}</button>}
  </>
}

export default function MediaStage({streams,people,camera,cameraOn,muted,displayName}:{streams:Record<string,MediaStream>;people:Person[];camera?:MediaStream;cameraOn:boolean;muted:boolean;displayName:string}) {
  const [version,refresh]=useState(0)
  useEffect(()=>{
    const onChange=()=>refresh(value=>value+1)
    const all=Object.values(streams)
    const tracks=all.flatMap(stream=>stream.getTracks())
    for(const stream of all){stream.addEventListener('addtrack',onChange);stream.addEventListener('removetrack',onChange)}
    for(const track of tracks){track.addEventListener('ended',onChange);track.addEventListener('mute',onChange);track.addEventListener('unmute',onChange)}
    return()=>{for(const stream of all){stream.removeEventListener('addtrack',onChange);stream.removeEventListener('removetrack',onChange)}for(const track of tracks){track.removeEventListener('ended',onChange);track.removeEventListener('mute',onChange);track.removeEventListener('unmute',onChange)}}
  },[streams,version])
  const groups=groupMedia(streams,people)
  if(!cameraOn&&!groups.length)return null
  return <div className="media-grid" aria-label="Live participants">
    {cameraOn&&camera&&<div className="media-tile local-camera"><StreamPlayer stream={camera} name="your" muted local/><span className="media-name">{displayName||'You'} <small>you · preview</small></span></div>}
    {groups.map(group=>{
      const videos=group.streams.filter(stream=>stream.getVideoTracks().some(track=>track.readyState==='live'))
      const hasAudio=group.streams.some(stream=>stream.getAudioTracks().some(track=>track.readyState==='live'))
      return <div className={'media-tile '+(videos.length?'':'audio-tile')} key={group.id}>
        {!videos.length&&<div className="audio-avatar"><span className="avatar">{group.name.slice(0,1).toUpperCase()}</span><span>{muted?<VolumeX size={18}/>:<Headphones size={18}/>}</span><small>{hasAudio?(muted?'Playback muted':'Audio stream received'):'Waiting for media'}</small></div>}
        {group.streams.map(stream=><StreamPlayer key={stream.id} stream={stream} name={group.name} muted={muted}/>)}
        <span className="media-name">{group.name}<small>{videos.length?'live video':'live audio'}</small></span>
      </div>
    })}
  </div>
}
