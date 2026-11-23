'use strict';
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const pendingTouch = [];
let point = 0;
function enqueue(value) {
  const last=pendingTouch.length ? pendingTouch[pendingTouch.length-1] : point;
  if(last===value)return;
  if(pendingTouch.length && (last>>16)===(value>>16))pendingTouch[pendingTouch.length-1]=value;
  else pendingTouch.push(value);
}

async function run(binary) {
  let wasm, suspension, stack, serial='', lastFrame=-Infinity;
  const start=performance.now(), previous=new Uint16Array(240*240), black=previous.slice();
  function frame(force=false, throttle=true) {
    if(!force && throttle && performance.now()-lastFrame<16)return;
    lastFrame=performance.now();
    if(serial){postMessage({serial});serial='';}
    const address=wasm.pixels();
    const pixels=address?new Uint16Array(wasm.memory.buffer,address,240*240):black;
    if(!force && previous.every((v,i)=>v===pixels[i]))return;
    previous.set(pixels);
    const buffer=previous.slice().buffer;
    postMessage({frame:buffer},[buffer]);
  }
  function sleep(ms){
    if(wasm.asyncify_get_state()===2){wasm.asyncify_stop_rewind();return;}
    frame(false, ms<16);
    suspension=ms>>>0;
    wasm.asyncify_start_unwind(stack);
  }
  const bench={
    time:()=>performance.now()-start, touch:()=>{if(pendingTouch.length)point=pendingTouch.shift();return point;},
    serial:b=>{if(serial.length<8192)serial+=String.fromCharCode(b);},sleep
  };
  const wasi={fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8,proc_exit:c=>{throw Error('Sketch exited with code '+c);}};
  // Clang versions differ in how they encode import_name attributes.
  const env={sim_time:bench.time,sim_touch:bench.touch,sim_serial:bench.serial,sim_sleep:sleep};
  const module=await WebAssembly.compile(binary);
  const imports={bench,env,wasi_unstable:wasi,wasi_snapshot_preview1:wasi};
  for(const {name,module:ns} of WebAssembly.Module.imports(module)){
    if(typeof imports[ns]?.[name]!=='function')throw Error('Sketch uses an unavailable function: '+name);
  }
  wasm=(await WebAssembly.instantiate(module,imports)).exports;
  wasm.__wasm_call_ctors();
  if(wasm.asyncify_start_unwind){
    stack=wasm.malloc(65544);
    if(!stack)throw Error('Could not allocate sketch delay stack.');
    new Uint32Array(wasm.memory.buffer,stack,2).set([stack+8,stack+65544]);
  }
  async function invoke(fn) {
    for(;;){
      suspension=null;
      fn();
      if(suspension===null)return;
      wasm.asyncify_stop_unwind();
      await pause(suspension);
      wasm.asyncify_start_rewind(stack);
    }
  }
  postMessage({ready:true});
  await invoke(wasm.sketch_setup);
  frame(true);
  for(;;){await invoke(wasm.sketch_loop);frame();await pause(2);}
}
onmessage=({data})=>{
  if(data.touch!==undefined){enqueue(data.touch);return;}
  run(data.binary).catch(error=>postMessage({error:error.message}));
};
