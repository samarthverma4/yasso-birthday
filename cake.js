/* Keep drag movement in viewport coordinates, outside the cake's 3D transform. */
function createCandleDragController({canDrag, onRemove, onReturn}) {
  let active=null;
  const handledClicks=new WeakSet();
  const TAP_SLOP=6, REMOVE_DISTANCE=40;

  function cancel(){
    const d=active;
    if(!d) return;
    active=null; // Releasing capture may synchronously send lostpointercapture.
    d.ghost?.remove();
    d.button.classList.remove('drag-origin');
    if(d.button.hasPointerCapture(d.id)) d.button.releasePointerCapture(d.id);
  }
  function update(d,e){
    d.dx=e.clientX-d.x; d.dy=e.clientY-d.y;
    d.travel=Math.max(d.travel,Math.hypot(d.dx,d.dy));
    if(d.travel<=TAP_SLOP) return;
    if(!d.ghost){
      const ghost=document.createElement('div');
      ghost.className='candle candle-drag-ghost out';
      ghost.setAttribute('aria-hidden','true');
      const r=d.rect;
      ghost.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background:${d.background}`;
      document.body.appendChild(ghost);
      d.ghost=ghost;
      d.button.classList.add('drag-origin');
    }
    d.ghost.style.transform=`translate(${d.dx}px,${d.dy}px)`;
  }
  function bind(button){
    button.addEventListener('pointerdown',e=>{
      if(!e.isPrimary||e.button!==0||active) return;
      handledClicks.delete(button);
      if(!canDrag()) return;
      e.preventDefault(); // Prevent native selection/drag and delayed touch mouse events.
      handledClicks.add(button);
      button.focus({preventScroll:true});
      active={button,id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,travel:0,
        rect:button.getBoundingClientRect(),background:getComputedStyle(button).background,ghost:null};
      try { button.setPointerCapture(e.pointerId); } catch { cancel(); }
    });
    button.addEventListener('pointermove',e=>{
      if(active?.button!==button||active.id!==e.pointerId) return;
      if(!canDrag()){cancel();return;}
      e.preventDefault(); update(active,e);
    });
    button.addEventListener('pointerup',e=>{
      const d=active;
      if(d?.button!==button||d.id!==e.pointerId) return;
      e.preventDefault();
      update(d,e); // A fast release may arrive without a final pointermove.
      const remove=d.travel<=TAP_SLOP||Math.hypot(d.dx,d.dy)>=REMOVE_DISTANCE;
      cancel();
      if(!canDrag()) return;
      if(remove) onRemove(button); else onReturn();
    });
    const interrupted=e=>{
      if(active?.button===button&&active.id===e.pointerId) cancel();
    };
    button.addEventListener('pointercancel',interrupted);
    button.addEventListener('lostpointercapture',interrupted);
    button.addEventListener('dragstart',e=>e.preventDefault());
  }
  return {
    bind, cancel,
    // Pointer gestures finish on pointerup. Keep their subsequent click from
    // removing a snapped-back candle; keyboard/assistive clicks still work.
    consumesClick:(button,e)=>e.detail!==0&&handledClicks.has(button)
  };
}

/* The birthday gate uses an absolute IST instant, independent of visitor timezone. */
function initBirthdayCake({unlockAt, reduce, puff, playSong, burst, rain, pop}) {
  const $ = id => document.getElementById(id);
  const scene=$('cakeScene'), holder=$('candles'), status=$('status'), start=$('startCake');
  const lock=$('cake-lock'), countdown=$('cake-countdown'), knife=$('cakeKnife');
  const cut=$('cutSlice'), reset=$('relight'), whole=$('cakeWhole'), slice=$('cakeSlice');
  let phase='locked', generation=0, knifeDrag=null;
  const isOpen=()=>Date.now()>=unlockAt;
  const candleDrag=createCandleDragController({
    canDrag:()=>isOpen()&&phase==='remove',
    onRemove:removeCandle,
    onReturn:()=>{status.textContent='Lift the candle a little farther away, or tap it to remove it.';}
  });
  const later=(fn,ms)=>{ const version=generation; setTimeout(()=>{ if(version===generation) fn(); },ms); };

  // Stacked circular surfaces form three tiers; rotating their parent changes the view.
  [
    {size:88,z:5,fill:'#E8261F',accent:'#FFB300'},
    {size:72,z:41,fill:'#1437C9',accent:'#35C7E8'},
    {size:56,z:77,fill:'#FF2E88',accent:'#FFB300'}
  ].forEach((tier,t)=>{
    for(let j=0;j<=10;j++){
      const layer=document.createElement('div');
      layer.className='cake-layer'+(j===10?' icing':'')+(t===2&&j===10?' top-icing':'');
      layer.style.cssText=`--size:${tier.size}%;--z:${tier.z+j*3}px;--fill:${tier.fill};--accent:${tier.accent}`;
      if(t===2&&j===10) layer.innerHTML='<span class="cake-lettering"><small>Happy birthday</small>Yasso Ji ♥</span>';
      whole.appendChild(layer);
    }
  });
  slice.innerHTML=whole.innerHTML;

  function markStep(step){
    const steps=['blow','remove','cut'];
    document.querySelectorAll('[data-step]').forEach(el=>{
      const i=steps.indexOf(el.dataset.step), current=steps.indexOf(step);
      if(el.dataset.step===step) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
      el.classList.toggle('done',phase==='served'||i<current);
    });
  }
  function buildCandles(){
    holder.replaceChildren();
    // Two staggered rows leave enough space for fingers on small screens.
    [[32,43],[44,37],[56,37],[68,43],[37,59],[50,63],[63,59]].forEach(([x,y],i)=>{
      const slot=document.createElement('div'); slot.className='cake-slot';
      slot.style.cssText=`--x:${x}%;--y:${y}%`;
      const b=document.createElement('button'); b.type='button'; b.className='candle'; b.disabled=true;
      b.dataset.number=i+1; b.style.height=(58+(i%3)*6)+'px';
      b.setAttribute('aria-label',`Blow out candle ${i+1}`); b.innerHTML='<span class="flame"></span>';
      b.addEventListener('click',e=>{
        if(candleDrag.consumesClick(b,e)) return;
        if(!isOpen()) return;
        if(phase==='blow') blow(b);
        else if(phase==='remove') removeCandle(b);
      });
      candleDrag.bind(b);
      slot.appendChild(b); holder.appendChild(slot);
    });
  }
  function resetCake(){
    generation++; candleDrag.cancel(); knifeDrag=null;
    phase=isOpen()?'ready':'locked';
    scene.classList.remove('overhead','removing','served'); scene.classList.toggle('is-locked',!isOpen());
    knife.hidden=true; knife.classList.remove('slicing','dragging'); knife.style.transform='';
    cut.hidden=true; cut.disabled=false; reset.hidden=true; start.hidden=false;
    buildCandles(); markStep(null); syncGate();
  }
  function syncGate(){
    if(!isOpen()){
      if(phase!=='locked'){resetCake();return;}
      start.disabled=true; lock.hidden=false;
      const seconds=Math.ceil((unlockAt-Date.now())/1000), h=Math.floor(seconds/3600), m=Math.floor(seconds%3600/60), sec=seconds%60;
      countdown.textContent=[h,m,sec].map(n=>String(n).padStart(2,'0')).join(' : ');
      start.textContent='🔒 Cut the cake with Yashi';
      status.textContent='Saving the first slice for midnight.';
      return;
    }
    lock.hidden=true; scene.classList.remove('is-locked'); start.disabled=false;
    start.textContent='Cut the cake with Yashi';
    if(phase==='locked'||phase==='ready'){
      phase='ready'; status.textContent='It’s birthday time! Ready to make a wish with Yashi?';
    }
  }
  function blow(b){
    if(b.classList.contains('out')) return;
    b.classList.add('out'); b.setAttribute('aria-label',`Candle ${b.dataset.number} blown out`); puff();
    if(!reduce){const smoke=document.createElement('span');smoke.className='smoke';b.appendChild(smoke);later(()=>smoke.remove(),1300);}
    const lit=[...holder.querySelectorAll('.candle:not(.out)')];
    if(lit.length){status.textContent=`${lit.length} ${lit.length===1?'flame':'flames'} to go. Make a wish!`;return;}
    phase='remove'; scene.classList.add('removing'); markStep('remove');
    holder.querySelectorAll('.candle').forEach(c=>c.setAttribute('aria-label',`Remove candle ${c.dataset.number} (drag away or tap)`));
    status.textContent='Wish made! Drag the candles off the cake, or tap each one to remove it.';
    playSong();
  }
  function removeCandle(b){
    if(!isOpen()||phase!=='remove'||!b.isConnected) return;
    const focused=document.activeElement===b;
    b.parentElement.remove();
    const remaining=[...holder.querySelectorAll('.candle')];
    if(remaining.length){
      status.textContent=`${remaining.length} ${remaining.length===1?'candle':'candles'} left to lift off. Drag or tap.`;
      if(focused) remaining[0].focus({preventScroll:true});
      return;
    }
    phase='turning'; scene.classList.remove('removing'); scene.classList.add('overhead'); markStep('cut');
    status.textContent='Candles off. Let’s take a look from above…';
    later(()=>{
      if(!isOpen()) return;
      phase='cut'; knife.hidden=false; cut.hidden=false;
      status.textContent='Drag the knife through the centre, or tap “Cut a slice”.';
      if(focused) cut.focus({preventScroll:true});
    },reduce?0:1200);
  }
  function cutCake(){
    if(!isOpen()||phase!=='cut') return;
    phase='cutting'; cut.disabled=true; knife.style.transform=''; knife.classList.remove('dragging'); knife.classList.add('slicing');
    status.textContent='A birthday slice, with love from Yashi…';
    later(()=>{
      phase='served'; scene.classList.add('served'); knife.hidden=true; cut.hidden=true; reset.hidden=false; markStep('cut');
      status.textContent='The first slice is yours. Happy Birthday, Yasso Ji! ♥';
      pop(); const r=scene.getBoundingClientRect(); burst(r.left+r.width/2,r.top+r.height/2,130); rain(35);
      reset.focus({preventScroll:true});
    },reduce?0:1500);
  }
  start.addEventListener('click',()=>{
    if(!isOpen()||phase!=='ready') return;
    phase='blow'; start.hidden=true; markStep('blow');
    holder.querySelectorAll('.candle').forEach(b=>b.disabled=false);
    status.textContent='Make a wish with Yashi. Tap each flame to blow out all seven.';
    holder.querySelector('.candle').focus({preventScroll:true});
  });
  knife.addEventListener('pointerdown',e=>{
    if(!isOpen()||phase!=='cut'||!e.isPrimary||e.button!==0) return;
    const r=scene.getBoundingClientRect();
    knifeDrag={id:e.pointerId,x:e.clientX,y:e.clientY,prevX:e.clientX,prevY:e.clientY,dx:0,dy:0,crossed:false,r};
    knife.setPointerCapture(e.pointerId); knife.classList.add('dragging');
  });
  knife.addEventListener('pointermove',e=>{
    const d=knifeDrag;if(!d||d.id!==e.pointerId) return;
    d.dx=e.clientX-d.x; d.dy=e.clientY-d.y;
    knife.style.transform=`translate(${d.dx}px,${d.dy}px) rotate(35deg)`;
    // Segment distance also catches fast swipes that skip the centre between events.
    const cx=d.r.left+d.r.width/2,cy=d.r.top+d.r.width/2;
    const vx=e.clientX-d.prevX,vy=e.clientY-d.prevY;
    const t=Math.max(0,Math.min(1,((cx-d.prevX)*vx+(cy-d.prevY)*vy)/(vx*vx+vy*vy||1)));
    if(Math.hypot(d.prevX+t*vx-cx,d.prevY+t*vy-cy)<d.r.width*.18) d.crossed=true;
    d.prevX=e.clientX;d.prevY=e.clientY;
  });
  const endKnife=e=>{
    const d=knifeDrag;if(!d||d.id!==e.pointerId)return;
    knifeDrag=null;knife.classList.remove('dragging');knife.style.transform='';
    if(e.type!=='pointercancel'&&d.crossed&&Math.hypot(d.dx,d.dy)>d.r.width*.2) cutCake();
    else if(e.type!=='pointercancel') status.textContent='Sweep the knife through the middle of the cake, or tap “Cut a slice”.';
  };
  knife.addEventListener('pointerup',endKnife);knife.addEventListener('pointercancel',endKnife);
  cut.addEventListener('click',cutCake);
  reset.addEventListener('click',()=>{resetCake();start.focus({preventScroll:true});});
  document.addEventListener('visibilitychange',()=>{
    candleDrag.cancel(); if(!document.hidden) syncGate();
  });
  addEventListener('blur',candleDrag.cancel);
  addEventListener('resize',candleDrag.cancel);
  addEventListener('scroll',candleDrag.cancel,true);
  $('backTruck').addEventListener('click',candleDrag.cancel);
  addEventListener('bday:page',e=>{candleDrag.cancel();if(e.detail==='cake')syncGate();});
  resetCake();setInterval(syncGate,250);
}
