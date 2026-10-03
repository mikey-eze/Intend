const { connect, openPage } = require('./_cdp.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const target = await openPage(9222, 'about:blank');
  const cdp = await connect(target.webSocketDebuggerUrl);
  const errors=[]; cdp.on(m=>{if(m.method==='Runtime.exceptionThrown'){const d=m.params.exceptionDetails;errors.push(d.exception?.description||d.text)}});
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(7000);
  const ev = async e => { const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  const probe = () => ev('JSON.stringify(window.__saifTestProbe())').then(JSON.parse);
  for(let i=0;i<40;i++){ await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:640,y:400,deltaX:0,deltaY:500}); await sleep(400);
    if(await ev(`getComputedStyle(document.getElementById('game-hud')).display!=='none'`)) break; }
  await sleep(1000);
  console.log('=== wall + tree + house collision, live ===');
  // Sprint north for a long time and watch z over time.
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',code:'ShiftLeft',key:'Shift',windowsVirtualKeyCode:16});
  for(let i=0;i<10;i++){ await sleep(1000); const p=await probe();
    console.log(`  t=${i+1}s z=${p.player.z.toFixed(2)} y=${p.player.y.toFixed(2)} grounded=${p.player.grounded} insideSolid=${p.insideSolid} vx=${p.player.vx.toFixed(2)} vz=${p.player.vz.toFixed(2)}`); }
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',code:'ShiftLeft',key:'Shift',windowsVirtualKeyCode:16});
  await sleep(800);
  const f=await probe();
  console.log(`  FINAL z=${f.player.z.toFixed(2)} y=${f.player.y.toFixed(2)} insideSolid=${f.insideSolid}`);
  console.log(`  ${f.player.z < -21.5 && f.player.z > -22.5 ? 'PASS: reached and pressed against north wall' : (f.player.z > -22 ? 'PASS: blocked inside district (z='+f.player.z.toFixed(2)+')' : 'FAIL: escaped through wall')}`);
  console.log('  errors:', errors.length?errors.join(' | '):'none');
  cdp.close(); process.exit(0);
})().catch(e=>{console.error('DRIVER:',e.message);process.exit(1)});
