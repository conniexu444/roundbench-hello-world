'use strict';
importScripts('./compiler/shared.js', './compiler/compile.js');

async function asset(file) {
  const response = await fetch('./compiler/' + file + '.gz');
  if (!response.ok) throw Error('Could not load compiler file: ' + file);
  // Some static servers transparently decode .gz resources.
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

onmessage = async ({data:source}) => {
  let diagnostics = '';
  try {
    const modules = new Map();
    function load(name) {
      if (!modules.has(name)) modules.set(name, asset(name).then(bytes => WebAssembly.compile(bytes)));
      return modules.get(name);
    }
    const api = new API({readBuffer:asset, compileStreaming:load, hostWrite:text=>{diagnostics=(diagnostics+text).slice(-24000);}});
    api.hostLog = () => {};
    // Parallel loading makes the first edit faster; subsequent runs use the browser cache.
    const [support] = await Promise.all([
      fetch('./compiler/support.json').then(r=>{if(!r.ok)throw Error('Could not load display support.');return r.json();}),
      api.ready, load('clang'), load('lld')
    ]);
    for (const [name,text] of Object.entries(support.headers)) api.memfs.addFile(name,new TextEncoder().encode(text));
    for (const [name,base64] of Object.entries(support.objects)) api.memfs.addFile(name,Uint8Array.from(atob(base64),c=>c.charCodeAt(0)));
    diagnostics='';
    await compileObject(api,'sketch.ino',source,'sketch.o');
    let binary = await linkSketch(api);
    const imports = WebAssembly.Module.imports(await WebAssembly.compile(binary));
    if (imports.some(i=>i.name==='sleep'||i.name==='sim_sleep')) {
      const binaryen = (await import('./compiler/binaryen.mjs')).default;
      const program = binaryen.readBinary(binary);
      try {
        binaryen.setPassArgument('asyncify-imports',imports.filter(i=>i.name==='sleep'||i.name==='sim_sleep').map(i=>i.module+'.'+i.name).join(','));
        program.runPasses(['asyncify']);
        binary=program.emitBinary();
      } finally {program.dispose();}
    }
    postMessage({binary:binary.buffer},[binary.buffer]);
  } catch(error) {
    postMessage({error:diagnostics.replace(/\x1b\[[0-9;]*m/g,'').trim() || error.message});
  }
};
