const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const React = require('react');
const filename = path.resolve(__dirname, '../src/components/common/AppVideo.jsx');
let state = [], cursor = 0, statusListener;
const statuses = [];
const player = { isPlaying: false, currentTime: 0, duration: 12, pause() {}, play() {},
  addListener: (name, listener) => { assert.equal(name, 'statusChange'); statusListener = listener; return { remove() {} }; } };
const mocks = {
  react: { ...React, useRef: () => ({ current: null }), useEffect: effect => effect(),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; } },
  'react-native': { Platform: { OS: 'ios' }, View: 'View', Image: 'Image', StyleSheet: { flatten: x => x } },
  'expo-video': { VideoView: 'VideoView', useVideoPlayer: () => player },
};
const mod = new Module(filename, module);
mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
const requireOriginal = mod.require.bind(mod);
mod.require = name => mocks[name] || requireOriginal(name);
mod._compile(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, filename);
const props = { sourceUri: 'https://cdn.example/clip.mp4', posterUri: 'https://cdn.example/clip.jpg',
  style: { width: 220, height: 390 }, shouldPlay: false, onStatusChange: value => statuses.push(value) };
function render(extra = {}) { cursor = 0; const element = mod.exports.default({ ...props, ...extra }); return element.type(element.props); }
function children(tree) { return React.Children.toArray(tree.props.children); }
let tree = render();
assert.deepEqual(tree.props.style, props.style);
let nodes = children(tree);
const video = nodes.find(node => node.type === 'VideoView');
assert.equal(video.props.style.position, 'absolute'); assert.equal(video.props.style.bottom, 0);
assert.equal(nodes.find(node => node.type === 'Image').props.source.uri, props.posterUri);
statusListener({ status: 'readyToPlay' }); assert.equal(statuses.at(-1).isLoaded, true);
statusListener({ status: 'error', error: { message: 'Cannot load video' } }); assert.equal(statuses.at(-1).error, 'Cannot load video');
video.props.onFirstFrameRender();
assert.equal(children(render()).some(node => node.type === 'Image'), false, 'Poster disappears only after an actual rendered frame');
assert.equal(children(render({ sourceUri: 'https://cdn.example/next.mp4' })).some(node => node.type === 'Image'), true, 'A reused row shows its poster for a new video');
assert.equal(children(render({ sourceUri: props.posterUri })).some(node => node.type === 'Image'), false, 'A video URL used as a fallback thumbnail is not loaded as an image');
console.log('PASS: native video fills preview; real poster shown until first frame; recycled sources reset cover; status/error payload handled');
