const { connect, openPage } = require('./_cdp.js');
const fs=require('fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const t=await openPage(9222,'about:blank');
  const cdp=await connect(t.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const shot=async n=>{const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('_shot_'+n+'.png',Buffer.from(r.data,'base64'));console.log('  saved _shot_'+n+'.png');};
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(8000);
  console.log('capturing journey:'); await shot('1_space');
  for(let i=0;i<3;i++){await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:640,y:400,deltaX:0,deltaY:500});await sleep(900);} await sleep(2500); await shot('2_galaxy');
  for(let i=0;i<4;i++){await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:640,y:400,deltaX:0,deltaY:500});await sleep(900);} await sleep(2500); await shot('3_earth_far');
  for(let i=0;i<3;i++){await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:640,y:400,deltaX:0,deltaY:500});await sleep(900);} await sleep(2500); await shot('4_earth_near');
  for(let i=0;i<20;i++){await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:640,y:400,deltaX:0,deltaY:500});await sleep(600);
    const r=await cdp.send('Runtime.evaluate',{expression:`getComputedStyle(document.getElementById('game-hud')).display!=='none'`,returnByValue:true}); if(r.result.value)break;}
  await sleep(2500); await shot('5_world');
  console.log('done'); cdp.close(); process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1)});
