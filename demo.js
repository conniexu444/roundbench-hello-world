'use strict';
const el=id=>document.getElementById(id);
const editor=el('sketch'), original=editor.defaultValue, statusLine=el('status');
const canvas=el('lcd'), ctx=canvas.getContext('2d'), image=ctx.createImageData(240,240);
const draftKey='roundbench.public.sketch.v1';
let compiler, runner, generation=0, activePointer=null;
try {editor.value=localStorage.getItem(draftKey) ?? original;}catch{}

function status(text, error=false){statusLine.textContent=text;statusLine.toggleAttribute('data-error',error);}
function save(){try{localStorage.setItem(draftKey,editor.value);}catch{}}
function halt(){
  generation++;
  compiler?.terminate(); runner?.terminate();
  compiler=runner=null;
  el('stop').disabled=true; activePointer=null;
}
function paint(buffer){
  const pixels=new Uint16Array(buffer);
  for(let i=0;i<pixels.length;i++){
    const v=pixels[i],j=i*4;
    image.data[j]=(v>>11)*255/31;image.data[j+1]=((v>>5)&63)*255/63;
    image.data[j+2]=(v&31)*255/31;image.data[j+3]=255;
  }
  ctx.putImageData(image,0,0);
}
async function start(){
  halt();
  const id=generation,source=editor.value,log=el('log');
  log.textContent='';ctx.clearRect(0,0,240,240);
  el('stop').disabled=false;
  const fail=message=>{
    if(id!==generation)return;
    halt();status('Check the console for details.',true);
    log.textContent=message;
  };
  function execute(binary){
    if(id!==generation)return;
    runner=new Worker('./sketch-worker.js');
    runner.onerror=e=>fail(e.message);
    runner.onmessage=({data})=>{
      if(id!==generation)return;
      if(data.ready)status(editor.value===source?'Running.':'Running the previous edit. Select Run sketch to apply changes.');
      if(data.frame)paint(data.frame);
      if(data.serial){log.textContent=(log.textContent+data.serial).slice(-24000);log.scrollTop=log.scrollHeight;}
      if(data.error)fail(data.error);
    };
    runner.postMessage({binary},[binary]);
  }
  try{
    if(source===original){
      status('Starting example…');
      const response=await fetch('./hello.wasm?v=editor1');
      if(!response.ok)throw Error('Could not load the example.');
      execute(await response.arrayBuffer());
    }else{
      status('Compiling C++ in your browser. The first run downloads the compiler…');
      compiler=new Worker('./compiler-worker.js');
      compiler.onerror=e=>fail(e.message);
      compiler.onmessage=({data})=>{
        if(id!==generation)return;
        if(data.error){fail(data.error);return;}
        compiler.terminate();compiler=null;execute(data.binary);
      };
      compiler.postMessage(source);
    }
  }catch(error){fail(error.message);}
}
editor.oninput=()=>{save();status('Edited. Select Run sketch to apply changes.');};
editor.onkeydown=e=>{
  if(e.key==='Tab' && !e.shiftKey){e.preventDefault();editor.setRangeText('  ',editor.selectionStart,editor.selectionEnd,'end');editor.oninput();}
};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();start();}});
el('run').onclick=start;
el('stop').onclick=()=>{halt();status('Stopped.');};
el('reset').onclick=()=>{
  if(editor.value!==original && !confirm('Replace your edits with the Hello World example?'))return;
  editor.value=original;save();start();
};
function touch(e, down){
  const rect=canvas.getBoundingClientRect();
  const x=Math.floor(240*(e.clientX-rect.left-canvas.clientLeft)/canvas.clientWidth);
  const y=Math.floor(240*(e.clientY-rect.top-canvas.clientTop)/canvas.clientHeight);
  const pressed=down && Math.hypot(x-119.5,y-119.5)<=120;
  runner?.postMessage({touch:(Number(pressed)<<16)|(Math.max(0,Math.min(239,x))<<8)|Math.max(0,Math.min(239,y))});
}
canvas.onpointerdown=e=>{if(e.isPrimary){activePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);touch(e,true);}};
canvas.onpointermove=e=>{if(e.pointerId===activePointer)touch(e,true);};
canvas.onpointerup=canvas.onlostpointercapture=canvas.onpointercancel=e=>{
  if(e.pointerId===activePointer){activePointer=null;touch(e,false);}
};
if(editor.value===original)start();else status('Draft restored. Select Run sketch to compile.');
