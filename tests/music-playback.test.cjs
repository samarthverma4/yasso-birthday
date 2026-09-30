const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const html=readFileSync(new URL('../index.html',`file://${__filename}`),'utf8');
const horn=html.slice(html.indexOf('  function stopSong(){'),html.indexOf('  function puff(){'));
const player=html.slice(html.indexOf('  const recordBuffers=new Map();'),html.indexOf('  function spawnNote(){'));
function fixture({defer=false}={}){
  const sources=[],timers=[],renders=[];
  const param=()=>({value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
  const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){this.disconnected=true;}});
  const ctx={currentTime:5,destination:node(),createGain:node,createBiquadFilter:node,createBufferSource(){const s={...node(),start(t){this.started=t;},stop(t){this.stopped=t;}};sources.push(s);return s;}};
  class Offline {
    constructor(channels,length,rate){this.destination=node();this.length=length;}
    startRendering(){if(!defer)return Promise.resolve({length:this.length});return new Promise((resolve,reject)=>renders.push({resolve,reject}));}
  }
  const sandbox={ctx,window:{OfflineAudioContext:Offline},setTimeout(fn,ms){const t={fn,ms};timers.push(t);return t;},clearTimeout(t){if(t)t.cancelled=true;},clearInterval(){},setInterval(){},console};
  runInNewContext(`
    const audio=()=>ctx, reduce=true, gStatus={}, discLabel={setAttribute(){}}, hornBtn={setAttribute(){},removeAttribute(){}};
    const sleeves=[], labelCols=['red','pink','blue'], records=[0,1,2].map(i=>({name:'Record '+i,duration:12+i,play(){}}));
    let session=null,current=0,noteTimer=null,playing=false,hornSession=null;
    const song=[[440,1]], hornNote=()=>{}, crackle=()=>{}, syncGram=()=>{}, kick=()=>{}, spawnNote=()=>{};
    ${horn}\n${player}
    globalThis.controls={startRecord,stopRecord,playSong,snapshot:()=>({session,current,playing,hornSession,status:gStatus.textContent})};
  `,sandbox);
  return {controls:sandbox.controls,sources,timers,renders};
}
test('a record uses continuous audio looping with no song-end stop timer',async()=>{
  const f=fixture();await f.controls.startRecord(0);
  assert.equal(f.sources.length,1);assert.equal(f.sources[0].loop,true);
  assert.equal(f.sources[0].stopped,undefined);assert.equal(f.timers.length,0);
  assert.equal(f.controls.snapshot().status,'Playing on repeat: Record 0');
});
test('choosing a different record stops the old source and loops the new one',async()=>{
  const f=fixture();await f.controls.startRecord(0);await f.controls.startRecord(1);
  assert.equal(f.sources[0].stopped,5.25);assert.equal(f.sources[1].loop,true);assert.equal(f.sources[1].stopped,undefined);
  assert.equal(f.controls.snapshot().current,1);
});
test('horn music replaces a record, and a record replaces horn music',async()=>{
  const f=fixture();await f.controls.startRecord(0);f.controls.playSong();
  assert.equal(f.controls.snapshot().session,null);assert.equal(f.sources[0].stopped,5.25);
  const horn=f.controls.snapshot().hornSession;assert(horn);
  await f.controls.startRecord(2);
  assert(horn.out.disconnected);assert(horn.timer.cancelled);assert.equal(f.controls.snapshot().playing,false);
  assert.equal(f.sources[1].loop,true);
});
test('a record finishing preparation after another selection cannot start late',async()=>{
  const f=fixture({defer:true});const first=f.controls.startRecord(0);const second=f.controls.startRecord(1);
  f.renders[1].resolve({track:1});await second;f.renders[0].resolve({track:0});await first;
  assert.equal(f.sources.length,1);assert.equal(f.sources[0].buffer.track,1);
});
test('manual stop and new horn music also cancel records still preparing',async()=>{
  for(const stop of ['stopRecord','playSong']){
    const f=fixture({defer:true});const pending=f.controls.startRecord(0);f.controls[stop]();
    f.renders[0].resolve({});await pending;assert.equal(f.sources.length,0);assert.equal(f.controls.snapshot().session,null);
  }
});
test('render failures leave no active record and allow retry',async()=>{
  const f=fixture({defer:true});const pending=f.controls.startRecord(0);f.renders[0].reject(new Error('render failed'));await pending;
  assert.equal(f.controls.snapshot().session,null);
  const retry=f.controls.startRecord(0);f.renders[1].resolve({});await retry;assert.equal(f.sources.length,1);
});
