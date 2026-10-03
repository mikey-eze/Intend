const { connect, openPage } = require('./_cdp.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const target = await openPage(9222, 'http://127.0.0.1:8123/index.html');
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Page.bringToFront').catch(()=>{});
  await sleep(5000);
  // try requestPointerLock from a real click on the canvas
  await cdp.send('Input.dispatchMouseEvent', {type:'mousePressed',x:640,y:400,button:'left',buttons:1,clickCount:1});
  await cdp.send('Input.dispatchMouseEvent', {type:'mouseReleased',x:640,y:400,button:'left',buttons:0,clickCount:1});
  await sleep(1500);
  const r = await cdp.send('Runtime.evaluate',{expression:`
    JSON.stringify({locked: !!document.pointerLockElement, id: document.pointerLockElement?.id||null, vis: document.visibilityState, focus: document.hasFocus()})`,returnByValue:true});
  console.log('after click:', r.result.value);
  cdp.close(); process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1)});
