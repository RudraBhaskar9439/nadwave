import {test} from 'node:test'
import assert from 'node:assert/strict'
import {canAdmitPeer} from './realtime.ts'

test('an admitted local peer can upgrade to WebRTC when the room is full',()=>{
  const peers=Array.from({length:7},(_,index)=>'peer-'+index)
  assert.equal(canAdmitPeer('peer-3',peers),true)
  assert.equal(canAdmitPeer('new-peer',peers),false)
})
test('pending handshakes reserve capacity without double-counting an admitted peer',()=>{
  const peers=Array.from({length:6},(_,index)=>'peer-'+index)
  assert.equal(canAdmitPeer('new-peer',peers,['pending']),false)
  assert.equal(canAdmitPeer('pending',peers,['pending']),true)
  assert.equal(canAdmitPeer('new-peer',peers,['peer-1']),true)
})
