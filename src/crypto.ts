export type Invite = {v:1; id:`0x${string}`; secret:string; name:string; contract?:`0x${string}`}
export type Sealed = {iv:string; body:string}
const encoder = new TextEncoder()
const encode = (bytes:Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
const decode = (value:string) => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))
export function newInvite(name:string):Invite {
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('')
  return {v:1,id:`0x${id}`,secret:encode(crypto.getRandomValues(new Uint8Array(32))),name:name.trim().slice(0,60)||'Untitled frequency'}
}
export function inviteURL(invite:Invite) { return `${location.origin}${location.pathname}#room=${encode(encoder.encode(JSON.stringify(invite)))}` }
export function parseInvite(value:string):Invite {
  const hash = value.includes('#') ? value.slice(value.indexOf('#')+1) : value.replace(/^#/,'')
  const encoded = new URLSearchParams(hash).get('room')
  if (!encoded || encoded.length>2000) throw new Error('This invite link is incomplete.')
  const item = JSON.parse(new TextDecoder().decode(decode(encoded))) as Invite
  if (item.v!==1 || !/^0x[\da-f]{32}$/i.test(item.id) || typeof item.name!=='string' || !item.name.trim() || item.name.length>60 || typeof item.secret!=='string' || !/^[\w-]{43}$/.test(item.secret) || decode(item.secret).length!==32 || (item.contract&&!/^0x[\da-f]{40}$/i.test(item.contract))) throw new Error('This invite link is invalid.')
  return item
}
async function importKey(secret:string) { return crypto.subtle.importKey('raw',decode(secret),{name:'AES-GCM'},false,['encrypt','decrypt']) }
export async function seal(value:unknown,secret:string):Promise<Sealed> {
  const iv=crypto.getRandomValues(new Uint8Array(12))
  const body=await crypto.subtle.encrypt({name:'AES-GCM',iv},await importKey(secret),encoder.encode(JSON.stringify(value)))
  return {iv:encode(iv),body:encode(new Uint8Array(body))}
}
export async function unseal<T>(value:Sealed,secret:string):Promise<T> {
  if (!value || typeof value.iv!=='string' || value.iv.length!==16 || typeof value.body!=='string' || value.body.length>24000) throw new Error('Invalid encrypted packet')
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv)},await importKey(secret),decode(value.body))
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
