import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createIceHandler} from '../api/ice.js'
const env={NODE_ENV:'production',METERED_TURN_DOMAIN:'nadwave.metered.live',METERED_TURN_API_KEY:'server-only-test-key'}
async function invoke(handler,headers={},method='GET') {
  const response={headers:{},setHeader(key,value){this.headers[key]=value},end(body){this.body=JSON.parse(body)}}
  await handler({method,headers:{host:'nadwave.vercel.app',...headers},socket:{remoteAddress:'127.0.0.1'}},response)
  return response
}
test('server fetches TURN credentials, preserves TLS/UDP entries and caches without exposing API key',async()=>{
  let calls=0
  const servers=[{urls:'stun:stun.relay.metered.ca:80'},{urls:['turn:global.relay.metered.ca:80','turns:global.relay.metered.ca:443?transport=tcp'],username:'user',credential:'temporary-turn-password'}]
  const handler=createIceHandler({env,fetcher:async url=>{calls++;assert.equal(url.searchParams.get('apiKey'),env.METERED_TURN_API_KEY);return {ok:true,json:async()=>servers}}})
  const result=await invoke(handler,{origin:'https://nadwave.vercel.app','sec-fetch-site':'same-origin'})
  assert.equal(result.statusCode,200);assert.deepEqual(result.body.iceServers,servers);assert.equal(result.body.relayConfigured,true)
  assert(!JSON.stringify(result).includes(env.METERED_TURN_API_KEY))
  await invoke(handler);assert.equal(calls,1)
})
test('wrong method and foreign origin cannot request provider credentials',async()=>{
 const handler=createIceHandler({env,fetcher:()=>assert.fail('Must not fetch')})
 assert.equal((await invoke(handler,{},'POST')).statusCode,405)
 assert.equal((await invoke(handler,{origin:'https://other.example'})).statusCode,403)
 assert.equal((await invoke(handler,{'sec-fetch-site':'cross-site'})).statusCode,403)
})
test('missing config, invalid provider host and provider failures fail safely without leaking secrets',async()=>{
 assert.equal((await invoke(createIceHandler({env:{}}))).statusCode,503)
 assert.equal((await invoke(createIceHandler({env:{...env,METERED_TURN_DOMAIN:'127.0.0.1'},fetcher:()=>assert.fail('Must not fetch')}))).statusCode,503)
 const failure=await invoke(createIceHandler({env,fetcher:async()=>{throw new Error(env.METERED_TURN_API_KEY)}}))
 assert.equal(failure.statusCode,503);assert(!JSON.stringify(failure).includes(env.METERED_TURN_API_KEY))
})
test('malformed upstream replies are rejected and repeated requests are throttled',async()=>{
 const handler=createIceHandler({env,fetcher:async()=>({ok:true,json:async()=>[{urls:'https://invalid.example'}]})})
 assert.equal((await invoke(handler)).statusCode,503)
 for(let i=1;i<20;i++)await invoke(handler)
 assert.equal((await invoke(handler)).statusCode,429)
})
