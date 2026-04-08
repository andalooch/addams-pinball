'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const W=400,H=700,BALL_R=9,GRAVITY=0.28;
const WALL_L=22,WALL_R=378,LANE_X=346;
const BALL_SAVE_FRAMES=210,TILT_THRESH=7,TILT_MAX=3,TILT_LOCK=300,KB_NEEDED=8;
const RAMP_SPEED=0.014;        // bezier t increment per frame (~70 frames = ~1.1s)
const RAMP_MIN_VY=-8;          // ball must be rising this fast to enter ramp

// ── Bezier helpers ────────────────────────────────────────────────────────────
type P=[number,number];
function bez(p0:P,p1:P,p2:P,p3:P,t:number){
  const m=1-t;
  return{x:m*m*m*p0[0]+3*m*m*t*p1[0]+3*m*t*t*p2[0]+t*t*t*p3[0],
         y:m*m*m*p0[1]+3*m*m*t*p1[1]+3*m*t*t*p2[1]+t*t*t*p3[1]};
}
function drawBez(ctx:CanvasRenderingContext2D,p0:P,p1:P,p2:P,p3:P){
  ctx.beginPath();ctx.moveTo(p0[0],p0[1]);
  ctx.bezierCurveTo(p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]);ctx.stroke();
}

// ── Table geometry ────────────────────────────────────────────────────────────
// Flippers
const FL={px:125,py:624,len:70,downA:0.50,upA:-0.46};
const FR={px:275,py:624,len:70,downA:Math.PI-0.50,upA:Math.PI+0.46};

// Slingshots
const SLINGS:P[][] = [[WALL_L,368,WALL_L+58,502],[WALL_R,368,WALL_R-58,502]] as any;

// Lane guides (wall segments)
// Left:  outlane = x < 68 | inlane = 68–102 | playfield = 102+
// Right: playfield = 298– | inlane = 298–332 | outlane = 332–346
const L_OUT:P[]=[68,550,68,648] as any;
const L_IN:P[]=[102,536,102,640] as any;
const R_IN:P[]=[298,536,298,640] as any;
const R_OUT:P[]=[332,550,332,648] as any;

// Diagonal connectors sling→guide
const L_TRANS:P[]=[WALL_L+58,502,68,550] as any;
const R_TRANS:P[]=[WALL_R-58,502,332,550] as any;
const L_ITRANS:P[]=[68,550,102,536] as any;
const R_ITRANS:P[]=[332,550,298,536] as any;

// Ramps  (left ramp goes up left side then across top; right mirrors)
const LRAMP_PATH:P[]=[[62,395],[34,230],[30,82],[148,54]];
const RRAMP_PATH:P[]=[[338,395],[366,230],[370,82],[252,54]];
// Left ramp guard wall (inner wall of ramp channel)
const LRAMP_GUARD:P[]=[62,502,58,310] as any;
const RRAMP_GUARD:P[]=[338,502,342,310] as any;

// Bumpers (3 – tight cluster)
const BUMPERS=[
  {x:156,y:230,r:24,pts:100,label:'⚡'},
  {x:244,y:230,r:24,pts:100,label:'⚡'},
  {x:200,y:196,r:24,pts:100,label:'☠'},
];

// GOMEZ standup targets
const TARGETS_DEF=[
  {x:74,y:158,r:11,pts:25,char:'G'},
  {x:108,y:140,r:11,pts:25,char:'O'},
  {x:144,y:126,r:11,pts:25,char:'M'},
  {x:256,y:126,r:11,pts:25,char:'E'},
  {x:292,y:140,r:11,pts:25,char:'Z'},
  {x:326,y:158,r:11,pts:25,char:'?'},
];

// THING – multiball target
const THING={x:200,y:396,r:18,pts:250};

// ── Interactive toys ──────────────────────────────────────────────────────────
const MAGNET={x:200,y:282,range:58,captureR:13,strength:0.55,captureFrames:100,cooldownFrames:320,jackpot:1000};
const CHAND={pivotX:200,pivotY:42,length:72,maxAngle:0.44,naturalSpeed:0.011};

// Drop target bank (4 targets, horizontal across mid-table)
const DROPS_DEF=[
  {x:140,y:328,w:30,h:10,pts:75,down:false,flash:0},
  {x:174,y:328,w:30,h:10,pts:75,down:false,flash:0},
  {x:208,y:328,w:30,h:10,pts:75,down:false,flash:0},
  {x:242,y:328,w:30,h:10,pts:75,down:false,flash:0},
];

// Spinner (vertical gate at center – scores each half-revolution)
const SPINNER={x:200,y:360,len:22};

// Top rollover lanes (3 sensors at top)
const TOP_LANES_DEF=[
  {cx:104,cy:56,r:13,lit:false,pts:50,flash:0},
  {cx:200,cy:56,r:13,lit:false,pts:50,flash:0},
  {cx:296,cy:56,r:13,lit:false,pts:50,flash:0},
];

// Orbit sensors (ball zooming around the outer perimeter)
const LORBIT={cx:WALL_L+14,cy:72,r:14,pts:300,flash:0};
const RORBIT={cx:WALL_R-14,cy:72,r:14,pts:300,flash:0};

// Kickback zone
const KB_ZONE={xMax:WALL_L+40,yMin:552};

// ── Music ─────────────────────────────────────────────────────────────────────
const BPM=140,STEP=60/BPM/4,_=0;
const BASS=[82.4,_,82.4,_,123.5,_,123.5,_,98,_,98,_,110,_,123.5,_,82.4,_,82.4,_,146.8,_,146.8,_,164.8,_,146.8,_,123.5,_,_,_];
const LEAD=[_,329.6,_,293.7,_,246.9,_,196,_,329.6,_,392,246.9,_,_,_,_,293.7,_,246.9,_,196,_,164.8,_,220,_,261.6,246.9,_,_,_];
const CHORD_S=new Set([0,8,16,24]);
const SNAP=[_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1];

function vibe(p:number|number[]){if(navigator?.vibrate)navigator.vibrate(p as any);}

// ── Audio engine ──────────────────────────────────────────────────────────────
function buildAudio(){
  const ac=new AudioContext();
  const master=ac.createGain();master.gain.value=0.7;
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=5;
  comp.connect(master);master.connect(ac.destination);
  const mG=ac.createGain();mG.gain.value=0.40;mG.connect(comp);
  const sG=ac.createGain();sG.gain.value=1.0;sG.connect(comp);

  function osc(d:any,type:any,f:number,v:number,dur:number,fE?:number,t=ac.currentTime){
    const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(d);
    o.type=type;o.frequency.setValueAtTime(f,t);
    if(fE)o.frequency.exponentialRampToValueAtTime(fE,t+dur*0.85);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t);o.stop(t+dur);
  }
  function nz(d:any,v:number,dur:number,fHz=800,Q=1,t=ac.currentTime){
    const len=Math.ceil(ac.sampleRate*dur),buf=ac.createBuffer(1,len,ac.sampleRate);
    const da=buf.getChannelData(0);for(let i=0;i<len;i++)da[i]=(Math.random()*2-1)*Math.pow(1-i/len,2);
    const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
    s.buffer=buf;f.type='bandpass';f.frequency.value=fHz;f.Q.value=Q;
    s.connect(f);f.connect(g);g.connect(d);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.start(t);s.stop(t+dur);
  }
  function pB(f:number,t:number){osc(mG,'sine',f,0.55,STEP*3.5,f*0.95,t);osc(mG,'triangle',f*2,0.14,STEP*2,undefined,t);}
  function pL(f:number,t:number){
    const o=ac.createOscillator(),lp=ac.createBiquadFilter(),g=ac.createGain();
    o.connect(lp);lp.connect(g);g.connect(mG);o.type='sawtooth';o.frequency.setValueAtTime(f,t);
    lp.type='lowpass';lp.frequency.value=1800;lp.Q.value=3;
    g.gain.setValueAtTime(0.2,t);g.gain.setTargetAtTime(0.0001,t+STEP*0.1,STEP*0.6);
    o.start(t);o.stop(t+STEP*1.5);osc(mG,'sine',f*2,0.04,STEP*1.2,undefined,t);
  }
  function pC(t:number){[[82.4*2,0.18],[196,0.14],[246.9,0.13],[329.6,0.1]].forEach(([f,v])=>osc(mG,'sine',f,v,STEP*4,f*0.99,t));}
  function pSn(t:number){nz(mG,0.18,0.03,2200,0.4,t);nz(mG,0.07,0.02,800,0.3,t);}
  let ss=0,nt=0,st:any=null,ip=false;
  function sched(){
    while(nt<ac.currentTime+0.12){const s=ss%BASS.length;if(BASS[s])pB(BASS[s],nt);if(LEAD[s])pL(LEAD[s],nt);if(CHORD_S.has(s))pC(nt);if(SNAP[s])pSn(nt);ss++;nt+=STEP;}
    st=setTimeout(sched,40);
  }
  const sfx={
    bumper(p:number,c:number){const f=p>=100?500:360,b=c>=5?1.5:c>=3?1.25:1;osc(sG,'square',f*b,0.35,0.12,f*b*0.4);nz(sG,0.15,0.06,700,2);},
    sling(){osc(sG,'sawtooth',340,0.3,0.09,85);nz(sG,0.2,0.06,1300,0.8);},
    target(){osc(sG,'sine',1047,0.28,0.35,880);osc(sG,'sine',1319,0.12,0.25,1047,ac.currentTime+0.02);},
    bonus(){[523,659,784,1047,1319].forEach((f,i)=>osc(sG,'square',f,0.2,0.22,f*0.9,ac.currentTime+i*0.07));},
    flipper(){nz(sG,0.28,0.04,220,0.6);osc(sG,'sine',130,0.2,0.06,80);},
    launch(p:number){const b=90+p*280;osc(sG,'sine',b*0.4,0.5,0.05,b*1.1);osc(sG,'triangle',b,0.35,0.28,b*0.25);nz(sG,0.2,0.12,400,1.5);},
    wall(){nz(sG,0.1,0.04,500,0.5);osc(sG,'sine',180,0.07,0.04,120);},
    drain(){osc(sG,'sawtooth',380,0.35,0.7,70);osc(sG,'sine',220,0.2,0.6,60,ac.currentTime+0.05);},
    gameover(){[350,260,180,120].forEach((f,i)=>osc(sG,'sawtooth',f,0.28,0.4,f*0.7,ac.currentTime+i*0.18));},
    thing(){[300,400,500,700,1000].forEach((f,i)=>osc(sG,'square',f,0.25,0.18,f*1.2,ac.currentTime+i*0.04));nz(sG,0.3,0.2,600,2);},
    ballsave(){osc(sG,'sine',880,0.3,0.12,1047);osc(sG,'sine',1047,0.2,0.1,880,ac.currentTime+0.12);},
    kickback(){osc(sG,'square',200,0.4,0.08,600);nz(sG,0.35,0.1,800,1.5);},
    tiltWarn(){osc(sG,'sawtooth',150,0.3,0.15,100);},
    tilt(){[200,150,100].forEach((f,i)=>osc(sG,'sawtooth',f,0.4,0.3,f*0.6,ac.currentTime+i*0.12));},
    multiball(){[262,330,392,523].forEach((f,i)=>osc(sG,'square',f,0.25,0.3,f,ac.currentTime+i*0.08));},
    kbRecharge(){osc(sG,'sine',660,0.2,0.2,880);osc(sG,'sine',880,0.15,0.15,1047,ac.currentTime+0.1);},
    // New SFX
    ramp(side:'left'|'right'){const b=side==='left'?1:1.2;[400,600,900].forEach((f,i)=>osc(sG,'square',f*b,0.22,0.2,f*b*1.1,ac.currentTime+i*0.06));},
    drop(){osc(sG,'square',220,0.3,0.08,110);nz(sG,0.2,0.05,400,1);},
    dropComplete(){[300,450,600,900].forEach((f,i)=>osc(sG,'square',f,0.2,0.15,f*1.1,ac.currentTime+i*0.055));},
    spin(){nz(sG,0.1,0.03,1500,0.5);osc(sG,'sine',800,0.08,0.04,400);},
    topLane(){osc(sG,'sine',660,0.2,0.15,880);},
    topLaneAll(){[523,659,784,1047].forEach((f,i)=>osc(sG,'sine',f,0.2,0.25,f,ac.currentTime+i*0.06));},
    orbit(){[800,1000,1200].forEach((f,i)=>osc(sG,'sine',f,0.2,0.2,f*1.1,ac.currentTime+i*0.05));},
    magnetCapture(){osc(sG,'sine',60,0.5,0.8,40);nz(sG,0.2,0.3,200,0.5);[300,200,100].forEach((f,i)=>osc(sG,'sine',f,0.15,0.4,f*0.6,ac.currentTime+i*0.08));},
    magnetRelease(){[200,400,600,1000,1400].forEach((f,i)=>osc(sG,'square',f,0.22,0.25,f*1.1,ac.currentTime+i*0.055));osc(sG,'sine',1200,0.3,0.5,2000,ac.currentTime+0.3);},
    chandHit(){osc(sG,'sine',880,0.25,0.35,660);osc(sG,'sine',1320,0.15,0.25,1100,ac.currentTime+0.02);nz(sG,0.08,0.05,3000,0.3);},
  };
  return{
    ac,master,
    startMusic(){if(ip)return;ip=true;nt=ac.currentTime+0.1;ss=0;sched();},
    stopMusic(){ip=false;clearTimeout(st);},
    get isPlaying(){return ip;},
    ...sfx,
  };
}

