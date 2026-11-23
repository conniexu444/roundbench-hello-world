'use strict';
const field = document.getElementById('greeting');
const sketch = document.getElementById('sketch');
const template = sketch.textContent;
const statusLine = document.getElementById('status');
const canvas = document.getElementById('lcd');
const ctx = canvas.getContext('2d');
let wasm, greeting, x;

function draw() {
  if (!field.reportValidity() || !wasm) return;
  greeting = field.value;
  x = Math.floor((240 - 12 * greeting.length) / 2);
  wasm.sketch_setup();
  wasm.sketch_loop();

  const pixels = new Uint16Array(wasm.memory.buffer, wasm.pixels(), 240 * 240);
  const image = ctx.createImageData(240, 240);
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i], j = 4 * i;
    image.data[j] = (v >> 11) * 255 / 31;
    image.data[j+1] = ((v >> 5) & 63) * 255 / 63;
    image.data[j+2] = (v & 31) * 255 / 31;
    image.data[j+3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  canvas.setAttribute('aria-label', 'Round LCD showing ' + greeting);
  sketch.textContent = template.replace('42, 112', x + ', 112')
    .replace('"Hello, world!"', () => JSON.stringify(greeting));
  statusLine.textContent = 'Sketch ran. Change the greeting and run it again.';
}

field.addEventListener('input', () => {
  field.setCustomValidity(/^[ -~]*$/.test(field.value) ? '' : 'Use printable ASCII characters for this display font.');
});
document.getElementById('controls').addEventListener('submit', event => {
  event.preventDefault();
  draw();
});
(async () => {
  try {
    const response = await fetch('./hello.wasm');
    if (!response.ok) throw Error('Could not load the sketch.');
    const result = await WebAssembly.instantiate(await response.arrayBuffer(), {
      demo: {greetingByte: i => greeting.charCodeAt(i) || 0, cursorX: () => x},
      wasi_snapshot_preview1: {fd_close: () => 8, fd_seek: () => 8, fd_write: () => 8}
    });
    wasm = result.instance.exports;
    wasm._initialize();
    document.getElementById('run').disabled = false;
    draw();
  } catch (error) {
    statusLine.textContent = 'Display unavailable. ' + error.message;
  }
})();
