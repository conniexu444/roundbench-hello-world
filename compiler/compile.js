// Shared by the local support-library builder and the in-browser compiler.
async function compileObject(api, input, text, output) {
  const clang = await api.getModule('clang');
  api.memfs.addFile(input, new TextEncoder().encode(text));
  await api.run(clang, 'clang', '-cc1', '-emit-obj', '-triple', 'wasm32-unknown-wasi',
    ...api.clangCommonArgs.filter(flag => flag !== '-fcolor-diagnostics'),
    '-std=c++17', '-DARDUINO=10819', '-I.', '-include', 'Arduino.h',
    '-O1', '-o', output, '-x', 'c++', input);
}

async function linkSketch(api) {
  const linker = await api.getModule('lld');
  await api.run(linker, 'wasm-ld', '--no-threads', '--no-entry', '--allow-undefined',
    '--export=__wasm_call_ctors', '--export=sketch_setup', '--export=sketch_loop',
    '--export=pixels', '--export=malloc', '--strip-all', '-z', 'stack-size=1048576',
    'sketch.o', 'runtime.o', 'gfx.o', '-Llib/wasm32-wasi', '-lc++', '-lc++abi', '-lc',
    'lib/clang/8.0.1/lib/wasi/libclang_rt.builtins-wasm32.a', '-o', 'sketch.wasm');
  return api.memfs.getFileContents('sketch.wasm').slice();
}