// ── Physics helpers ───────────────────────────────────────────────────────────
function fpEnd(f:any,a:number){return{x:f.px+Math.cos(a)*f.len,y:f.py+Math.sin(a)*f.len};}
function closestOnSeg(ax:number,ay:number,bx:number,by:number,px:number,py:number){
  const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
  if(!l2)return{x:ax,y:ay};
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2));
  return{x:ax+t*dx,y:ay+t*dy};
}
function reflectSeg(ball:any,ax:number,ay:number,bx:number,by:number,boost=1){
  const cp=closestOnSeg(ax,ay,bx,by,ball.x,ball.y);
  const dx=ball.x-cp.x,dy=ball.y-cp.y,dist=Math.sqrt(dx*dx+dy*dy),min=BALL_R+3;
  if(dist<min&&dist>0){
    const nx=dx/dist,ny=dy/dist;
    ball.x=cp.x+nx*(min+0.5);ball.y=cp.y+ny*(min+0.5);
    const dot=ball.vx*nx+ball.vy*ny;
    if(dot<0){ball.vx=(ball.vx-2*dot*nx)*boost;ball.vy=(ball.vy-2*dot*ny)*boost;}
    return true;
  }
  return false;
}

// ── Backdrop (pre-rendered) ───────────────────────────────────────────────────
function buildBackdrop():HTMLCanvasElement{
  const oc=document.createElement('canvas');oc.width=W;oc.height=H;
  const c=oc.getContext('2d')!;
  // Deep gradient bg
  const bg=c.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#0b0018');bg.addColorStop(0.5,'#07000f');bg.addColorStop(1,'#030008');
  c.fillStyle=bg;c.fillRect(0,0,W,H);
  // Stars
  c.fillStyle='rgba(255,255,255,0.55)';
  for(let i=0;i<90;i++){const x=WALL_L+Math.random()*(WALL_R-WALL_L),y=40+Math.random()*(H-80),r=Math.random()*0.8+0.2;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
  // Moon glow
  const mG=c.createRadialGradient(200,410,0,200,410,65);mG.addColorStop(0,'rgba(180,140,255,0.11)');mG.addColorStop(1,'rgba(60,0,80,0)');c.fillStyle=mG;c.beginPath();c.arc(200,410,65,0,Math.PI*2);c.fill();
  // Mansion silhouette at bottom
  c.fillStyle='rgba(22,0,35,0.60)';c.fillRect(50,588,300,112);
  [[90,596],[128,596],[166,596],[214,596],[252,596],[290,596]].forEach(([x,y])=>{
    c.fillStyle='rgba(255,190,30,0.07)';c.fillRect(x,y,13,19);
    c.strokeStyle='rgba(200,144,10,0.25)';c.lineWidth=0.5;c.strokeRect(x,y,13,19);
  });
  c.fillStyle='rgba(14,0,22,0.75)';c.fillRect(52,528,38,72);c.fillRect(310,528,38,72);
  c.beginPath();c.moveTo(52,528);c.lineTo(71,494);c.lineTo(90,528);c.closePath();c.fill();
  c.beginPath();c.moveTo(310,528);c.lineTo(329,494);c.lineTo(348,528);c.closePath();c.fill();
  c.fillRect(182,555,36,45);c.beginPath();c.moveTo(176,555);c.lineTo(200,516);c.lineTo(224,555);c.closePath();c.fill();
  // Spider webs
  function web(cx:number,cy:number,r:number,sg=7){
    c.strokeStyle='rgba(130,70,170,0.20)';c.lineWidth=0.6;
    for(let i=0;i<sg;i++){const a=i/sg*Math.PI*2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);c.stroke();}
    for(let rn=1;rn<=4;rn++){c.beginPath();for(let i=0;i<sg;i++){const a=i/sg*Math.PI*2,x=cx+Math.cos(a)*r*(rn/4),y=cy+Math.sin(a)*r*(rn/4);i===0?c.moveTo(x,y):c.lineTo(x,y);}c.closePath();c.stroke();}
  }
  web(WALL_L+18,52,28);web(WALL_R-18,52,28);web(WALL_L+12,205,20);web(WALL_R-12,205,20);
  // Candelabras
  function cndl(x:number,y:number){
    c.strokeStyle='rgba(200,144,10,0.20)';c.lineWidth=1.2;
    c.beginPath();c.moveTo(x-10,y+34);c.lineTo(x+10,y+34);c.stroke();
    c.beginPath();c.moveTo(x,y+34);c.lineTo(x,y+10);c.stroke();
    c.beginPath();c.moveTo(x-10,y+16);c.lineTo(x-10,y+6);c.stroke();
    c.beginPath();c.moveTo(x+10,y+16);c.lineTo(x+10,y+6);c.stroke();
    c.beginPath();c.moveTo(x-10,y+16);c.lineTo(x+10,y+16);c.stroke();
    [[x-10,y+5],[x,y+9],[x+10,y+5]].forEach(([fx,fy])=>{
      const fg=c.createRadialGradient(fx,fy,0,fx,fy,7);fg.addColorStop(0,'rgba(255,200,80,0.32)');fg.addColorStop(1,'rgba(255,90,0,0)');
      c.fillStyle=fg;c.beginPath();c.arc(fx,fy,7,0,Math.PI*2);c.fill();
    });
  }
  cndl(WALL_L+8,438);cndl(WALL_R-8,438);cndl(WALL_L+8,510);cndl(WALL_R-8,510);
  // Lane divider diamonds
  for(let y=115;y<H-90;y+=52){c.fillStyle='rgba(200,144,10,0.07)';c.save();c.translate(W/2,y);c.rotate(Math.PI/4);c.fillRect(-3,-3,6,6);c.restore();}
  return oc;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdamsPinball(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sRef=useRef<any>(null);
  const animRef=useRef<number|null>(null);
  const audioRef=useRef<any>(null);
  const muteRef=useRef(false);
  const wallCool=useRef(0);
  const bdRef=useRef<HTMLCanvasElement|null>(null);
  const [muted,setMuted]=useState(false);
  const [musicOn,setMusicOn]=useState(true);

  function getAudio(){
    if(muteRef.current)return null;
    if(!audioRef.current){try{audioRef.current=buildAudio();}catch{return null;}}
    const a=audioRef.current;if(a.ac.state==='suspended')a.ac.resume();return a;
  }
  function sfx(name:string,...args:any[]){const a=getAudio();if(a&&a[name])a[name](...args);}
  function ensureMusic(){const a=getAudio();if(a&&!a.isPlaying&&!muteRef.current)a.startMusic();}

  const mkState=useCallback(()=>({
    balls:[] as any[],
    inLane:true,charging:false,plunger:0,laneY:576,
    leftUp:false,rightUp:false,leftA:FL.downA,rightA:FR.downA,prevL:false,prevR:false,
    score:0,lives:3,gameOver:false,
    bumperFlash:new Array(BUMPERS.length).fill(0),
    slingFlash:[0,0],
    targets:TARGETS_DEF.map(t=>({...t,hit:false})),
    thingHit:false,thingFlash:0,
    floats:[] as any[],combo:0,comboTimer:0,
    ballFlash:0,lightFrames:0,tick:0,
    highScore:sRef.current?.highScore??0,
    ballSaveTimer:0,
    kbCharged:true,kbHits:0,kbFlash:0,
    rapidPresses:0,rapidTimer:0,tiltWarn:0,tilted:false,tiltTimer:0,tiltFlash:0,
    multiball:false,
    shake:{x:0,y:0,frames:0,mag:0},
    bats:[] as any[],
    // New game state
    drops:DROPS_DEF.map(d=>({...d})),
    dropCompletes:0,
    spinnerAngle:0,spinnerSpin:0,spinnerFlash:0,spinnerScore:0,
    topLanes:TOP_LANES_DEF.map(l=>({...l})),
    topLaneMult:1,
    lOrbitFlash:0,rOrbitFlash:0,orbitCount:0,
    lRampFlash:0,rRampFlash:0,rampCount:0,
    lRampLit:false,rRampLit:false,
    // Interactive toys
    magnet:{captured:false,capturedBall:null as any,captureTimer:0,cooldown:0,flash:0},
    chand:{angle:0.3,angleVel:CHAND.naturalSpeed,flash:0,hits:0},
  }),[]);

  useEffect(()=>{
    const canvas=canvasRef.current!;
    const ctx=canvas.getContext('2d')!;
    sRef.current=mkState();
    bdRef.current=buildBackdrop();

    // Bats
    function spawnBat(){const s=sRef.current;if(s.bats.length<4)s.bats.push({x:WALL_L+Math.random()*(WALL_R-WALL_L),y:40+Math.random()*200,vx:(Math.random()-0.5)*1.1,vy:(Math.random()-0.5)*0.6,ph:Math.random()*Math.PI*2,sz:Math.random()*4+5,life:300+Math.random()*200});}
    const batInt=setInterval(spawnBat,2200);spawnBat();spawnBat();

    function addFloat(x:number,y:number,text:string,color='#c8900a'){sRef.current.floats.push({x,y,text,color,t:60});}
    function shake(f:number,m:number){const s=sRef.current;if(s.shake.frames<f)s.shake={x:0,y:0,frames:f,mag:m};}

    function spawnLaneBall(){
      const s=sRef.current;
      s.inLane=true;s.charging=false;s.plunger=0;s.laneY=576;s.ballSaveTimer=0;
      s.tiltWarn=0;s.tilted=false;s.tiltTimer=0;s.rapidPresses=0;s.rapidTimer=0;
    }

    function checkRampEntry(ball:any,s:any){
      if(ball.onRamp)return;
      const spd=Math.sqrt(ball.vx*ball.vx+ball.vy*ball.vy);
      if(ball.vy>RAMP_MIN_VY)return; // not going up fast enough
      // Left ramp: ball on left side going up fast
      {
        const ep=LRAMP_PATH[0];
        const dx=ball.x-ep[0],dy=ball.y-ep[1],dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<40&&ball.x<130&&ball.vy<RAMP_MIN_VY){
          ball.onRamp='left';ball.rampT=0;
          s.score+=500;s.lRampFlash=40;s.lRampLit=true;s.rampCount++;
          sfx('ramp','left');vibe([20,15,30]);shake(6,3);
          addFloat(90,380,'RAMP! +500','#ffaa00');
          return;
        }
      }
      // Right ramp: ball on right side going up fast
      {
        const ep=RRAMP_PATH[0];
        const dx=ball.x-ep[0],dy=ball.y-ep[1],dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<40&&ball.x>270&&ball.vy<RAMP_MIN_VY){
          ball.onRamp='right';ball.rampT=0;
          s.score+=500;s.rRampFlash=40;s.rRampLit=true;s.rampCount++;
          sfx('ramp','right');vibe([20,15,30]);shake(6,3);
          addFloat(310,380,'RAMP! +500','#ffaa00');
          return;
        }
      }
    }

    function tickBall(ball:any,s:any):boolean{
      // ── Ramp travel ──────────────────────────────────────────────────────
      if(ball.onRamp){
        ball.rampT+=RAMP_SPEED;
        const path=ball.onRamp==='left'?LRAMP_PATH:RRAMP_PATH;
        const pt=bez(path[0],path[1],path[2],path[3],Math.min(1,ball.rampT));
        ball.x=pt.x;ball.y=pt.y;
        if(ball.rampT>=1){
          ball.onRamp=null;ball.rampT=0;
          if(path===LRAMP_PATH){ball.vx=3.5;ball.vy=0.8;}
          else{ball.vx=-3.5;ball.vy=0.8;}
        }
        return false;
      }

      // ── Normal physics ───────────────────────────────────────────────────
      ball.vy+=GRAVITY;ball.x+=ball.vx;ball.y+=ball.vy;
      const spd=Math.sqrt(ball.vx*ball.vx+ball.vy*ball.vy);
      if(spd>0.1){ball.vx*=0.9988;ball.vy*=0.9988;}
      if(spd>22){ball.vx=ball.vx/spd*22;ball.vy=ball.vy/spd*22;}

      // Walls
      if(ball.x-BALL_R<WALL_L){ball.x=WALL_L+BALL_R;ball.vx=Math.abs(ball.vx)*0.65;if(!wallCool.current){sfx('wall');vibe(12);wallCool.current=8;}}
      if(ball.x+BALL_R>WALL_R){ball.x=WALL_R-BALL_R;ball.vx=-Math.abs(ball.vx)*0.65;if(!wallCool.current){sfx('wall');vibe(12);wallCool.current=8;}}
      if(ball.y-BALL_R<40){ball.y=40+BALL_R;ball.vy=Math.abs(ball.vy)*0.65;if(!wallCool.current){sfx('wall');vibe(12);wallCool.current=8;}}
      if(!ball.fromLane&&ball.x+BALL_R>LANE_X-8&&ball.y>390){ball.x=LANE_X-8-BALL_R;ball.vx=Math.min(ball.vx,-0.5);}
      if(ball.fromLane&&ball.y<180)ball.fromLane=false;

      // ── Ramp guard walls ─────────────────────────────────────────────────
      reflectSeg(ball,LRAMP_GUARD[0],LRAMP_GUARD[1],LRAMP_GUARD[2],LRAMP_GUARD[3],1.0);
      reflectSeg(ball,RRAMP_GUARD[0],RRAMP_GUARD[1],RRAMP_GUARD[2],RRAMP_GUARD[3],1.0);

      // ── Orbit sensors ────────────────────────────────────────────────────
      {const dx=ball.x-LORBIT.cx,dy=ball.y-LORBIT.cy;
        if(Math.sqrt(dx*dx+dy*dy)<LORBIT.r+BALL_R&&ball.vy<-3){
          s.lOrbitFlash=40;s.score+=300;s.orbitCount++;sfx('orbit');vibe(15);addFloat(50,90,'ORBIT! +300','#00ccff');
        }
      }
      {const dx=ball.x-RORBIT.cx,dy=ball.y-RORBIT.cy;
        if(Math.sqrt(dx*dx+dy*dy)<RORBIT.r+BALL_R&&ball.vy<-3){
          s.rOrbitFlash=40;s.score+=300;s.orbitCount++;sfx('orbit');vibe(15);addFloat(350,90,'ORBIT! +300','#00ccff');
        }
      }

      // ── Top lanes ────────────────────────────────────────────────────────
      s.topLanes.forEach((lane:any,i:number)=>{
        if(lane.flash>0){lane.flash--;return;}
        const dx=ball.x-lane.cx,dy=ball.y-lane.cy;
        if(Math.sqrt(dx*dx+dy*dy)<lane.r+BALL_R){
          if(!lane.lit){lane.lit=true;s.score+=lane.pts;sfx('topLane');addFloat(lane.cx,lane.cy,`+${lane.pts}`,'#ffd700');}
          lane.flash=20;
          if(s.topLanes.every((l:any)=>l.lit)){
            s.topLaneMult=Math.min(s.topLaneMult+1,6);
            s.topLanes.forEach((l:any)=>{l.lit=false;});
            s.score+=1000;sfx('topLaneAll');vibe([15,15,15,15,40]);
            addFloat(200,80,`${s.topLaneMult}× MULT! +1000`,'#ffff00');
          }
        }
      });

      // ── Ramp entry check ─────────────────────────────────────────────────
      checkRampEntry(ball,s);

      // ── Bumpers ──────────────────────────────────────────────────────────
      BUMPERS.forEach((bmp,i)=>{
        const dx=ball.x-bmp.x,dy=ball.y-bmp.y,dist=Math.sqrt(dx*dx+dy*dy),minD=BALL_R+bmp.r;
        if(dist<minD&&dist>0){
          const nx=dx/dist,ny=dy/dist;
          ball.x=bmp.x+nx*(minD+1);ball.y=bmp.y+ny*(minD+1);
          const sp=Math.max(Math.sqrt(ball.vx*ball.vx+ball.vy*ball.vy),8);
          ball.vx=nx*sp*1.06;ball.vy=ny*sp*1.06;
          s.bumperFlash[i]=16;s.ballFlash=10;s.lightFrames=8;s.combo++;s.comboTimer=130;
          const mult=Math.max(1,s.topLaneMult)*(s.combo>=5?3:s.combo>=3?2:1);
          s.score+=bmp.pts*mult;sfx('bumper',bmp.pts,s.combo);vibe(20);shake(5,3);
          addFloat(bmp.x,bmp.y-bmp.r-10,`+${bmp.pts*mult}`,mult>1?'#ffee00':'#ff8800');
          if(!s.kbCharged){s.kbHits++;if(s.kbHits>=KB_NEEDED){s.kbCharged=true;s.kbHits=0;sfx('kbRecharge');addFloat(55,510,'KB READY','#39c400');}}
        }
      });

      // ── GOMEZ targets ─────────────────────────────────────────────────────
      s.targets.forEach((tgt:any)=>{
        if(tgt.hit)return;
        const dx=ball.x-tgt.x,dy=ball.y-tgt.y;
        if(Math.sqrt(dx*dx+dy*dy)<BALL_R+tgt.r){
          tgt.hit=true;s.score+=tgt.pts;sfx('target');vibe(15);addFloat(tgt.x,tgt.y,`+${tgt.pts}`,'#ffd700');
          if(s.targets.every((t:any)=>t.hit)){s.score+=500;s.targets.forEach((t:any)=>t.hit=false);sfx('bonus');vibe([20,20,20,20,20]);s.lightFrames=25;shake(12,5);addFloat(200,340,'GOMEZ! +500','#ffd700');}
        }
      });

      // ── THING multiball ───────────────────────────────────────────────────
      if(!s.thingHit){
        const dx=ball.x-THING.x,dy=ball.y-THING.y;
        if(Math.sqrt(dx*dx+dy*dy)<BALL_R+THING.r){
          s.thingHit=true;s.thingFlash=35;s.score+=THING.pts;sfx('thing');vibe([20,20,20,20,20,20,60]);shake(15,6);
          addFloat(THING.x,THING.y-35,`THING! +${THING.pts}`,'#cc44ff');
          if(!s.multiball&&s.balls.length<2){
            s.multiball=true;sfx('multiball');addFloat(200,290,'✦ MULTIBALL ✦','#cc44ff');
            setTimeout(()=>{if(sRef.current&&!sRef.current.gameOver)sRef.current.balls.push({x:200+(Math.random()-0.5)*80,y:100,vx:(Math.random()-0.5)*4,vy:3});},600);
          }
          setTimeout(()=>{if(sRef.current)sRef.current.thingHit=false;},10000);
        }
      }

      // ── Drop targets ──────────────────────────────────────────────────────
      s.drops.forEach((drop:any)=>{
        if(drop.down){if(drop.flash>0)drop.flash--;return;}
        // Ball hitting top face of target
        if(ball.x>drop.x-BALL_R&&ball.x<drop.x+drop.w+BALL_R&&
           ball.y+BALL_R>drop.y&&ball.y+BALL_R<drop.y+drop.h+6&&ball.vy>0){
          drop.down=true;drop.flash=25;s.score+=drop.pts;sfx('drop');vibe(25);shake(4,2);
          addFloat(drop.x+drop.w/2,drop.y-12,`+${drop.pts}`,'#ff6600');
          if(s.drops.every((d:any)=>d.down)){
            s.score+=800;s.dropCompletes++;sfx('dropComplete');vibe([20,20,20,60]);shake(10,5);
            addFloat(200,440,'DROPS CLEAR! +800','#ff8800');
            setTimeout(()=>{if(sRef.current)sRef.current.drops.forEach((d:any)=>d.down=false);},1500);
          }
        }
        // Side deflection
        if(!drop.down){reflectSeg(ball,drop.x,drop.y,drop.x+drop.w,drop.y,1.0);reflectSeg(ball,drop.x,drop.y,drop.x,drop.y+drop.h,0.8);reflectSeg(ball,drop.x+drop.w,drop.y,drop.x+drop.w,drop.y+drop.h,0.8);}
      });

      // ── Spinner ───────────────────────────────────────────────────────────
      {
        const sx=SPINNER.x,sy=SPINNER.y,slen=SPINNER.len;
        const dx=ball.x-sx,dy=ball.y-sy;
        if(Math.abs(dx)<slen&&Math.abs(dy)<12&&Math.abs(dy)<Math.abs(dx)+4){
          const crossDir=Math.sign(ball.vy)*Math.sign(dx-dy)*spd;
          s.spinnerSpin=Math.max(-25,Math.min(25,s.spinnerSpin+crossDir*0.4));
          s.spinnerFlash=12;s.score+=10;sfx('spin');vibe(6);
          addFloat(sx,sy-20,'+10','#00ffdd');
        }
      }

      // ── Slingshots ────────────────────────────────────────────────────────
      SLINGS.forEach(([ax,ay,bx2,by2]:any,i:number)=>{
        if(reflectSeg(ball,ax,ay,bx2,by2,1.35)){s.slingFlash[i]=14;s.score+=10;sfx('sling');vibe(15);shake(3,2);}
      });

      // ── Lane guides (outlane/inlane walls) ────────────────────────────────
      reflectSeg(ball,L_OUT[0],L_OUT[1],L_OUT[2],L_OUT[3],0.7);
      reflectSeg(ball,L_IN[0],L_IN[1],L_IN[2],L_IN[3],0.8);
      reflectSeg(ball,L_TRANS[0],L_TRANS[1],L_TRANS[2],L_TRANS[3],0.7);
      reflectSeg(ball,L_ITRANS[0],L_ITRANS[1],L_ITRANS[2],L_ITRANS[3],0.8);
      if(!ball.fromLane){
        reflectSeg(ball,R_IN[0],R_IN[1],R_IN[2],R_IN[3],0.8);
        // R_OUT removed from physics — conflicts with LANE_X constraint
      }

      // ── Kickback ──────────────────────────────────────────────────────────
      if(s.kbCharged&&ball.x<KB_ZONE.xMax&&ball.y>KB_ZONE.yMin&&ball.vy>0){
        ball.vx=8;ball.vy=-14;ball.x=WALL_L+BALL_R+2;
        s.kbCharged=false;s.kbHits=0;s.kbFlash=25;sfx('kickback');vibe([30,20,30]);shake(8,4);
        addFloat(70,540,'KICKBACK!','#39c400');
      }

      // ── Magnet toy ────────────────────────────────────────────────────────
      {const mag=s.magnet;
        if(mag.captured&&mag.capturedBall===ball){
          ball.x=MAGNET.x;ball.y=MAGNET.y;ball.vx=0;ball.vy=0;
          mag.captureTimer--;
          if(mag.captureTimer<=0){
            mag.captured=false;mag.capturedBall=null;
            mag.cooldown=MAGNET.cooldownFrames;mag.flash=40;
            s.score+=MAGNET.jackpot;sfx('magnetRelease');vibe([20,10,20,10,50]);shake(12,5);
            addFloat(MAGNET.x,MAGNET.y-35,`JACKPOT +${MAGNET.jackpot}`,'#ff88ff');
            const releaseAngle=(Math.random()-0.5)*1.2-Math.PI/2;
            ball.vx=Math.cos(releaseAngle)*13;ball.vy=Math.sin(releaseAngle)*13;
          }
          return false;
        }
        if(!mag.captured&&mag.cooldown<=0){
          const mdx=MAGNET.x-ball.x,mdy=MAGNET.y-ball.y;
          const mdist=Math.sqrt(mdx*mdx+mdy*mdy);
          if(mdist<MAGNET.range&&mdist>0){
            const force=MAGNET.strength*(1-mdist/MAGNET.range);
            ball.vx+=mdx/mdist*force;ball.vy+=mdy/mdist*force;
            if(mdist<MAGNET.captureR){
              mag.captured=true;mag.capturedBall=ball;mag.captureTimer=MAGNET.captureFrames;
              ball.vx=0;ball.vy=0;sfx('magnetCapture');vibe([15,15,15,15,30]);shake(8,4);
              addFloat(MAGNET.x,MAGNET.y-28,'CAPTURED!','#ff88ff');
            }
          }
        }
      }
      // ── Chandelier collision ──────────────────────────────────────────────
      {const ch=s.chand;
        const chTX=CHAND.pivotX+Math.sin(ch.angle)*CHAND.length;
        const chTY=CHAND.pivotY+Math.cos(ch.angle)*CHAND.length;
        const cdx=ball.x-chTX,cdy=ball.y-chTY,cdist=Math.sqrt(cdx*cdx+cdy*cdy);
        if(cdist<BALL_R+13&&cdist>0){
          const cnx=cdx/cdist,cny=cdy/cdist;
          ball.x=chTX+cnx*(BALL_R+13.5);ball.y=chTY+cny*(BALL_R+13.5);
          const cdot=ball.vx*cnx+ball.vy*cny;
          if(cdot<0){
            ball.vx-=2*cdot*cnx;ball.vy-=2*cdot*cny;
            const chandVx=ch.angleVel*Math.cos(ch.angle)*CHAND.length;
            ball.vx+=chandVx*1.5;ball.vy-=2;
            ch.angleVel+=(ball.vx>0?0.018:-0.018);
            ch.flash=25;ch.hits++;s.score+=200;sfx('chandHit');vibe(15);shake(4,2);
            addFloat(chTX,chTY-18,'+200','#ffdd88');
          }
        }
      }

      return ball.y>H+20;
    }

    function tickFlippers(ball:any,s:any,pLA:number,pRA:number){
      [[FL,s.leftA,pLA,s.leftUp],[FR,s.rightA,pRA,s.rightUp]].forEach(([f,a,pa,up]:any)=>{
        const ep=fpEnd(f,a),cp=closestOnSeg(f.px,f.py,ep.x,ep.y,ball.x,ball.y);
        const dx=ball.x-cp.x,dy=ball.y-cp.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<BALL_R+5&&dist>0){
          const nx=dx/dist,ny=dy/dist;
          ball.x=cp.x+nx*(BALL_R+5.5);ball.y=cp.y+ny*(BALL_R+5.5);
          const dot=ball.vx*nx+ball.vy*ny;
          if(dot<0){ball.vx-=2*dot*nx;ball.vy-=2*dot*ny;const av=(a-pa)*60;if(up&&(f===FL?av<-0.01:av>0.01)){ball.vx+=nx*4;ball.vy+=ny*4-7;}}
        }
      });
    }

    function update(){
      const s=sRef.current;s.tick++;if(s.gameOver)return;
      if(wallCool.current>0)wallCool.current--;
      // Shake
      if(s.shake.frames>0){const m=s.shake.mag*(s.shake.frames/12);s.shake.x=(Math.random()-0.5)*m;s.shake.y=(Math.random()-0.5)*m;s.shake.frames--;}else{s.shake.x=0;s.shake.y=0;}
      // Bats
      s.bats=s.bats.map((bt:any)=>{bt.x+=bt.vx+Math.sin(s.tick*0.03+bt.ph)*0.4;bt.y+=bt.vy+Math.cos(s.tick*0.05+bt.ph)*0.3;bt.life--;if(bt.x<WALL_L+5)bt.vx=Math.abs(bt.vx);if(bt.x>WALL_R-5)bt.vx=-Math.abs(bt.vx);if(bt.y<42)bt.vy=Math.abs(bt.vy);if(bt.y>H-110)bt.vy=-Math.abs(bt.vy);return bt;}).filter((bt:any)=>bt.life>0);
      // Spinner decay
      s.spinnerSpin*=0.94;if(Math.abs(s.spinnerSpin)>0.1)s.spinnerAngle+=s.spinnerSpin*0.05;
      if(s.spinnerFlash>0)s.spinnerFlash--;
      // Chandelier physics
      {const ch=s.chand;ch.angle+=ch.angleVel;if(Math.abs(ch.angle)>CHAND.maxAngle){ch.angleVel=-ch.angleVel*0.97;ch.angle=Math.sign(ch.angle)*CHAND.maxAngle;}ch.angleVel*=0.9997;if(Math.abs(ch.angleVel)<CHAND.naturalSpeed*0.8)ch.angleVel=CHAND.naturalSpeed*(ch.angle>0?-1:1);if(ch.flash>0)ch.flash--;}
      // Magnet cooldown
      if(s.magnet.cooldown>0)s.magnet.cooldown--;if(s.magnet.flash>0)s.magnet.flash--;
      if(s.lOrbitFlash>0)s.lOrbitFlash--;if(s.rOrbitFlash>0)s.rOrbitFlash--;
      if(s.lRampFlash>0)s.lRampFlash--;if(s.rRampFlash>0)s.rRampFlash--;
      // Tilt
      if(s.tilted){s.tiltTimer--;if(s.tiltTimer<=0){s.tilted=false;s.tiltWarn=0;}}
      else{if(s.rapidTimer>0)s.rapidTimer--;else s.rapidPresses=0;}
      if(s.tiltFlash>0)s.tiltFlash--;
      if(!s.tilted){
        if(s.leftUp&&!s.prevL){sfx('flipper');vibe(8);s.rapidPresses++;s.rapidTimer=55;}
        if(s.rightUp&&!s.prevR){sfx('flipper');vibe(8);s.rapidPresses++;s.rapidTimer=55;}
      }
      s.prevL=s.leftUp;s.prevR=s.rightUp;
      if(!s.tilted&&s.rapidPresses>=TILT_THRESH){
        s.rapidPresses=0;s.rapidTimer=0;s.tiltWarn++;
        if(s.tiltWarn>=TILT_MAX){s.tilted=true;s.tiltTimer=TILT_LOCK;s.tiltFlash=TILT_LOCK;sfx('tilt');vibe([100,50,100,50,200]);addFloat(200,400,'T I L T','#ff2222');}
        else{sfx('tiltWarn');vibe([40,20,40]);addFloat(200,400,`⚠ WARNING ${s.tiltWarn}/${TILT_MAX-1}`,'#ff8800');}
      }
      const el=s.tilted?false:s.leftUp,er=s.tilted?false:s.rightUp;
      const pLA=s.leftA,pRA=s.rightA;
      s.leftA+=((el?FL.upA:FL.downA)-s.leftA)*0.38;
      s.rightA+=((er?FR.upA:FR.downA)-s.rightA)*0.38;
      if(s.inLane){if(s.charging)s.plunger=Math.min(1,s.plunger+0.022);else s.laneY=Math.min(s.laneY+0.5,608);return;}
      if(s.ballSaveTimer>0)s.ballSaveTimer--;
      const drained:number[]=[];
      s.balls.forEach((b:any,i:number)=>{const fell=tickBall(b,s);if(!fell)tickFlippers(b,s,pLA,pRA);else drained.push(i);});
      for(let i=drained.length-1;i>=0;i--)s.balls.splice(drained[i],1);
      if(drained.length>0&&s.balls.length===0){
        s.multiball=false;s.combo=0;
        if(s.ballSaveTimer>0){sfx('ballsave');vibe([10,30,10,30,10]);addFloat(200,400,'BALL SAVED!','#39c400');spawnLaneBall();}
        else{s.lives--;if(s.lives<=0){s.gameOver=true;s.highScore=Math.max(s.highScore,s.score);sfx('gameover');vibe([80,40,80,40,300]);}else{sfx('drain');vibe([50,30,80]);spawnLaneBall();}}
      }
      s.bumperFlash=s.bumperFlash.map((f:number)=>Math.max(0,f-1));
      s.slingFlash=s.slingFlash.map((f:number)=>Math.max(0,f-1));
      s.ballFlash=Math.max(0,s.ballFlash-1);s.kbFlash=Math.max(0,s.kbFlash-1);
      if(s.thingFlash>0)s.thingFlash--;if(s.lightFrames>0)s.lightFrames--;
      if(s.comboTimer>0){s.comboTimer--;if(!s.comboTimer)s.combo=0;}
      s.floats=s.floats.map((f:any)=>({...f,y:f.y-0.8,t:f.t-1})).filter((f:any)=>f.t>0);
    }

    // ── Draw ─────────────────────────────────────────────────────────────────
    function gl(c:string,b:number){ctx.shadowColor=c;ctx.shadowBlur=b;}
    function ng(){ctx.shadowBlur=0;}

    function drawBall(b:any,flash:number){
      if(!b.trail)b.trail=[];
      b.trail.push({x:b.x,y:b.y});if(b.trail.length>8)b.trail.shift();
      b.trail.forEach((pt:any,i:number)=>{
        const a=(i/b.trail.length)*0.22;
        ctx.beginPath();ctx.arc(pt.x,pt.y,BALL_R*(i/b.trail.length)*0.7,0,Math.PI*2);
        ctx.fillStyle=`rgba(150,80,255,${a})`;ctx.fill();
      });
      const gr=ctx.createRadialGradient(b.x-3,b.y-4,1,b.x,b.y,BALL_R);
      if(flash>0){gr.addColorStop(0,'#ffffff');gr.addColorStop(0.3,'#eeddff');gr.addColorStop(0.7,'#aa44ff');gr.addColorStop(1,'#440066');gl('#cc44ff',28);}
      else{gr.addColorStop(0,'#ffffff');gr.addColorStop(0.2,'#e8e0f0');gr.addColorStop(0.6,'#a090c0');gr.addColorStop(1,'#302040');gl('#9966cc',16);}
      ctx.beginPath();ctx.arc(b.x,b.y,BALL_R,0,Math.PI*2);ctx.fillStyle=gr;ctx.fill();
      const sp=ctx.createRadialGradient(b.x-3,b.y-4,0,b.x-3,b.y-4,5);sp.addColorStop(0,'rgba(255,255,255,0.9)');sp.addColorStop(1,'rgba(255,255,255,0)');
      ctx.beginPath();ctx.arc(b.x,b.y,BALL_R,0,Math.PI*2);ctx.fillStyle=sp;ctx.fill();ng();
    }

    function drawBat(bt:any){
      const w=Math.sin(sRef.current.tick*0.25+bt.ph)*0.7;
      ctx.save();ctx.translate(bt.x,bt.y);
      const alp=Math.min(1,bt.life/60)*0.65;
      ctx.strokeStyle=`rgba(120,60,160,${alp})`;ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(0,0,bt.sz*0.3,bt.sz*0.2,0,0,Math.PI*2);ctx.fillStyle=`rgba(55,0,75,${alp*0.9})`;ctx.fill();
      ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-bt.sz,w*bt.sz,-bt.sz*1.8,bt.sz*0.5);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(bt.sz,w*bt.sz,bt.sz*1.8,bt.sz*0.5);ctx.stroke();
      ctx.restore();
    }

    function drawLightning(x1:number,y1:number,x2:number,y2:number,segs=7,jit=14){
      ctx.beginPath();ctx.moveTo(x1,y1);
      for(let i=1;i<=segs;i++){const t=i/segs;ctx.lineTo(x1+(x2-x1)*t+(Math.random()-0.5)*jit,y1+(y2-y1)*t+(Math.random()-0.5)*jit);}
      ctx.lineTo(x2,y2);ctx.stroke();
    }

    function drawChandelier(ch:any){
      const chTX=CHAND.pivotX+Math.sin(ch.angle)*CHAND.length;
      const chTY=CHAND.pivotY+Math.cos(ch.angle)*CHAND.length;
      const lit=ch.flash>0,swing=Math.abs(ch.angleVel)>CHAND.naturalSpeed*1.5;
      // Chain/rope
      gl(lit?'#ffee88':'#aa8822',lit?10:4);
      ctx.strokeStyle=lit?'#ffee88':'#cc9922';ctx.lineWidth=lit?3:2;
      ctx.beginPath();
      // Draw segmented chain
      const segs=6;
      for(let i=0;i<=segs;i++){
        const t=i/segs;
        const cx=CHAND.pivotX+Math.sin(ch.angle*t)*CHAND.length*t;
        const cy=CHAND.pivotY+Math.cos(ch.angle*t)*CHAND.length*t;
        i===0?ctx.moveTo(cx,cy):ctx.lineTo(cx,cy);
      }
      ctx.stroke();ng();
      // Crystal/gem at tip
      const gemR=13;
      const gemG=ctx.createRadialGradient(chTX-3,chTY-3,1,chTX,chTY,gemR);
      if(lit||swing){gemG.addColorStop(0,'#ffffff');gemG.addColorStop(0.3,'#ffee88');gemG.addColorStop(0.7,'#cc8800');gemG.addColorStop(1,'#664400');gl('#ffdd44',lit?24:14);}
      else{gemG.addColorStop(0,'#eecc88');gemG.addColorStop(0.4,'#aa8833');gemG.addColorStop(1,'#443300');gl('#cc9900',8);}
      ctx.beginPath();ctx.arc(chTX,chTY,gemR,0,Math.PI*2);ctx.fillStyle=gemG;ctx.fill();
      // Diamond facets
      ctx.strokeStyle=lit?'rgba(255,240,150,0.7)':'rgba(200,160,80,0.4)';ctx.lineWidth=1;
      for(let i=0;i<6;i++){const a=i/6*Math.PI*2;ctx.beginPath();ctx.moveTo(chTX,chTY);ctx.lineTo(chTX+Math.cos(a)*gemR,chTY+Math.sin(a)*gemR);ctx.stroke();}
      // Flame sparks when hit
      if(lit&&Math.random()<0.6){
        gl('#ffdd44',14);ctx.strokeStyle='rgba(255,220,100,0.8)';ctx.lineWidth=1.5;
        for(let i=0;i<4;i++){const sa=Math.random()*Math.PI*2,sl=6+Math.random()*14;ctx.beginPath();ctx.moveTo(chTX,chTY);ctx.lineTo(chTX+Math.cos(sa)*sl,chTY+Math.sin(sa)*sl);ctx.stroke();}ng();
      }
      // Pivot ring at top
      gl('#cc9900',6);ctx.beginPath();ctx.arc(CHAND.pivotX,CHAND.pivotY,5,0,Math.PI*2);ctx.fillStyle='#cc9900';ctx.fill();ng();
    }

    function drawMagnet(mag:any,tick:number){
      const captured=mag.captured,cooldown=mag.cooldown>0,fl=mag.flash>0;
      const pct=captured?1-mag.captureTimer/MAGNET.captureFrames:0;
      // Pulsing attraction rings
      if(!cooldown){
        for(let r=0;r<4;r++){
          const phase=(tick*0.04+r*0.25)%1;
          const ringR=MAGNET.captureR+phase*(MAGNET.range-MAGNET.captureR);
          const alpha=0.6*(1-phase)*(captured?1:0.5);
          ctx.beginPath();ctx.arc(MAGNET.x,MAGNET.y,ringR,0,Math.PI*2);
          ctx.strokeStyle=captured?`rgba(255,80,255,${alpha})`:`rgba(180,80,255,${alpha})`;
          ctx.lineWidth=1.5;ctx.stroke();
        }
      }
      // Horseshoe magnet shape
      const mg=ctx.createRadialGradient(MAGNET.x-4,MAGNET.y-4,2,MAGNET.x,MAGNET.y,22);
      if(captured){mg.addColorStop(0,'#ffffff');mg.addColorStop(0.3,'#ff88ff');mg.addColorStop(0.7,'#cc00cc');mg.addColorStop(1,'#550055');gl('#ff44ff',35);}
      else if(cooldown){mg.addColorStop(0,'#2a1a2a');mg.addColorStop(1,'#110011');gl('#330033',3);}
      else if(fl){mg.addColorStop(0,'#ffaaff');mg.addColorStop(0.5,'#aa00aa');mg.addColorStop(1,'#440044');gl('#ff88ff',22);}
      else{mg.addColorStop(0,'#ee88ee');mg.addColorStop(0.4,'#990099');mg.addColorStop(1,'#330033');gl('#cc44cc',14);}
      ctx.beginPath();ctx.arc(MAGNET.x,MAGNET.y,20,0,Math.PI*2);ctx.fillStyle=mg;ctx.fill();
      ctx.strokeStyle=captured?'#ff88ff':cooldown?'#440044':'#cc44cc';ctx.lineWidth=3;ctx.stroke();ng();
      // Inner magnet poles (N/S visual)
      if(!cooldown){
        ctx.fillStyle=captured?'#fff':'#ffbbff';ctx.font='bold 10px serif';ctx.textAlign='center';
        ctx.fillText('N',MAGNET.x-7,MAGNET.y-4);ctx.fillStyle=captured?'#ffccff':'#cc88cc';ctx.fillText('S',MAGNET.x+7,MAGNET.y+6);
      }
      // Spark arcs when capturing
      if(captured&&Math.random()<0.65){
        gl('#ff88ff',18);ctx.strokeStyle='rgba(255,150,255,0.9)';ctx.lineWidth=1.5;
        for(let i=0;i<5;i++){
          const sa=Math.random()*Math.PI*2,sl=10+Math.random()*25;
          ctx.beginPath();ctx.moveTo(MAGNET.x,MAGNET.y);ctx.lineTo(MAGNET.x+Math.cos(sa)*sl,MAGNET.y+Math.sin(sa)*sl);ctx.stroke();
        }ng();
      }
      // Labels and status
      if(captured){
        const jackNow=Math.round(pct*MAGNET.jackpot);
        gl('#ff88ff',8);ctx.fillStyle='#ffbbff';ctx.font="bold 8px 'Courier New',monospace";ctx.textAlign='center';
        ctx.fillText(`JACKPOT ${jackNow}`,MAGNET.x,MAGNET.y+32);ng();
      } else if(cooldown){
        const pctCD=1-mag.cooldown/MAGNET.cooldownFrames;
        ctx.fillStyle='rgba(80,0,80,0.6)';ctx.fillRect(MAGNET.x-22,MAGNET.y+24,44,5);
        ctx.fillStyle='rgba(180,80,180,0.8)';ctx.fillRect(MAGNET.x-22,MAGNET.y+24,44*pctCD,5);
        ctx.fillStyle='#664466';ctx.font="bold 7px 'Courier New',monospace";ctx.textAlign='center';ctx.fillText('RECHARGING',MAGNET.x,MAGNET.y+36);
      } else {
        gl('#cc44cc',5);ctx.fillStyle='#dd88dd';ctx.font="bold 8px 'Courier New',monospace";ctx.textAlign='center';
        ctx.fillText('🧲 MAGNET',MAGNET.x,MAGNET.y+32);ng();
      }
    }

    function drawFlipper(f:any,angle:number,active:boolean){
      const ep=fpEnd(f,angle),c=active?'#44ff44':'#22aa22';
      gl(c,active?28:12);ctx.strokeStyle=active?'rgba(100,255,100,0.28)':'rgba(50,180,50,0.18)';ctx.lineWidth=18;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(f.px,f.py);ctx.lineTo(ep.x,ep.y);ctx.stroke();
      ctx.strokeStyle=c;ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(f.px,f.py);ctx.lineTo(ep.x,ep.y);ctx.stroke();
      ctx.strokeStyle=active?'rgba(200,255,200,0.8)':'rgba(120,220,120,0.5)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(f.px,f.py);ctx.lineTo(ep.x,ep.y);ctx.stroke();ng();
      const pg=ctx.createRadialGradient(f.px,f.py,0,f.px,f.py,7);pg.addColorStop(0,active?'#ccffcc':'#88cc88');pg.addColorStop(1,c);
      gl(c,active?14:6);ctx.beginPath();ctx.arc(f.px,f.py,7,0,Math.PI*2);ctx.fillStyle=pg;ctx.fill();ng();
    }

    function draw(){
      const s=sRef.current;
      ctx.save();ctx.translate(s.shake.x,s.shake.y);

      // Backdrop
      ctx.drawImage(bdRef.current!,0,0);

      // ── TABLE SURFACE ZONES (drawn first, under everything) ──────────────

      // Upper playfield zone — green felt between the ramp channels
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(66,505);
      ctx.bezierCurveTo(60,300,44,92,150,55);
      ctx.lineTo(250,55);
      ctx.bezierCurveTo(356,92,340,300,334,505);
      ctx.closePath();
      const upG=ctx.createLinearGradient(200,50,200,320);
      upG.addColorStop(0,'rgba(0,50,10,0.92)');upG.addColorStop(1,'rgba(0,28,6,0.88)');
      ctx.fillStyle=upG;ctx.fill();
      // Green felt grid lines
      ctx.strokeStyle='rgba(0,80,20,0.25)';ctx.lineWidth=1;ctx.setLineDash([3,8]);
      for(let yy=70;yy<310;yy+=22){ctx.beginPath();ctx.moveTo(70,yy);ctx.lineTo(330,yy);ctx.stroke();}
      for(let xx=80;xx<330;xx+=22){ctx.beginPath();ctx.moveTo(xx,50);ctx.lineTo(xx,310);ctx.stroke();}
      ctx.setLineDash([]);
      ctx.restore();

      // ── RAMP SURFACES — drawn as thick filled corridors ───────────────────
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      const lLit=s.lRampFlash>0,rLit=s.rRampFlash>0;
      // Shadow/base (wide dark stroke = ramp wall thickness)
      ctx.strokeStyle='rgba(0,0,0,0.7)';ctx.lineWidth=56;
      drawBez(ctx,LRAMP_PATH[0],LRAMP_PATH[1],LRAMP_PATH[2],LRAMP_PATH[3]);
      drawBez(ctx,RRAMP_PATH[0],RRAMP_PATH[1],RRAMP_PATH[2],RRAMP_PATH[3]);
      // Ramp body color
      ctx.strokeStyle=lLit?'#dd5500':'#881e00';ctx.lineWidth=42;
      drawBez(ctx,LRAMP_PATH[0],LRAMP_PATH[1],LRAMP_PATH[2],LRAMP_PATH[3]);
      ctx.strokeStyle=rLit?'#dd5500':'#881e00';ctx.lineWidth=42;
      drawBez(ctx,RRAMP_PATH[0],RRAMP_PATH[1],RRAMP_PATH[2],RRAMP_PATH[3]);
      // Ramp surface top texture (lighter center stripe — suggests depth)
      ctx.strokeStyle=lLit?'#ff7722':'#aa3300';ctx.lineWidth=20;
      drawBez(ctx,LRAMP_PATH[0],LRAMP_PATH[1],LRAMP_PATH[2],LRAMP_PATH[3]);
      ctx.strokeStyle=rLit?'#ff7722':'#aa3300';ctx.lineWidth=20;
      drawBez(ctx,RRAMP_PATH[0],RRAMP_PATH[1],RRAMP_PATH[2],RRAMP_PATH[3]);
      // Bright edge rail (top edge of ramp)
      gl(lLit?'#ffcc44':'#ff6600',lLit?20:8);
      ctx.strokeStyle=lLit?'#ffee88':'#ff8800';ctx.lineWidth=3;
      drawBez(ctx,LRAMP_PATH[0],LRAMP_PATH[1],LRAMP_PATH[2],LRAMP_PATH[3]);ng();
      gl(rLit?'#ffcc44':'#ff6600',rLit?20:8);
      ctx.strokeStyle=rLit?'#ffee88':'#ff8800';ctx.lineWidth=3;
      drawBez(ctx,RRAMP_PATH[0],RRAMP_PATH[1],RRAMP_PATH[2],RRAMP_PATH[3]);ng();
      // Arrow indicators on ramp surface
      ctx.fillStyle=lLit?'#ffee88':'rgba(255,140,40,0.7)';
      ctx.font=`bold ${lLit?10:8}px "Courier New",monospace`;ctx.textAlign='center';
      ctx.fillText('▲',LRAMP_PATH[0][0]-4,LRAMP_PATH[0][1]+14);
      ctx.fillText('RAMP',LRAMP_PATH[0][0]-4,LRAMP_PATH[0][1]+24);
      ctx.fillStyle=rLit?'#ffee88':'rgba(255,140,40,0.7)';
      ctx.fillText('▲',RRAMP_PATH[0][0]+4,RRAMP_PATH[0][1]+14);
      ctx.fillText('RAMP',RRAMP_PATH[0][0]+4,RRAMP_PATH[0][1]+24);
      ctx.restore();
      // Ramp shot counter
      if(s.rampCount>0){gl('#ff8800',8);ctx.fillStyle='#ffaa44';ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(`🔀 RAMPS ×${s.rampCount}`,200,76);ng();}

      // Tilt wash
      if(s.tiltFlash>0&&s.tilted){ctx.fillStyle=`rgba(160,0,0,${Math.min(0.28,(s.tiltFlash/TILT_LOCK)*0.28)})`;ctx.fillRect(0,0,W,H);}

      // Bats
      s.bats.forEach((bt:any)=>drawBat(bt));

      // Moon pulse
      const mp=0.05*Math.sin(s.tick*0.02);
      const mG2=ctx.createRadialGradient(200,410,0,200,410,58+mp*10);mG2.addColorStop(0,`rgba(175,135,255,${0.09+mp})`);mG2.addColorStop(1,'rgba(60,0,80,0)');
      ctx.fillStyle=mG2;ctx.beginPath();ctx.arc(200,410,68,0,Math.PI*2);ctx.fill();

      // Launch lane shadow
      ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(LANE_X,386,WALL_R-LANE_X,H-386);
      ctx.strokeStyle='rgba(200,144,10,0.28)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(LANE_X,386);ctx.lineTo(LANE_X,H);ctx.stroke();ctx.setLineDash([]);

      // Lightning
      if(s.lightFrames>0&&Math.random()<0.65){
        gl('#cc44ff',22);ctx.strokeStyle='rgba(220,120,255,0.8)';ctx.lineWidth=1.8;
        const bmp=BUMPERS[Math.floor(Math.random()*BUMPERS.length)];
        drawLightning(bmp.x,bmp.y,bmp.x+(Math.random()-0.5)*100,bmp.y-Math.random()*90-10);ng();
      }

      // ── Interactive toys ─────────────────────────────────────────────────────
      drawChandelier(s.chand);
      drawMagnet(s.magnet,s.tick);

      // Ramp guard walls (inner edges of ramp channels)
      gl('#ff5500',6);ctx.strokeStyle='#cc3300';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(LRAMP_GUARD[0],LRAMP_GUARD[1]);ctx.lineTo(LRAMP_GUARD[2],LRAMP_GUARD[3]);ctx.stroke();
      ctx.beginPath();ctx.moveTo(RRAMP_GUARD[0],RRAMP_GUARD[1]);ctx.lineTo(RRAMP_GUARD[2],RRAMP_GUARD[3]);ctx.stroke();ng();

      // ── Gold outer walls ──────────────────────────────────────────────────
      function wline(x1:number,y1:number,x2:number,y2:number,c='#c8900a',w=3){
        gl(c,16);ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ng();
      }
      wline(WALL_L,40,WALL_L,H);wline(WALL_R,40,WALL_R,H);
      wline(WALL_L,40,W/2-24,40);wline(W/2+24,40,WALL_R,40);
      // Turret peaks
      [[WALL_L,40],[WALL_R,40]].forEach(([tx,ty])=>{gl('#c8900a',10);ctx.strokeStyle='#c8900a';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(tx-10,ty);ctx.lineTo(tx,ty-18);ctx.lineTo(tx+10,ty);ctx.stroke();gl('#ffcc44',12);ctx.fillStyle='#ffcc44';ctx.beginPath();ctx.arc(tx,ty-18,3,0,Math.PI*2);ctx.fill();ng();});
      // Gothic arch top
      gl('#c8900a',10);ctx.strokeStyle='#c8900a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(W/2,40,24,Math.PI,0);ctx.stroke();ng();

      // ── Orbit sensors ─────────────────────────────────────────────────────
      [{...LORBIT,flash:s.lOrbitFlash},{...RORBIT,flash:s.rOrbitFlash}].forEach(orb=>{
        const lit=orb.flash>0,c=lit?'#44ffff':'#006666';
        gl(c,lit?18:5);ctx.beginPath();ctx.arc(orb.cx,orb.cy,orb.r,0,Math.PI*2);
        ctx.strokeStyle=c;ctx.lineWidth=2;ctx.stroke();
        ctx.fillStyle=lit?'rgba(0,200,200,0.25)':'rgba(0,80,80,0.1)';ctx.fill();ng();
        ctx.fillStyle=lit?'#44ffff':'#004444';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('ORBIT',orb.cx,orb.cy+3);
      });

      // ── Top lanes ─────────────────────────────────────────────────────────
      s.topLanes.forEach((lane:any,i:number)=>{
        const lit=lane.lit,fl=lane.flash>0;
        const c=fl?'#ffff44':lit?'#ffd700':'#443300';
        gl(c,lit||fl?16:4);ctx.beginPath();ctx.arc(lane.cx,lane.cy,lane.r,0,Math.PI*2);
        ctx.strokeStyle=c;ctx.lineWidth=2;ctx.stroke();
        ctx.fillStyle=lit||fl?'rgba(255,215,0,0.3)':'rgba(30,20,0,0.5)';ctx.fill();ng();
        ctx.fillStyle=lit||fl?'#ffdd00':'#664400';ctx.font='bold 8px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText(['G','H','O'][i]||'·',lane.cx,lane.cy+3);
      });
      // Mult indicator
      if(s.topLaneMult>1){
        const mc=s.topLaneMult>=4?'#ff44ff':s.topLaneMult>=2?'#ffaa00':'#c8900a';
        gl(mc,8);ctx.fillStyle=mc;ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText(`${s.topLaneMult}× MULT`,200,48);ng();
      }

      // ── Slingshots ────────────────────────────────────────────────────────
      SLINGS.forEach(([ax,ay,bx2,by2]:any,i:number)=>{
        const fl=s.slingFlash[i]>0,c=fl?'#ff3366':'#991133';
        gl(c,fl?22:8);ctx.strokeStyle=c;ctx.lineWidth=fl?5:3.5;
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx2,by2);ctx.stroke();
        if(fl){ctx.strokeStyle='rgba(255,150,180,0.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx2,by2);ctx.stroke();}ng();
      });

      // ── Lane guides (inlane/outlane walls) ───────────────────────────────
      function laneWall(pts:number[],c='#c8900a',w=2){
        gl(c,8);ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);ctx.lineTo(pts[2],pts[3]);ctx.stroke();ng();
      }
      laneWall(L_OUT as any,'#aa7700',2);laneWall(L_IN as any,'#aa7700',2);
      laneWall(R_IN as any,'#aa7700',2);laneWall(R_OUT as any,'#aa7700',2);
      laneWall(L_TRANS as any,'#996600',1.5);laneWall(R_TRANS as any,'#996600',1.5);
      laneWall(L_ITRANS as any,'#996600',1.5);laneWall(R_ITRANS as any,'#996600',1.5);
      // Lane labels
      ctx.fillStyle='rgba(150,100,0,0.45)';ctx.font='7px "Courier New",monospace';ctx.textAlign='center';
      ctx.fillText('OUT',45,600);ctx.fillText('IN',84,600);
      ctx.fillText('IN',316,600);ctx.fillText('OUT',340,600);

      // ── Kickback arrow ────────────────────────────────────────────────────
      {const ky=548,ch=s.kbCharged,fl=s.kbFlash>0,pulse=ch?0.7+0.3*Math.abs(Math.sin(s.tick*0.1)):0;
        const c=fl?'#ffffff':ch?`rgba(57,196,0,${0.6+pulse*0.4})`:'#1a3a1a';
        gl(c,ch?14:2);ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(WALL_L+3,ky);ctx.lineTo(WALL_L+15,ky-9);ctx.lineTo(WALL_L+15,ky+9);ctx.closePath();ctx.fill();ng();
        if(!ch){const pct=s.kbHits/KB_NEEDED;ctx.fillStyle='#0a1a0a';ctx.fillRect(WALL_L+2,ky+13,18,4);ctx.fillStyle='#39c400';ctx.fillRect(WALL_L+2,ky+13,18*pct,4);}
      }

      // ── Ball save indicator ───────────────────────────────────────────────
      if(s.ballSaveTimer>0&&!s.inLane){
        const pct=s.ballSaveTimer/BALL_SAVE_FRAMES,pulse=0.5+0.5*Math.abs(Math.sin(s.tick*0.18));
        ctx.globalAlpha=pulse;gl('#39c400',12);ctx.strokeStyle='#39c400';ctx.lineWidth=2;
        ctx.fillStyle='#39c400';ctx.font='bold 11px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('● BALL SAVE ●',W/2,H-22);ctx.beginPath();ctx.arc(W/2,H-40,13,-(Math.PI/2),-(Math.PI/2)+pct*Math.PI*2);ctx.stroke();ng();ctx.globalAlpha=1;
      }

      // ── Tilt ─────────────────────────────────────────────────────────────
      if(s.tilted){
        const pulse=0.6+0.4*Math.abs(Math.sin(s.tick*0.25));ctx.globalAlpha=pulse;gl('#ff2222',18);ctx.fillStyle='#ff4444';ctx.font='bold 20px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('T I L T',W/2,H-24);ng();ctx.globalAlpha=1;
        const pct=s.tiltTimer/TILT_LOCK;ctx.fillStyle='#2a0000';ctx.fillRect(WALL_L+5,H-14,WALL_R-WALL_L-10,5);const tg2=ctx.createLinearGradient(WALL_L+5,0,WALL_R-5,0);tg2.addColorStop(0,'#cc0000');tg2.addColorStop(1,'#ff4400');ctx.fillStyle=tg2;ctx.fillRect(WALL_L+5,H-14,(WALL_R-WALL_L-10)*pct,5);
      } else if(s.tiltWarn>0&&!s.gameOver&&s.balls.length>0){ctx.fillStyle='rgba(255,120,0,0.6)';ctx.font='bold 10px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(`⚠ TILT WARNINGS: ${s.tiltWarn}/${TILT_MAX-1}`,W/2,H-7);}

      // ── GOMEZ targets ─────────────────────────────────────────────────────
      s.targets.forEach((tgt:any)=>{
        const hit=tgt.hit,c=hit?'#ffd700':'#7a5000';
        gl(c,hit?20:6);ctx.beginPath();ctx.arc(tgt.x,tgt.y,tgt.r+2,0,Math.PI*2);
        ctx.fillStyle=hit?'rgba(60,40,0,0.8)':'rgba(10,5,0,0.8)';ctx.fill();ctx.strokeStyle=hit?'#ffd700':'#5a3a00';ctx.lineWidth=hit?2:1.5;ctx.stroke();ng();
        if(hit){const ig=ctx.createRadialGradient(tgt.x,tgt.y,0,tgt.x,tgt.y,tgt.r);ig.addColorStop(0,'rgba(255,215,0,0.3)');ig.addColorStop(1,'rgba(255,140,0,0)');ctx.fillStyle=ig;ctx.beginPath();ctx.arc(tgt.x,tgt.y,tgt.r,0,Math.PI*2);ctx.fill();}
        ctx.fillStyle=hit?'#ffd700':'#b87a00';ctx.font='bold 10px "Times New Roman",serif';ctx.textAlign='center';ctx.fillText(tgt.char,tgt.x,tgt.y+4);
      });
      gl(s.targets.every((t:any)=>t.hit)?'#ffd700':'rgba(0,0,0,0)',s.targets.every((t:any)=>t.hit)?10:0);
      ctx.fillStyle='rgba(150,100,0,0.5)';ctx.font='bold 8px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('— G · O · M · E · Z · ? —',W/2,110);ng();

      // ── Bumpers ───────────────────────────────────────────────────────────
      BUMPERS.forEach((bmp,i)=>{
        const fl=s.bumperFlash[i]>0,pulse=fl?1:0.75+0.25*Math.abs(Math.sin(s.tick*0.08+i));
        gl(fl?'#ff44ff':'#6611aa',fl?35:15);
        ctx.beginPath();ctx.arc(bmp.x,bmp.y,bmp.r+3,0,Math.PI*2);ctx.strokeStyle=fl?'rgba(255,100,255,0.6)':`rgba(120,30,200,${0.3*pulse})`;ctx.lineWidth=4;ctx.stroke();ng();
        const bg2=ctx.createRadialGradient(bmp.x-4,bmp.y-4,2,bmp.x,bmp.y,bmp.r);
        if(fl){bg2.addColorStop(0,'#3a0050');bg2.addColorStop(1,'#0d0018');}else{bg2.addColorStop(0,'#250040');bg2.addColorStop(1,'#0a0012');}
        gl(fl?'#cc44ff':'#7c22cc',fl?20:8);ctx.beginPath();ctx.arc(bmp.x,bmp.y,bmp.r,0,Math.PI*2);ctx.fillStyle=bg2;ctx.fill();ctx.strokeStyle=fl?'#cc44ff':'#7c22cc';ctx.lineWidth=2.5;ctx.stroke();ng();
        const gemG=ctx.createRadialGradient(bmp.x-2,bmp.y-2,1,bmp.x,bmp.y,bmp.r*0.5);
        if(fl){gemG.addColorStop(0,'#ffffff');gemG.addColorStop(0.3,'#ff88ff');gemG.addColorStop(1,'#9900cc');}else{gemG.addColorStop(0,'#ddaaff');gemG.addColorStop(0.4,'#aa22ff');gemG.addColorStop(1,'#440066');}
        gl(fl?'#ff44ff':'#aa00ff',fl?18:8);ctx.beginPath();ctx.arc(bmp.x,bmp.y,bmp.r*0.5,0,Math.PI*2);ctx.fillStyle=gemG;ctx.fill();ng();
        ctx.font=`${bmp.r>22?14:12}px serif`;ctx.textAlign='center';ctx.fillStyle=fl?'#fff':'rgba(230,190,255,0.85)';ctx.fillText(bmp.label,bmp.x,bmp.y+5);
        ctx.fillStyle=fl?'rgba(255,220,255,0.7)':'rgba(160,100,200,0.5)';ctx.font='bold 8px "Courier New",monospace';ctx.fillText(`${bmp.pts}`,bmp.x,bmp.y+bmp.r+9);
      });

      // ── Drop targets ──────────────────────────────────────────────────────
      // Bank header
      ctx.fillStyle='rgba(180,80,0,0.4)';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('▼  DROP TARGETS  ▼',200,320);
      s.drops.forEach((drop:any)=>{
        const fl=drop.flash>0;
        if(drop.down){
          ctx.fillStyle=fl?'rgba(255,120,0,0.5)':'rgba(40,20,0,0.5)';
          ctx.fillRect(drop.x,drop.y+drop.h-2,drop.w,3);ctx.fillStyle='rgba(80,40,0,0.3)';ctx.fillRect(drop.x,drop.y,drop.w,drop.h);
        } else {
          const c=fl?'#ff8800':'#cc4400';
          gl(c,fl?18:8);ctx.fillStyle=c;ctx.fillRect(drop.x,drop.y,drop.w,drop.h);
          ctx.fillStyle=fl?'rgba(255,200,100,0.5)':'rgba(200,80,0,0.3)';ctx.fillRect(drop.x+2,drop.y+2,drop.w-4,drop.h-4);ng();
          // Score on target
          ctx.fillStyle=fl?'#fff':'rgba(255,200,100,0.7)';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';
          ctx.fillText(`${drop.pts}`,drop.x+drop.w/2,drop.y+drop.h-1);
        }
      });

      // ── Spinner ───────────────────────────────────────────────────────────
      {
        const fl=s.spinnerFlash>0,spinning=Math.abs(s.spinnerSpin)>1;
        const c=fl||spinning?'#00ffdd':'#006655';
        gl(c,fl?18:spinning?12:5);
        const cos=Math.cos(s.spinnerAngle),sin=Math.sin(s.spinnerAngle);
        ctx.strokeStyle=c;ctx.lineWidth=fl?3:2;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(SPINNER.x-SPINNER.len*cos,SPINNER.y-SPINNER.len*sin);ctx.lineTo(SPINNER.x+SPINNER.len*cos,SPINNER.y+SPINNER.len*sin);ctx.stroke();
        // Second bar (perpendicular)
        ctx.globalAlpha=0.4;ctx.beginPath();ctx.moveTo(SPINNER.x-SPINNER.len*sin,SPINNER.y+SPINNER.len*cos);ctx.lineTo(SPINNER.x+SPINNER.len*sin,SPINNER.y-SPINNER.len*cos);ctx.stroke();ctx.globalAlpha=1;
        // Center pin
        ctx.beginPath();ctx.arc(SPINNER.x,SPINNER.y,3,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();ng();
        ctx.fillStyle=c;ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('SPINNER',SPINNER.x,SPINNER.y+16);
      }

      // ── THING target ──────────────────────────────────────────────────────
      {
        const fl=s.thingFlash>0,hit=s.thingHit,pulse=0.7+0.3*Math.abs(Math.sin(s.tick*0.06));
        gl(fl?'#ff44ff':'#8800cc',fl?30:hit?8:12);
        ctx.beginPath();ctx.arc(THING.x,THING.y,THING.r+4,0,Math.PI*2);ctx.strokeStyle=fl?'rgba(255,100,255,0.4)':`rgba(100,20,180,${pulse*0.5})`;ctx.lineWidth=2;ctx.stroke();ng();
        const tg3=ctx.createRadialGradient(THING.x-3,THING.y-3,2,THING.x,THING.y,THING.r);
        if(fl){tg3.addColorStop(0,'#2a0044');tg3.addColorStop(1,'#0d0018');}else if(hit){tg3.addColorStop(0,'#110020');tg3.addColorStop(1,'#060010');}else{tg3.addColorStop(0,'#1a0030');tg3.addColorStop(1,'#0a0018');}
        gl(fl?'#cc44ff':'#7722aa',fl?22:10);ctx.beginPath();ctx.arc(THING.x,THING.y,THING.r,0,Math.PI*2);ctx.fillStyle=tg3;ctx.fill();ctx.strokeStyle=fl?'#cc44ff':hit?'#440066':'#8833bb';ctx.lineWidth=2.5;ctx.stroke();ng();
        ctx.fillStyle=hit?'#663388':fl?'#fff':'#cc66ff';ctx.font=`${THING.r}px serif`;ctx.textAlign='center';ctx.fillText(hit?'✓':'🖐',THING.x,THING.y+THING.r*0.45);
        ctx.fillStyle=hit?'#441166':fl?'#ffaaff':'#9944cc';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(hit?'RECHARGING...':'HIT FOR MULTIBALL',THING.x,THING.y+THING.r+11);
      }

      // ── Flippers ──────────────────────────────────────────────────────────
      drawFlipper(FL,s.leftA,s.tilted?false:s.leftUp);
      drawFlipper(FR,s.rightA,s.tilted?false:s.rightUp);

      // ── Balls ─────────────────────────────────────────────────────────────
      s.balls.forEach((b:any)=>drawBall(b,s.ballFlash));
      if(s.inLane)drawBall({x:362,y:s.laneY},0);

      // ── Plunger ───────────────────────────────────────────────────────────
      if(s.inLane){
        const springTop=614+s.plunger*52;
        for(let cy=springTop;cy<698;cy+=7){const cg=ctx.createLinearGradient(355,cy,370,cy);cg.addColorStop(0,'#3a2808');cg.addColorStop(0.5,'#6a4a18');cg.addColorStop(1,'#3a2808');ctx.strokeStyle=cg;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(362,cy+3,6,2,0,0,Math.PI*2);ctx.stroke();}
        const hue=(1-s.plunger)*50+20;ctx.fillStyle=s.charging?`hsl(${hue},100%,55%)`:'#5a3800';
        gl(ctx.fillStyle,s.charging?16:4);ctx.beginPath();ctx.roundRect(352,springTop-10,20,11,4);ctx.fill();ng();
        if(s.charging&&s.plunger>0){
          const bw=(LANE_X-WALL_L-10)*s.plunger;
          ctx.fillStyle='rgba(10,5,0,0.8)';ctx.fillRect(WALL_L+5,H-20,LANE_X-WALL_L-10,10);
          const pg2=ctx.createLinearGradient(WALL_L+5,0,WALL_L+5+bw,0);pg2.addColorStop(0,`hsl(${hue},100%,40%)`);pg2.addColorStop(1,`hsl(${hue},100%,65%)`);
          gl(`hsl(${hue},100%,55%)`,10);ctx.fillStyle=pg2;ctx.fillRect(WALL_L+5,H-20,bw,10);ng();
          ctx.strokeStyle='rgba(200,144,10,0.3)';ctx.lineWidth=1;ctx.strokeRect(WALL_L+5,H-20,LANE_X-WALL_L-10,10);
        }
      }

      // ── Float texts ───────────────────────────────────────────────────────
      s.floats.forEach((f:any)=>{ctx.globalAlpha=Math.min(1,f.t/25);gl(f.color,10);ctx.fillStyle=f.color;ctx.font='bold 14px "Times New Roman",serif';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);ng();ctx.globalAlpha=1;});

      // ── Combo ─────────────────────────────────────────────────────────────
      if(s.combo>=3&&s.comboTimer>0){
        ctx.globalAlpha=Math.min(1,s.comboTimer/40);const cc=s.combo>=5?'#ff44ff':'#ffaa00';
        gl(cc,20);ctx.fillStyle=cc;ctx.font=`bold ${s.combo>=5?18:15}px "Times New Roman",serif`;ctx.textAlign='center';ctx.fillText(`${s.combo>=5?'3×':'2×'} COMBO!`,W/2,384);ng();ctx.globalAlpha=1;
      }

      // ── Multiball banner ──────────────────────────────────────────────────
      if(s.multiball&&s.balls.length>1){
        const pulse=0.6+0.4*Math.abs(Math.sin(s.tick*0.14));ctx.globalAlpha=pulse;gl('#cc44ff',14);ctx.fillStyle='#dd66ff';ctx.font='bold 13px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('✦  M U L T I B A L L  ✦',W/2,56);ng();ctx.globalAlpha=1;
      }

      // ── HUD ───────────────────────────────────────────────────────────────
      const hudG=ctx.createLinearGradient(0,0,0,40);hudG.addColorStop(0,'#100008');hudG.addColorStop(1,'rgba(10,0,8,0.95)');ctx.fillStyle=hudG;ctx.fillRect(0,0,W,40);
      gl('#c8900a',8);ctx.strokeStyle='#c8900a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,40);ctx.lineTo(W,40);ctx.stroke();ng();
      gl('#c8900a',8);ctx.fillStyle='#c8900a';ctx.font='bold 14px "Courier New",monospace';ctx.textAlign='left';ctx.fillText(s.score.toString().padStart(8,'0'),30,26);ng();
      for(let i=0;i<s.lives;i++){gl('#cc1144',8);ctx.fillStyle='#cc1144';ctx.font='14px serif';ctx.textAlign='left';ctx.fillText('♥',W-28-(s.lives-1-i)*18,27);ng();}
      ctx.textAlign='center';ctx.fillStyle='#5a3800';ctx.font='9px "Courier New",monospace';ctx.fillText(`HI  ${s.highScore.toString().padStart(8,'0')}`,W/2,22);
      ctx.fillStyle='rgba(200,144,10,0.22)';ctx.font='7px "Courier New",monospace';ctx.fillText('ADDAMS MANSION',W/2,33);

      // Hints
      if(!s.tilted&&!s.gameOver&&s.balls.length>0&&s.ballSaveTimer===0){ctx.fillStyle='rgba(57,196,0,0.28)';ctx.font='9px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('Z/← LEFT   SPACE LAUNCH   RIGHT →/X   (mash=TILT)',W/2,H-6);}
      if(s.inLane&&!s.gameOver){const glow=0.5+0.5*Math.abs(Math.sin(s.tick*0.08));ctx.fillStyle=`rgba(200,144,10,${glow*0.65})`;ctx.font='10px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('▼  HOLD SPACE TO CHARGE  ·  RELEASE TO LAUNCH  ▼',W/2,H-6);}

      // ── Game Over ──────────────────────────────────────────────────────────
      if(s.gameOver){
        const goG=ctx.createRadialGradient(W/2,H/2,50,W/2,H/2,W);goG.addColorStop(0,'rgba(5,0,10,0.82)');goG.addColorStop(1,'rgba(0,0,5,0.96)');ctx.fillStyle=goG;ctx.fillRect(0,0,W,H);
        gl('#aa00cc',40);ctx.fillStyle='#cc44ff';ctx.font='bold 42px "Times New Roman",serif';ctx.textAlign='center';ctx.fillText("THEY'RE CREEPY!",W/2,H/2-52);ng();
        gl('#cc1144',20);ctx.fillStyle='#cc1144';ctx.font='bold 24px "Times New Roman",serif';ctx.fillText("AND THEY'RE KOOKY…",W/2,H/2-20);ng();
        ctx.strokeStyle='#c8900a';ctx.lineWidth=1;ctx.strokeRect(W/2-90,H/2-4,180,56);ctx.fillStyle='rgba(10,0,5,0.6)';ctx.fillRect(W/2-90,H/2-4,180,56);
        gl('#c8900a',6);ctx.fillStyle='#c8900a';ctx.font='14px "Courier New",monospace';ctx.fillText(`SCORE  ${s.score.toString().padStart(8,'0')}`,W/2,H/2+18);ng();
        gl('#ffd700',6);ctx.fillStyle='#ffd700';ctx.fillText(`BEST   ${s.highScore.toString().padStart(8,'0')}`,W/2,H/2+40);ng();
        if(Math.floor(Date.now()/600)%2===0){gl('#ffffff',4);ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='12px "Courier New",monospace';ctx.fillText('PRESS SPACE / TAP TO PLAY AGAIN',W/2,H/2+80);ng();}
      }

      // Vignette + scanlines
      const vig=ctx.createRadialGradient(W/2,H/2,H*0.3,W/2,H/2,H*0.75);vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(0,0,0,0.55)');ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);
      ctx.fillStyle='rgba(0,0,0,0.04)';for(let y=0;y<H;y+=2)ctx.fillRect(0,y,W,1);
      ctx.restore();
    }

    function loop(){update();draw();animRef.current=requestAnimationFrame(loop);}

    // ── Input ─────────────────────────────────────────────────────────────────
    function onKeyDown(e:KeyboardEvent){
      const s=sRef.current;ensureMusic();
      if(['ArrowLeft','z','Z'].includes(e.key))s.leftUp=true;
      if(['ArrowRight','/','?','x','X'].includes(e.key))s.rightUp=true;
      if(e.key===' '||e.key==='ArrowDown'){e.preventDefault();if(s.gameOver){sRef.current=mkState();return;}if(s.inLane)s.charging=true;}
    }
    function onKeyUp(e:KeyboardEvent){
      const s=sRef.current;
      if(['ArrowLeft','z','Z'].includes(e.key))s.leftUp=false;
      if(['ArrowRight','/','?','x','X'].includes(e.key))s.rightUp=false;
      if((e.key===' '||e.key==='ArrowDown')&&s.inLane&&s.charging){
        e.preventDefault();sfx('launch',s.plunger);
        s.balls.push({x:362,y:s.laneY,vx:-0.3,vy:-(s.plunger*19+5),fromLane:true});
        s.inLane=false;s.charging=false;s.plunger=0;s.ballSaveTimer=BALL_SAVE_FRAMES;
      }
    }
    function onTouchStart(e:TouchEvent){
      e.preventDefault();const s=sRef.current;ensureMusic();
      if(s.gameOver){sRef.current=mkState();return;}
      const rect=canvas.getBoundingClientRect();
      Array.from(e.touches).forEach((t:Touch)=>{if(t.clientX-rect.left<W/2)s.leftUp=true;else s.rightUp=true;});
      if(s.inLane)s.charging=true;
    }
    function onTouchEnd(e:TouchEvent){
      e.preventDefault();const s=sRef.current;
      const rect=canvas.getBoundingClientRect();const ts=Array.from(e.touches);
      if(!ts.some((t:any)=>t.clientX-rect.left<W/2))s.leftUp=false;
      if(!ts.some((t:any)=>t.clientX-rect.left>=W/2))s.rightUp=false;
      if(ts.length===0&&s.inLane&&s.charging){
        sfx('launch',s.plunger);s.balls.push({x:362,y:s.laneY,vx:-0.3,vy:-(s.plunger*19+5),fromLane:true});
        s.inLane=false;s.charging=false;s.plunger=0;s.ballSaveTimer=BALL_SAVE_FRAMES;
      }
    }

    window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);
    canvas.addEventListener('touchstart',onTouchStart,{passive:false});
    canvas.addEventListener('touchend',onTouchEnd,{passive:false});
    canvas.addEventListener('touchcancel',onTouchEnd,{passive:false});
    animRef.current=requestAnimationFrame(loop);

    return ()=>{
      clearInterval(batInt);cancelAnimationFrame(animRef.current!);audioRef.current?.stopMusic();
      window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);
      canvas.removeEventListener('touchstart',onTouchStart);canvas.removeEventListener('touchend',onTouchEnd);canvas.removeEventListener('touchcancel',onTouchEnd);
    };
  },[mkState]);

  function toggleMute(){muteRef.current=!muteRef.current;setMuted(muteRef.current);if(audioRef.current)audioRef.current.master.gain.setValueAtTime(muteRef.current?0:0.7,audioRef.current.ac.currentTime);if(muteRef.current)audioRef.current?.stopMusic();}
  function toggleMusic(){const a=audioRef.current;if(!a)return;if(a.isPlaying){a.stopMusic();setMusicOn(false);}else{a.startMusic();setMusicOn(true);}}
  const btn:React.CSSProperties={background:'none',border:'1px solid #5a3a00',borderRadius:4,color:'#c8900a',cursor:'pointer',fontSize:14,padding:'2px 8px',lineHeight:'1',fontFamily:'"Courier New",monospace'};

  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'radial-gradient(ellipse at 50% 60%,#1a0028 0%,#060008 60%,#020004 100%)',userSelect:'none'}}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:10,fontFamily:'"Times New Roman",serif'}}>
        <span style={{color:'#7c22cc',fontSize:20,filter:'drop-shadow(0 0 6px #7c22cc)'}}>🕷</span>
        <div style={{textAlign:'center'}}>
          <div style={{color:'#c8900a',fontSize:24,fontWeight:'bold',letterSpacing:5,textShadow:'0 0 20px #c8900a,0 0 40px #c8900a88,0 0 60px #c8900a44'}}>ADDAMS MANSION</div>
          <div style={{color:'#7c22cc',fontSize:10,letterSpacing:8,marginTop:1,textShadow:'0 0 10px #7c22cc'}}>✦  P I N B A L L  ✦</div>
        </div>
        <span style={{color:'#7c22cc',fontSize:20,filter:'drop-shadow(0 0 6px #7c22cc)'}}>🕷</span>
        <div style={{display:'flex',gap:6,marginLeft:12}}>
          <button onClick={toggleMute} style={btn}>{muted?'🔇':'🔊'}</button>
          <button onClick={toggleMusic} style={btn}>{musicOn?'⏸':'▶'}</button>
        </div>
      </div>
      <div style={{position:'relative',boxShadow:'0 0 60px rgba(124,34,204,0.5),0 0 120px rgba(200,144,10,0.2)',borderRadius:4}}>
        <canvas ref={canvasRef} width={W} height={H} style={{display:'block',touchAction:'none',border:'3px solid #c8900a',borderRadius:3,cursor:'default'}}/>
        <div style={{position:'absolute',top:0,left:-12,width:10,height:'100%',background:'linear-gradient(to right,#0a0010,#1a0030)',borderLeft:'1px solid #5a3000',borderRadius:'4px 0 0 4px'}}/>
        <div style={{position:'absolute',top:0,right:-12,width:10,height:'100%',background:'linear-gradient(to left,#0a0010,#1a0030)',borderRight:'1px solid #5a3000',borderRadius:'0 4px 4px 0'}}/>
      </div>
      <div style={{marginTop:12,display:'flex',gap:22,fontFamily:'"Courier New",monospace',fontSize:10,letterSpacing:1}}>
        <span style={{color:'#39c400',textShadow:'0 0 6px #39c400'}}>Z/← LEFT</span>
        <span style={{color:'#c8900a'}}>SPACE LAUNCH</span>
        <span style={{color:'#39c400',textShadow:'0 0 6px #39c400'}}>RIGHT →/X</span>
        <span style={{color:'#cc1144'}}>MASH=TILT!</span>
      </div>
      <div style={{marginTop:5,color:'#3a1a5a',fontFamily:'"Times New Roman",serif',fontSize:11,fontStyle:'italic',textAlign:'center'}}>
        ▲ Shoot ramps for 500pts &nbsp;·&nbsp; 🖐 THING = Multiball &nbsp;·&nbsp; ▼ Drop targets &nbsp;·&nbsp; Spell G·O·M·E·Z·?
      </div>
    </div>
  );
}
