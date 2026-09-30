const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');

// A minimal event/DOM fixture lets us test interrupted pointer sequences,
// including delayed compatibility clicks, without a browser dependency.
class Element {
  constructor(){this.listeners={};this.style={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};this.captured=null;}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(type,values={}){
    const e={type,pointerId:1,isPrimary:true,button:0,clientX:130,clientY:230,detail:1,preventDefault(){this.defaultPrevented=true;},...values};
    for(const fn of this.listeners[type]||[])fn(e);
    return e;
  }
  setAttribute(){}
  focus(){}
  getBoundingClientRect(){return {left:120,top:200,width:23,height:72};}
  setPointerCapture(id){this.captured=id;}
  hasPointerCapture(id){return this.captured===id;}
  releasePointerCapture(id){this.captured=null;this.emit('lostpointercapture',{pointerId:id});}
  remove(){this.removed=true;}
}
function fixture(){
  const ghosts=[],removed=[];let returned=0,enabled=true;
  const context={document:{createElement:()=>new Element(),body:{appendChild:g=>ghosts.push(g)}},getComputedStyle:()=>({background:'pink'})};
  runInNewContext(readFileSync(new URL('../cake.js',`file://${__filename}`),'utf8'),context);
  const controller=context.createCandleDragController({canDrag:()=>enabled,onRemove:b=>removed.push(b),onReturn:()=>returned++});
  const button=new Element();controller.bind(button);
  return {button,controller,ghosts,removed,get returned(){return returned;},disable(){enabled=false;}};
}
for(const pointerType of ['mouse','touch','pen']){
  test(`${pointerType}: candle follows the pointer in screen pixels, then removes once`,()=>{
    const f=fixture(),b=f.button;
    b.emit('pointerdown',{pointerType});b.emit('pointermove',{pointerType,clientX:210,clientY:150});
    assert.equal(f.ghosts.length,1);
    assert.match(f.ghosts[0].style.cssText,/left:120px;top:200px;width:23px;height:72px/);
    assert.equal(f.ghosts[0].style.transform,'translate(80px,-80px)');
    assert(b.classes.has('drag-origin'));
    assert.equal(b.style.transform,undefined); // Original remains in its 3D slot.
    b.emit('pointerup',{pointerType,clientX:210,clientY:150});
    assert.deepEqual(f.removed,[b]);assert(f.ghosts[0].removed);assert(!b.classes.has('drag-origin'));
    assert(f.controller.consumesClick(b,{detail:1}));
    b.emit('pointerup',{pointerType});assert.equal(f.removed.length,1);
  });
}
test('short drags return safely and suppress even a delayed follow-up click',async()=>{
  const f=fixture();f.button.emit('pointerdown');f.button.emit('pointermove',{clientX:150});f.button.emit('pointerup',{clientX:150});
  assert.equal(f.returned,1);assert.equal(f.removed.length,0);assert(f.ghosts[0].removed);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert(f.controller.consumesClick(f.button,{detail:1}));
  assert(!f.controller.consumesClick(f.button,{detail:0})); // Keyboard remains available.
  f.button.emit('pointerdown');f.button.emit('pointerup');assert.equal(f.removed.length,1);
});
test('moving away and back is a cancelled drag, not a tap',()=>{
  const f=fixture();f.button.emit('pointerdown');f.button.emit('pointermove',{clientX:240});f.button.emit('pointerup');
  assert.equal(f.removed.length,0);assert.equal(f.returned,1);
});
for(const event of ['pointercancel','lostpointercapture']){
  test(`${event} restores the original and clears the floating candle`,()=>{
    const f=fixture();f.button.emit('pointerdown');f.button.emit('pointermove',{clientX:240});f.button.emit(event);
    assert(f.ghosts[0].removed);assert(!f.button.classes.has('drag-origin'));assert.equal(f.removed.length,0);
    f.button.emit('pointerup',{clientX:240});assert.equal(f.removed.length,0);
    f.button.emit('pointerdown');f.button.emit('pointerup');assert.equal(f.removed.length,1);
  });
}
test('navigation/reset cancels an active drag without removing a candle',()=>{
  const f=fixture();f.button.emit('pointerdown');f.button.emit('pointermove',{clientX:240});f.controller.cancel();
  assert(f.ghosts[0].removed);assert.equal(f.button.captured,null);f.button.emit('pointerup',{clientX:240});assert.equal(f.removed.length,0);
});
test('fast release uses its final coordinates even without a move event',()=>{
  const f=fixture();f.button.emit('pointerdown');f.button.emit('pointerup',{clientX:230});assert.equal(f.removed.length,1);
});
test('tap is handled once, despite its subsequent native click',()=>{
  const f=fixture();f.button.emit('pointerdown',{pointerType:'touch'});f.button.emit('pointerup',{clientX:132,clientY:233});
  assert.equal(f.removed.length,1);assert.equal(f.ghosts.length,0);assert(f.controller.consumesClick(f.button,{detail:1}));
});
test('secondary pointers cannot steal a drag; a changed gate cancels it',()=>{
  const f=fixture();f.button.emit('pointerdown');f.button.emit('pointermove',{pointerId:2,clientX:240});assert.equal(f.ghosts.length,0);
  f.button.emit('pointermove',{clientX:240});f.disable();f.button.emit('pointermove',{clientX:250});
  assert(f.ghosts[0].removed);assert.equal(f.removed.length,0);
});
