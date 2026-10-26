const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createTrustedAppUrl,installWindowSecurity}=require('./security.cjs');
test('packaged trust is limited to the bundled app, not every file URL',()=>{
  const indexPath=path.resolve('dist/index.html'),url=pathToFileURL(indexPath).href,trusted=createTrustedAppUrl({isDev:false,indexPath});
  assert.equal(trusted(url+'#/workspace'),true);
  for(const other of [url+'?remote=1',pathToFileURL(path.resolve('other.html')).href,'https://evil.test', 'file://remote/share/index.html'])assert.equal(trusted(other),false);
});
test('only this app’s top-level frame gets the narrow permission allowlist',()=>{
  const handlers={};const contents={isDestroyed:()=>false,getURL:()=> 'http://localhost:5174/',session:{setPermissionCheckHandler:fn=>handlers.check=fn,setPermissionRequestHandler:fn=>handlers.request=fn},on:(event,fn)=>handlers[event]=fn};
  installWindowSecurity({webContents:contents},{isDev:true});
  const detail={isMainFrame:true,requestingUrl:'http://localhost:5174/'};
  assert.equal(handlers.check(contents,'media','http://localhost:5174',detail),true);
  assert.equal(handlers.check(contents,'media','', {...detail,isMainFrame:false}),false);
  assert.equal(handlers.check(contents,'media','', {...detail,requestingUrl:'https://evil.test'}),false);
  assert.equal(handlers.check({},'media','',detail),false);
  for(const permission of ['geolocation','usb','serial','fileSystem','clipboard-read'])assert.equal(handlers.check(contents,permission,'',detail),false);
  let granted;handlers.request(contents,'media',value=>granted=value,{...detail,isMainFrame:false});assert.equal(granted,false);
  let prevented=false;handlers['will-navigate']({preventDefault:()=>prevented=true},'https://evil.test');assert.equal(prevented,true);
});
