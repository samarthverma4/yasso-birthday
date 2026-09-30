const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const html=readFileSync(new URL('../index.html',`file://${__filename}`),'utf8');
const unlock=Date.parse('2026-10-01T00:00:00+05:30');
const timeDeclaration=html.match(/const BIRTHDAY_UNLOCK_AT=.*?;/)[0];
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let photos=scripts.find(s=>s.includes('function syncPhotoGate'));
photos=photos.replace(/const SRC=\[[^\n]+\];/,'const SRC=["photo-one","photo-two"];');
photos=photos.replace(/\}\)\(\);\s*$/,'globalThis.photos={open:openLb,show,sync:syncPhotoGate};})();');
class Element {
  constructor(){this.hidden=false;this.children=[];this.style={setProperty(){}};this.dataset={};this.listeners={};this.isConnected=true;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};}
  set innerHTML(v){this.html=v;this.firstChild={style:{}};}
  get innerHTML(){return this.html||'';}
  setAttribute(){}removeAttribute(){}focus(){}
  addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}
  appendChild(child){this.children.push(child);child.parentElement=this;}
  replaceChildren(){this.children=[];}
}
function setup(now){
  let current=now;const elements=new Map(),timers=[];
  const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  get('ylb').hidden=true;get('ypics').hidden=true;
  const context={Date:class extends Date{static now(){return current;}},document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[],body:new Element(),documentElement:new Element(),addEventListener(){},hidden:false},addEventListener(){},setInterval:fn=>timers.push(fn),setTimeout(){},clearTimeout(){}};
  runInNewContext(timeDeclaration+'\n'+photos,context);
  runInNewContext(readFileSync(new URL('../cake.js',`file://${__filename}`),'utf8'),context);
  context.initBirthdayCake({unlockAt:unlock,reduce:true,puff(){},playSong(){},burst(){},rain(){},pop(){}});
  return {get,photos:context.photos,advance(time){current=time;timers.forEach(fn=>fn());}};
}
test('the configured shared instant is midnight IST and cake preview bypass is removed',()=>{
  const c={Date};runInNewContext(timeDeclaration+'globalThis.value=BIRTHDAY_UNLOCK_AT;',c);
  assert.equal(c.value,unlock);assert(!html.includes('CAKE_PREVIEW'));
  assert.match(html,/const LAP_START=BIRTHDAY_UNLOCK_AT/);
  assert.match(html,/initBirthdayCake\(\{ unlockAt:LAP_START,/);
});
test('one millisecond before midnight photos cannot load/open and cake stays disabled',()=>{
  const f=setup(unlock-1);
  assert(f.get('ypics').hidden);assert.equal(f.get('ypics').children.length,0);assert(!f.get('photo-lock').hidden);
  f.photos.open(0);f.photos.show(1);assert(f.get('ylb').hidden);assert.equal(f.get('ylbImg').src,undefined);
  assert(f.get('startCake').disabled);assert(!f.get('cake-lock').hidden);
  assert(f.get('candles').children.every(slot=>slot.children[0].disabled));
});
test('an already open page unlocks both sections at exactly midnight without duplicate photos',()=>{
  const f=setup(unlock-1);f.advance(unlock);
  assert(!f.get('ypics').hidden);assert.equal(f.get('ypics').children.length,2);assert(f.get('photo-lock').hidden);
  assert(!f.get('startCake').disabled);assert(f.get('cake-lock').hidden);
  f.photos.open(1);assert(!f.get('ylb').hidden);assert.equal(f.get('ylbImg').src,'photo-two');
  f.advance(unlock+250);assert.equal(f.get('ypics').children.length,2);
});
test('fresh visits at midnight and on later dates are unlocked',()=>{
  for(const when of [unlock,unlock+86400000,unlock+31536000000]){
    const f=setup(when);assert(!f.get('ypics').hidden);assert(!f.get('startCake').disabled);
    f.photos.open(0);assert(!f.get('ylb').hidden);
  }
});
test('numbered Yaadein captions are removed from markup and viewer rendering',()=>{
  assert(!html.includes('ylbTag'));assert(!html.includes('Yaadein ✿'));assert(!html.includes('pola-tag'));
});
