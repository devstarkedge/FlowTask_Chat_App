const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const source=transformSync(fs.readFileSync(path.join(__dirname,'../src/utils/secureStorage.js'),'utf8'),{loader:'js',format:'cjs'}).code;
function load(platform,secureStore){
  const calls=[],plain={getItem:async key=>{calls.push(['get',key]);return 'plain-token';},setItem:async(...args)=>calls.push(['set',...args]),removeItem:async key=>calls.push(['remove',key])};
  const module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,require:name=>{
    if(name==='react-native')return {Platform:{OS:platform}};
    if(name==='@react-native-async-storage/async-storage')return plain;
    if(name==='expo-secure-store'){if(!secureStore)throw new Error('missing native module');return secureStore;}
    throw new Error(name);
  }});
  return {...module.exports,calls};
}
(async()=>{
  for(const platform of ['ios','android']){
    const missing=load(platform,null);
    await assert.rejects(missing.secureSet('token','secret'),/Secure storage is unavailable/);
    await assert.rejects(missing.secureGet('token'),/Secure storage is unavailable/);
    await assert.rejects(missing.secureDelete('token'),/Secure storage is unavailable/);
    assert.deepEqual(missing.calls,[]);
    const secureCalls=[],secure={WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device',setItemAsync:async(...args)=>secureCalls.push(['set',...args]),getItemAsync:async()=> 'secure-token',deleteItemAsync:async(...args)=>secureCalls.push(['delete',...args])};
    const native=load(platform,secure);await native.secureSet('token','secret');assert.equal(await native.secureGet('token'),'secure-token');await native.secureDelete('token');
    assert.equal(native.calls.every(call=>call[0]==='remove'),true);assert.equal(secureCalls[0][3].keychainAccessible,'device');
    secure.getItemAsync=async()=>{throw new Error('locked');};await assert.rejects(native.secureGet('token'),/locked/);
    console.log(`PASS ${platform}: native credentials fail closed, old plaintext keys removed, no fallback reads or writes`);
  }
  const web=load('web');await web.secureSet('token','value');assert.equal(await web.secureGet('token'),'plain-token');await web.secureDelete('token');assert.deepEqual(web.calls.map(call=>call[0]),['set','get','remove']);
  console.log('PASS web: existing browser storage behavior preserved');
})().catch(error=>{console.error(error);process.exitCode=1;});
