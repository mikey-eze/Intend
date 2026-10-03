const {connect,fetchJson,newTab}=require('./_cdp.js');
(async()=>{
  const tab=await new URL('http://127.0.0.1:8123/index.html');
  const t=await fetch('http://127.0.0.1:9222/json/new?http://127.0.0.1:8123/index.html',{method:'PUT'}).then(r=>r.json());
  const ws=await new Promise((res,rej)=>{
    const c=require('ws');
    const w=new c(`ws://127.0.0.1:9222/devtools/page/${t.id}`);
    w.on('open',()=>res(w)); w.on('error',rej);
  });
  let id=1; const pending={};
  ws.on('message',m=>{const o=JSON.parse(m); if(o.id&&pending[o.id]){(o.error?pending[o.id].rej:pending[o.id].res)(o.result||o.error); delete pending[o.id]} else if(o.method==='Log.entryAdded'){console.log('LOG:',o.params.entry.level,o.params.entry.text);}});
  const send=(m,params={})=>new Promise((res,rej)=>{pending[++id]={res,rej}; ws.send(JSON.stringify({id:id,method:m,params}))});
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.reload',{ignoreCache:true});

  await new Promise(r=>setTimeout(r,3000));
  // capture console messages after reload
  await send('Page.captureScreenshot',{format:'png'}).catch(e=>{});
  // scroll journey: simulate 5 steps (simulate scrollY increase) then evaluate
  await new Promise(r=>setTimeout(r,1000));
  await send('Runtime.evaluate',{expression:'({s:window.scrollY,sh:document.documentElement.scrollHeight,journey:document.querySelector(".earth")?getComputedStyle(document.querySelector(".earth")).opacity:null,worldOp:document.getElementById("voxel-world")?getComputedStyle(document.getElementById("voxel-world")).opacity:null})',returnByValue:true});
})();
