import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newInvite,parseInvite,seal,unseal} from './crypto.ts'
test('encrypted chat round-trip, tamper detection and wrong-key rejection',async()=>{
 const first=newInvite('Studio');const second=newInvite('Other');const value={text:'Hello, Monad!'}
 const encrypted=await seal(value,first.secret)
 assert.deepEqual(await unseal(encrypted,first.secret),value)
 await assert.rejects(()=>unseal(encrypted,second.secret))
 await assert.rejects(()=>unseal({...encrypted,body:(encrypted.body[0]==='A'?'B':'A')+encrypted.body.slice(1)},first.secret))
 assert(!encrypted.body.includes('Hello'))
})
test('invite validates secrets, room ids and contract addresses',()=>{
 const invite=newInvite('Studio')
 const encode=(v:unknown)=>'#room='+Buffer.from(JSON.stringify(v)).toString('base64url')
 assert.deepEqual(parseInvite(encode(invite)),invite)
 for(const invalid of [{...invite,secret:'short'},{...invite,id:'0x123'},{...invite,contract:'not-address'},{...invite,v:2}])assert.throws(()=>parseInvite(encode(invalid)))
 assert.throws(()=>parseInvite('#room=bad'))
 assert.notEqual(newInvite('One').secret,newInvite('One').secret)
})
