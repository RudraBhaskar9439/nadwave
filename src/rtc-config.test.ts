import {test} from 'node:test'
import assert from 'node:assert/strict'
import {loadRtcConfig} from './rtc-config.ts'

test('relay configuration comes from the same-origin server and keeps UDP/TLS endpoints',async()=>{
 const original=globalThis.fetch
 const iceServers=[{urls:'stun:stun.relay.metered.ca:80'},{urls:['turn:global.relay.metered.ca:80','turns:global.relay.metered.ca:443?transport=tcp'],username:'test',credential:'turn-password'}]
 globalThis.fetch=async(input,options)=>{
  assert.equal(input,'/api/ice');assert.equal(options?.credentials,'same-origin')
  return new Response(JSON.stringify({iceServers}),{status:200})
 }
 try{const config=await loadRtcConfig({relayOnly:true});assert.deepEqual(config.iceServers,iceServers);assert.equal(config.relayConfigured,true);assert.equal(config.iceTransportPolicy,'relay')}
 finally{globalThis.fetch=original}
})

test('invalid relay response falls back to STUN without claiming relay readiness',async()=>{
 const original=globalThis.fetch
 globalThis.fetch=async()=>new Response(JSON.stringify({iceServers:[{urls:'https://invalid.example'}]}),{status:200})
 try{const config=await loadRtcConfig();assert.equal(config.relayConfigured,false);assert(config.warning);assert(config.iceServers.every(server=>String(server.urls).startsWith('stun:')))}
 finally{globalThis.fetch=original}
})

test('relay-only verification fails explicitly when the relay is unavailable',async()=>{
 const original=globalThis.fetch
 globalThis.fetch=async()=>new Response('{}',{status:503})
 try{await assert.rejects(()=>loadRtcConfig({relayOnly:true}),/relay is unavailable/)}
 finally{globalThis.fetch=original}
})
