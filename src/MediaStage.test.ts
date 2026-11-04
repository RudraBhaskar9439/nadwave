import {test} from 'node:test'
import assert from 'node:assert/strict'
import {groupMedia} from './MediaStage'
const stream=(id:string,readyState='live')=>({id,getTracks:()=>[{readyState}]}) as unknown as MediaStream
test('received streams stay attached to verified participant and are not duplicated',()=>{
  const voice=stream('voice'),camera=stream('camera')
  const groups=groupMedia({'peer:voice':voice,'peer:camera':camera,'peer:duplicate':voice,'unknown:other':stream('other')},[{id:'peer',name:'Alice'}])
  assert.equal(groups.length,1)
  assert.equal(groups[0].name,'Alice')
  assert.deepEqual(groups[0].streams,[voice,camera])
})
test('ended media and departed participants disappear from the media stage',()=>{
  assert.deepEqual(groupMedia({'peer:ended':stream('ended','ended')},[{id:'peer',name:'Alice'}]),[])
  assert.deepEqual(groupMedia({'peer:voice':stream('voice')},[]),[])
})
