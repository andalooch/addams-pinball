'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

const W=400,H=700,BALL_R=9,GRAVITY=0.29;
const WALL_L=22,WALL_R=378,LANE_X=346;
const BALL_SAVE_FRAMES=210,TILT_THRESH=7,TILT_MAX=3,TILT_LOCK=300,KB_NEEDED=8;
const RAMP_SPEED=0.014,RAMP_MIN_VY=-8;
const MODE_DURATION=1800,SKILL_SHOT_FRAMES=300;

type P=[number,number];
function bez(p0:P,p1:P,p2:P,p3:P,t:number){const m=1-t;return{x:m*m*m*p0[0]+3*m*m*t*p1[0]+3*m*t*t*p2[0]+t*t*t*p3[0],y:m*m*m*p0[1]+3*m*m*t*p1[1]+3*m*t*t*p2[1]+t*t*t*p3[1]};}
function drawBez(c:CanvasRenderingContext2D,p0:P,p1:P,p2:P,p3:P){c.beginPath();c.moveTo(p0[0],p0[1]);c.bezierCurveTo(p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]);c.stroke();}
function fpEnd(f:any,a:number){return{x:f.px+Math.cos(a)*f.len,y:f.py+Math.sin(a)*f.len};}
function closestOnSeg(ax:number,ay:number,bx:number,by:number,px:number,py:number){const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;if(!l2)return{x:ax,y:ay};const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2));return{x:ax+t*dx,y:ay+t*dy};}
function reflectSeg(ball:any,ax:number,ay:number,bx:number,by:number,boost=1){const cp=closestOnSeg(ax,ay,bx,by,ball.x,ball.y);const dx=ball.x-cp.x,dy=ball.y-cp.y,dist=Math.sqrt(dx*dx+dy*dy),min=BALL_R+3;if(dist<min&&dist>0){const nx=dx/dist,ny=dy/dist;ball.x=cp.x+nx*(min+0.5);ball.y=cp.y+ny*(min+0.5);const dot=ball.vx*nx+ball.vy*ny;if(dot<0){ball.vx=(ball.vx-2*dot*nx)*boost;ball.vy=(ball.vy-2*dot*ny)*boost;}return true;}return false;}

const FL={px:122,py:626,len:68,downA:0.50,upA:-0.46};
const FR={px:278,py:626,len:68,downA:Math.PI-0.50,upA:Math.PI+0.46};
const SLINGS:number[][]  =[[WALL_L,368,WALL_L+58,502],[WALL_R,368,WALL_R-58,502]];
const L_OUT:number[]=[68,550,68,648];
const L_IN:number[] =[102,536,102,640];
const R_IN:number[] =[298,536,298,640];
const L_TRANS:number[]=[WALL_L+58,502,68,550];
const R_TRANS:number[]=[WALL_R-58,502,332,550];
const L_ITRANS:number[]=[68,550,102,536];
const R_ITRANS:number[]=[332,550,298,536];
const LRAMP_PATH:P[]=[[62,395],[34,230],[30,82],[148,54]];
const RRAMP_PATH:P[]=[[338,395],[366,230],[370,82],[252,54]];
const LRAMP_GUARD:number[]=[62,502,58,310];
const RRAMP_GUARD:number[]=[338,502,342,310];
const KB_ZONE={xMax:WALL_L+40,yMin:552};

// 6-bumper cluster (upper right, like real machine)
const BUMPERS=[
  {x:256,y:180,r:22,pts:100,label:'⚡',col:'#ff2200'},
  {x:292,y:210,r:22,pts:100,label:'☠',col:'#aa00ff'},
  {x:276,y:252,r:22,pts:100,label:'🕷',col:'#0066ff'},
  {x:234,y:262,r:22,pts:100,label:'⚡',col:'#ff6600'},
  {x:210,y:225,r:22,pts:100,label:'☠',col:'#ff0066'},
  {x:240,y:192,r:22,pts:100,label:'🕷',col:'#00cc44'},
];

// GOMEZ targets – left side arc
const TARGETS_DEF=[
  {x:74,y:158,r:11,pts:25,char:'G'},
  {x:100,y:136,r:11,pts:25,char:'O'},
  {x:132,y:120,r:11,pts:25,char:'M'},
  {x:165,y:112,r:11,pts:25,char:'E'},
  {x:198,y:108,r:11,pts:25,char:'Z'},
];

// Bear trap centerpiece (animated jaws)
const BEAR_TRAP={x:160,y:390,r:20,pts:500};

// Swamp scoop – left mid (like real machine's swamp)
const SWAMP={x:80,y:450,r:16,pts:300};

// Vault lock holes (3 locks → multiball) – right side
const LOCK_HOLES=[
  {x:318,y:330,r:13},{x:318,y:358,r:13},{x:318,y:386,r:13},
];

// Drop targets – horizontal bank
const DROPS_DEF=[
  {x:142,y:310,w:26,h:10,pts:75,down:false,flash:0},
  {x:172,y:310,w:26,h:10,pts:75,down:false,flash:0},
  {x:202,y:310,w:26,h:10,pts:75,down:false,flash:0},
  {x:232,y:310,w:26,h:10,pts:75,down:false,flash:0},
];

// Spinner
const SPINNER={x:162,y:355,len:20};

// Top lanes
const TOP_LANES_DEF=[
  {cx:96,cy:56,r:13,lit:false,pts:50,flash:0},
  {cx:200,cy:56,r:13,lit:false,pts:50,flash:0},
  {cx:304,cy:56,r:13,lit:false,pts:50,flash:0},
];

const LORBIT={cx:WALL_L+14,cy:72,r:14,pts:300};
const RORBIT={cx:WALL_R-14,cy:72,r:14,pts:300};

// Extra ball (upper-left standalone target)
const XBALL_TARGET={x:78,y:220,r:13};

// Inlane rollovers
const INLANE_ROLLOVERS=[
  {x:90,y:594,r:11,side:'L',lit:false,pts:200},
  {x:310,y:594,r:11,side:'R',lit:false,pts:200},
];

// ── 3 Lightning bolt standup targets (left mid, forces left-side play) ──────
const STANDUPS_DEF=[
  {x:64,y:252,r:11,pts:150,char:'⚡',hit:false,flash:0},
  {x:64,y:280,r:11,pts:150,char:'⚡',hit:false,flash:0},
  {x:64,y:308,r:11,pts:150,char:'⚡',hit:false,flash:0},
];

// ── Insert light positions (the lit circles/diamonds across the felt) ─────────
const INSERTS_ALL=[
  // Flipper lane arrows
  {x:125,y:558,type:'arrow',ang:2.05,col:'#44ff44',glow:false},
  {x:145,y:548,type:'arrow',ang:2.05,col:'#44ff44',glow:false},
  {x:255,y:548,type:'arrow',ang:1.09,col:'#44ff44',glow:false},
  {x:275,y:558,type:'arrow',ang:1.09,col:'#44ff44',glow:false},
  // Bumper zone diamonds
  {x:218,y:162,type:'diamond',col:'#ff2200',glow:false},
  {x:246,y:157,type:'diamond',col:'#aa00ff',glow:false},
  {x:274,y:162,type:'diamond',col:'#0066ff',glow:false},
  {x:232,y:145,type:'diamond',col:'#ff6600',glow:false},
  {x:260,y:145,type:'diamond',col:'#ff0066',glow:false},
  // Center lane dots
  {x:160,y:428,type:'circle',col:'#ff8800',glow:false},
  {x:200,y:436,type:'circle',col:'#ff8800',glow:false},
  {x:240,y:428,type:'circle',col:'#ff8800',glow:false},
  {x:180,y:456,type:'circle',col:'#cc6600',glow:false},
  {x:220,y:456,type:'circle',col:'#cc6600',glow:false},
  // Orbit circles
  {x:48,y:108,type:'circle',col:'#00ccff',glow:false},
  {x:352,y:108,type:'circle',col:'#00ccff',glow:false},
  // Ramp arrows
  {x:78,y:418,type:'arrow',ang:3.55,col:'#44aaff',glow:false},
  {x:92,y:398,type:'arrow',ang:3.55,col:'#44aaff',glow:false},
  {x:322,y:418,type:'arrow',ang:5.73,col:'#ff6644',glow:false},
  {x:308,y:398,type:'arrow',ang:5.73,col:'#ff6644',glow:false},
  // GOMEZ area stars
  {x:88,y:175,type:'star',col:'#ffd700',glow:false},
  {x:108,y:152,type:'star',col:'#ffd700',glow:false},
  {x:142,y:134,type:'star',col:'#ffd700',glow:false},
  {x:176,y:124,type:'star',col:'#ffd700',glow:false},
  {x:208,y:120,type:'star',col:'#ffd700',glow:false},
  // Side dots
  {x:42,y:220,type:'circle',col:'#ff4488',glow:false},
  {x:42,y:260,type:'circle',col:'#ff4488',glow:false},
  {x:358,y:220,type:'circle',col:'#4488ff',glow:false},
  {x:358,y:260,type:'circle',col:'#4488ff',glow:false},
  // Bottom arcs
  {x:120,y:520,type:'diamond',col:'#44ff88',glow:false},
  {x:200,y:515,type:'diamond',col:'#44ff88',glow:false},
  {x:280,y:520,type:'diamond',col:'#44ff88',glow:false},
];

// ── Modes
const MODES=[
  {name:'FESTER',color:'#ff8800',desc:'Bumpers 3×',accent:'#ff4400'},
  {name:'WEDNESDAY',color:'#00ccff',desc:'Drops 4×',accent:'#0088aa'},
  {name:'PUGSLEY',color:'#ff4488',desc:'Ramps Jackpot',accent:'#cc0033'},
  {name:'MORTICIA',color:'#cc44ff',desc:'Trap Frenzy',accent:'#8800cc'},
  {name:'LURCH',color:'#44ff88',desc:'Everything 5×',accent:'#00aa44'},
];

// ── Gothic diminished theme (BPM=104, chromatic descending bass) ────────────
// Plunger skill shot zones (power ranges for skill shot)
const SKILL_ZONES=[
  {name:'ORBIT',   min:0.28,max:0.52,color:'#00ccff', vx:-1.8, vyMult:1.0},
  {name:'TOP LANE',min:0.56,max:0.76,color:'#ffd700', vx:-0.6, vyMult:1.0},
  {name:'RAMP',    min:0.82,max:1.00,color:'#ff4488', vx:-0.2, vyMult:1.0},
];
const BPM=104,STEP=60/BPM/4,_=0;
// Chromatic bass: E2→Eb2→D2→Db2→C2→B1→C2→E2 (descending ominous line)
const BASS=[82.4,_,_,_,77.8,_,_,_,73.4,_,_,_,69.3,_,_,_,65.4,_,_,_,61.7,_,_,_,65.4,_,_,_,82.4,_,_,_];
// Tritone/diminished lead: sparse, eerie
const LEAD=[_,_,_,_,246.9,_,233.1,_,_,_,_,_,207.7,_,_,_,_,_,_,_,185,_,_,174.6,_,_,_,_,196,_,_,_];
// Diminished 7th chord stabs on beats 1 & 3
const CHORD_S=new Set([0,8,16,24]);
// Gothic "snap" — clicks on the upbeats
const SNAP=[_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1,_,_,_,1];
function vibe(p:number|number[]){if(navigator?.vibrate)navigator.vibrate(p as any);}

// ── Playfield backdrop ────────────────────────────────────────────────────────
function buildBackdrop(modeColor='none'):HTMLCanvasElement{
  const oc=document.createElement('canvas');oc.width=W;oc.height=H;
  const c=oc.getContext('2d')!;
  const bg=c.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#000520');bg.addColorStop(0.5,'#00020f');bg.addColorStop(1,'#000108');c.fillStyle=bg;c.fillRect(0,0,W,H);
  const felt=c.createRadialGradient(200,350,40,200,350,300);felt.addColorStop(0,'#071830');felt.addColorStop(0.5,'#040e1c');felt.addColorStop(1,'#020810');
  c.fillStyle=felt;c.beginPath();c.moveTo(WALL_L,40);c.lineTo(WALL_R,40);c.lineTo(WALL_R,H);c.lineTo(WALL_L,H);c.closePath();c.fill();
  c.globalAlpha=0.035;for(let i=0;i<400;i++){const x=WALL_L+Math.random()*(WALL_R-WALL_L),y=40+Math.random()*(H-40),len=2+Math.random()*5,ang=Math.random()*Math.PI;c.strokeStyle=Math.random()>0.5?'#fff':'#000';c.lineWidth=0.5;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(ang)*len,y+Math.sin(ang)*len);c.stroke();}c.globalAlpha=1;
  c.save();c.beginPath();c.moveTo(66,505);c.bezierCurveTo(60,300,44,92,150,55);c.lineTo(250,55);c.bezierCurveTo(356,92,340,300,334,505);c.closePath();const upG=c.createLinearGradient(200,50,200,320);upG.addColorStop(0,'rgba(0,25,60,0.95)');upG.addColorStop(1,'rgba(0,14,36,0.9)');c.fillStyle=upG;c.fill();c.restore();
  // Wall filigree
  c.strokeStyle='rgba(200,144,10,0.12)';c.lineWidth=1.5;c.beginPath();c.moveTo(WALL_L+4,42);c.lineTo(WALL_L+4,H);c.stroke();c.beginPath();c.moveTo(WALL_R-4,42);c.lineTo(WALL_R-4,H);c.stroke();
  for(let y=100;y<H-80;y+=60){c.strokeStyle='rgba(200,144,10,0.1)';c.lineWidth=1;c.beginPath();c.moveTo(WALL_L+6,y);c.quadraticCurveTo(WALL_L+18,y+12,WALL_L+6,y+24);c.stroke();c.beginPath();c.moveTo(WALL_R-6,y);c.quadraticCurveTo(WALL_R-18,y+12,WALL_R-6,y+24);c.stroke();}
  // Mansion
  c.fillStyle='rgba(6,2,14,0.82)';c.fillRect(98,212,160,160);
  c.fillStyle='rgba(2,0,6,0.9)';c.beginPath();c.moveTo(164,372);c.lineTo(164,280);c.quadraticCurveTo(200,255,236,280);c.lineTo(236,372);c.fill();
  c.fillStyle='rgba(200,150,10,0.5)';c.beginPath();c.moveTo(193,257);c.lineTo(200,248);c.lineTo(207,257);c.closePath();c.fill();
  c.strokeStyle='rgba(200,150,10,0.3)';c.lineWidth=0.8;c.beginPath();c.arc(200,268,8,0,Math.PI*2);c.stroke();
  [[108,225,26,34],[226,225,26,34],[110,288,18,24],[232,288,18,24],[190,248,14,20],[170,295,12,16]].forEach(([x,y,w,h])=>{const wg=c.createRadialGradient(x+w/2,y+h/2,0,x+w/2,y+h/2,Math.max(w,h));wg.addColorStop(0,'rgba(255,210,80,0.22)');wg.addColorStop(1,'rgba(255,100,0,0)');c.fillStyle=wg;c.fillRect(x-12,y-12,w+24,h+24);c.fillStyle='rgba(255,170,30,0.14)';c.fillRect(x,y,w,h);c.strokeStyle='rgba(200,144,10,0.4)';c.lineWidth=0.8;c.strokeRect(x,y,w,h);c.strokeStyle='rgba(200,144,10,0.2)';c.lineWidth=0.5;c.beginPath();c.moveTo(x+w/2,y);c.lineTo(x+w/2,y+h);c.moveTo(x,y+h/2);c.lineTo(x+w,y+h/2);c.stroke();});
  c.fillStyle='rgba(5,1,12,0.85)';c.fillRect(86,168,30,205);c.beginPath();c.moveTo(86,168);c.lineTo(101,138);c.lineTo(116,168);c.closePath();c.fill();c.fillStyle='rgba(255,160,20,0.12)';c.fillRect(92,185,18,22);c.fillRect(92,228,18,22);c.strokeStyle='rgba(200,144,10,0.3)';c.lineWidth=0.6;c.strokeRect(92,185,18,22);c.strokeRect(92,228,18,22);for(let i=0;i<5;i++){c.fillStyle='rgba(5,1,12,0.9)';c.fillRect(86+i*6,160,4,10);}
  c.fillRect(244,168,30,205);c.beginPath();c.moveTo(244,168);c.lineTo(259,138);c.lineTo(274,168);c.closePath();c.fill();c.fillStyle='rgba(255,160,20,0.12)';c.fillRect(250,185,18,22);c.fillRect(250,228,18,22);c.strokeStyle='rgba(200,144,10,0.3)';c.lineWidth=0.6;c.strokeRect(250,185,18,22);c.strokeRect(250,228,18,22);for(let i=0;i<5;i++){c.fillStyle='rgba(5,1,12,0.9)';c.fillRect(244+i*6,160,4,10);}
  c.fillStyle='rgba(3,0,8,0.9)';c.fillRect(192,174,16,44);c.beginPath();c.moveTo(186,174);c.lineTo(200,145);c.lineTo(214,174);c.closePath();c.fill();c.fillStyle='rgba(200,144,10,0.4)';c.beginPath();c.arc(200,145,3,0,Math.PI*2);c.fill();
  c.fillStyle='rgba(200,144,10,0.28)';c.font='italic 9px "Times New Roman",serif';c.textAlign='center';c.fillText('THE ADDAMS MANSION',200,338);
  [[116,376],[134,380],[152,377],[170,376],[188,378],[206,375]].forEach(([gx,gy])=>{c.fillStyle='rgba(30,15,50,0.7)';c.fillRect(gx,gy,9,18);c.beginPath();c.arc(gx+4.5,gy,4.5,Math.PI,0);c.fill();});
  // Stars, webs, candles
  c.fillStyle='rgba(255,255,255,0.45)';for(let i=0;i<50;i++){const x=WALL_L+Math.random()*(WALL_R-WALL_L),y=42+Math.random()*(H-80),r=Math.random()*0.7+0.15;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
  function web(cx:number,cy:number,r:number,segs=7){c.strokeStyle='rgba(100,50,140,0.16)';c.lineWidth=0.6;for(let i=0;i<segs;i++){const a=i/segs*Math.PI*2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);c.stroke();}for(let rn=1;rn<=4;rn++){c.beginPath();for(let i=0;i<segs;i++){const a=i/segs*Math.PI*2,x=cx+Math.cos(a)*r*(rn/4),y=cy+Math.sin(a)*r*(rn/4);i===0?c.moveTo(x,y):c.lineTo(x,y);}c.closePath();c.stroke();}}
  web(WALL_L+16,50,28);web(WALL_R-16,50,28);web(WALL_L+8,350,18,6);
  function cndl(x:number,y:number){c.strokeStyle='rgba(200,144,10,0.16)';c.lineWidth=1;c.beginPath();c.moveTo(x-8,y+28);c.lineTo(x+8,y+28);c.stroke();c.beginPath();c.moveTo(x,y+28);c.lineTo(x,y+8);c.stroke();c.beginPath();c.moveTo(x-8,y+14);c.lineTo(x-8,y+6);c.moveTo(x+8,y+14);c.lineTo(x+8,y+6);c.moveTo(x-8,y+14);c.lineTo(x+8,y+14);c.stroke();[[x-8,y+5],[x,y+7],[x+8,y+5]].forEach(([fx,fy])=>{const fg=c.createRadialGradient(fx,fy,0,fx,fy,7);fg.addColorStop(0,'rgba(255,200,80,0.25)');fg.addColorStop(1,'rgba(255,90,0,0)');c.fillStyle=fg;c.beginPath();c.arc(fx,fy,7,0,Math.PI*2);c.fill();});}
  cndl(WALL_L+8,420);cndl(WALL_L+8,488);cndl(WALL_R-8,420);cndl(WALL_R-8,488);
  // Zone halos
  const bZ=c.createRadialGradient(252,218,0,252,218,78);bZ.addColorStop(0,'rgba(15,8,35,0.55)');bZ.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=bZ;c.beginPath();c.arc(252,218,78,0,Math.PI*2);c.fill();
  const sZ=c.createRadialGradient(80,450,0,80,450,32);sZ.addColorStop(0,'rgba(0,35,8,0.55)');sZ.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=sZ;c.beginPath();c.arc(80,450,32,0,Math.PI*2);c.fill();
  const vZ=c.createRadialGradient(318,358,0,318,358,38);vZ.addColorStop(0,'rgba(35,0,45,0.5)');vZ.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=vZ;c.beginPath();c.arc(318,358,38,0,Math.PI*2);c.fill();
  const tZ=c.createRadialGradient(160,390,0,160,390,30);tZ.addColorStop(0,'rgba(25,8,0,0.5)');tZ.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=tZ;c.beginPath();c.arc(160,390,30,0,Math.PI*2);c.fill();
  // Static inserts
  function di(x:number,y:number,type:string,col:string){const dim='rgba(255,255,255,0.06)';if(type==='diamond'){c.save();c.translate(x,y);c.rotate(Math.PI/4);c.fillStyle=dim;c.strokeStyle=col+'33';c.lineWidth=0.8;c.beginPath();c.rect(-5,-5,10,10);c.fill();c.stroke();c.restore();}else if(type==='arrow'){c.fillStyle=dim;c.strokeStyle=col+'33';c.lineWidth=0.8;c.beginPath();c.moveTo(x,y-7);c.lineTo(x+5,y+4);c.lineTo(x-5,y+4);c.closePath();c.fill();c.stroke();}else if(type==='star'){c.fillStyle=dim;c.strokeStyle=col+'33';c.lineWidth=0.8;c.beginPath();for(let i=0;i<5;i++){const a=i/5*Math.PI*2-Math.PI/2,b=a+Math.PI/5;c.lineTo(x+Math.cos(a)*6,y+Math.sin(a)*6);c.lineTo(x+Math.cos(b)*3,y+Math.sin(b)*3);}c.closePath();c.fill();c.stroke();}else{c.beginPath();c.arc(x,y,5,0,Math.PI*2);c.fillStyle=dim;c.strokeStyle=col+'33';c.lineWidth=0.8;c.fill();c.stroke();}}
  INSERTS_ALL.forEach(ins=>di(ins.x,ins.y,ins.type,ins.col));
  if(modeColor!=='none'){const mg=c.createRadialGradient(200,350,0,200,350,280);mg.addColorStop(0,modeColor+'1a');mg.addColorStop(1,'transparent');c.fillStyle=mg;c.fillRect(WALL_L,40,WALL_R-WALL_L,H-40);}
  return oc;
}


let _sharedAC:AudioContext|null=null;
function getSharedAC():AudioContext{
  if(!_sharedAC){
    const AC=(window as any).AudioContext||(window as any).webkitAudioContext;
    _sharedAC=new AC() as AudioContext;
  }
  return _sharedAC!;
}
function resumeAC(){
  if(!_sharedAC)return;
  if(_sharedAC.state!=='running'){
    _sharedAC.resume().catch(()=>{});
    // Play a real inaudible tone — required on iOS 16+
    try{
      const g=_sharedAC.createGain();g.gain.value=0.0001;g.connect(_sharedAC.destination);
      const o=_sharedAC.createOscillator();o.connect(g);o.start();o.stop(_sharedAC.currentTime+0.001);
    }catch(e){}
  }
}
// Unlock on page visibility restore (iOS suspends context on background)
if(typeof document!=='undefined'){document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeAC();});}

function buildAudio(){
  const ac=getSharedAC();
  const master=ac.createGain();master.gain.value=0.72;
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=5;comp.connect(master);master.connect(ac.destination);
  const mG=ac.createGain();mG.gain.value=0.42;mG.connect(comp);
  const sG=ac.createGain();sG.gain.value=1.0;sG.connect(comp);
  function osc(d:any,type:any,f:number,v:number,dur:number,fE?:number,t=ac.currentTime){
    if(ac.state!=='running')return; // skip if not running
    try{const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(d);o.type=type;o.frequency.setValueAtTime(f,t);if(fE)o.frequency.exponentialRampToValueAtTime(fE,t+dur*0.85);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.start(t);o.stop(t+dur+0.02);}catch(e){}
  }
  function nz(d:any,v:number,dur:number,fHz=800,Q=1,t=ac.currentTime){
    if(ac.state!=='running')return;
    try{const len=Math.ceil(ac.sampleRate*dur),buf=ac.createBuffer(1,len,ac.sampleRate),da=buf.getChannelData(0);for(let i=0;i<len;i++)da[i]=(Math.random()*2-1)*Math.pow(1-i/len,2);const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();s.buffer=buf;f.type='bandpass';f.frequency.value=fHz;f.Q.value=Q;s.connect(f);f.connect(g);g.connect(d);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.start(t);s.stop(t+dur+0.02);}catch(e){}
  }
  function pB(f:number,t:number){osc(mG,'sine',f,0.65,STEP*3.8,f*0.97,t);osc(mG,'sine',f*0.5,0.25,STEP*3.5,undefined,t);}
  function pL(f:number,t:number){osc(mG,'triangle',f,0.20,STEP*2.4,f*0.99,t);osc(mG,'sine',f*2,0.06,STEP*1.8,undefined,t);}
  function pC(t:number){[[82.4*2,0.12],[98.0,0.10],[116.5,0.09],[69.3*2,0.08]].forEach(([f,v])=>osc(mG,'sine',f,v,STEP*5.5,f*0.998,t));osc(mG,'sawtooth',41.2,0.03,STEP*4,undefined,t);}
  function pSn(t:number){nz(mG,0.22,0.025,3500,0.3,t);nz(mG,0.08,0.04,800,0.8,t);}
  const sfx={
    bumper(c:number){const b=c>=5?1.5:c>=3?1.25:1;osc(sG,'square',500*b,0.35,0.12,200*b);nz(sG,0.15,0.06,700,2);},
    sling(){osc(sG,'sawtooth',340,0.3,0.09,85);nz(sG,0.2,0.06,1300,0.8);},
    target(){osc(sG,'sine',1047,0.28,0.35,880);osc(sG,'sine',1319,0.12,0.25,1047,ac.currentTime+0.02);},
    bonus(){[523,659,784,1047,1319].forEach((f,i)=>osc(sG,'square',f,0.2,0.22,f*0.9,ac.currentTime+i*0.07));},
    flipper(){nz(sG,0.28,0.04,220,0.6);osc(sG,'sine',130,0.2,0.06,80);},
    launch(p:number){const b=90+p*280;osc(sG,'sine',b*0.4,0.5,0.05,b*1.1);osc(sG,'triangle',b,0.35,0.28,b*0.25);nz(sG,0.2,0.12,400,1.5);},
    wall(){nz(sG,0.1,0.04,500,0.5);osc(sG,'sine',180,0.07,0.04,120);},
    drain(){osc(sG,'sawtooth',380,0.35,0.7,70);osc(sG,'sine',220,0.2,0.6,60,ac.currentTime+0.05);},
    gameover(){[350,260,180,120].forEach((f,i)=>osc(sG,'sawtooth',f,0.28,0.4,f*0.7,ac.currentTime+i*0.18));},
    ballsave(){osc(sG,'sine',880,0.3,0.12,1047);osc(sG,'sine',1047,0.2,0.1,880,ac.currentTime+0.12);},
    kickback(){osc(sG,'square',200,0.4,0.08,600);nz(sG,0.35,0.1,800,1.5);},
    tiltWarn(){osc(sG,'sawtooth',150,0.3,0.15,100);},
    tilt(){[200,150,100].forEach((f,i)=>osc(sG,'sawtooth',f,0.4,0.3,f*0.6,ac.currentTime+i*0.12));},
    kbRecharge(){osc(sG,'sine',660,0.2,0.2,880);osc(sG,'sine',880,0.15,0.15,1047,ac.currentTime+0.1);},
    ramp(){[400,600,900].forEach((f,i)=>osc(sG,'square',f,0.22,0.2,f*1.1,ac.currentTime+i*0.06));},
    drop(){osc(sG,'square',220,0.3,0.08,110);nz(sG,0.2,0.05,400,1);},
    dropComplete(){[300,450,600,900].forEach((f,i)=>osc(sG,'square',f,0.2,0.15,f*1.1,ac.currentTime+i*0.055));},
    spin(){nz(sG,0.1,0.03,1500,0.5);osc(sG,'sine',800,0.08,0.04,400);},
    topLane(){osc(sG,'sine',660,0.2,0.15,880);},
    topLaneAll(){[523,659,784,1047].forEach((f,i)=>osc(sG,'sine',f,0.2,0.25,f,ac.currentTime+i*0.06));},
    orbit(){[800,1000,1200].forEach((f,i)=>osc(sG,'sine',f,0.2,0.2,f*1.1,ac.currentTime+i*0.05));},
    lock(){[400,600,800].forEach((f,i)=>osc(sG,'square',f,0.3,0.25,f*0.8,ac.currentTime+i*0.1));nz(sG,0.2,0.1,300,1);},
    multiball(){[262,330,392,523,659,784].forEach((f,i)=>osc(sG,'square',f,0.25,0.35,f,ac.currentTime+i*0.06));},
    modeStart(){[400,500,630,800,1000].forEach((f,i)=>osc(sG,'sine',f,0.22,0.3,f*1.15,ac.currentTime+i*0.07));},
    skillShot(){[800,1000,1300,1600].forEach((f,i)=>osc(sG,'square',f,0.28,0.2,f*1.1,ac.currentTime+i*0.05));},
    bearTrap(){osc(sG,'sawtooth',120,0.4,0.08,60);nz(sG,0.4,0.1,300,1.5);[300,200].forEach((f,i)=>osc(sG,'square',f,0.3,0.2,f*0.5,ac.currentTime+i*0.06));},
    swamp(){osc(sG,'sine',80,0.4,0.6,40);nz(sG,0.3,0.4,200,0.5);osc(sG,'sine',160,0.2,0.5,60,ac.currentTime+0.1);},
    xball(){[800,1000,1300,1600,2000].forEach((f,i)=>osc(sG,'square',f,0.28,0.22,f*1.1,ac.currentTime+i*0.05));nz(sG,0.3,0.2,2000,1);},
    chandHit(){osc(sG,'sine',880,0.25,0.35,660);osc(sG,'sine',1320,0.15,0.25,1100,ac.currentTime+0.02);nz(sG,0.08,0.05,3000,0.3);},
    nudge(){nz(sG,0.4,0.08,150,0.8);osc(sG,'sine',80,0.3,0.12,60);},
  };
  let ss=0,nt=0,st:any=null,ip=false;
  function sched(){
    if(ac.state!=='running'){setTimeout(sched,100);return;} // wait for context to be running
    while(nt<ac.currentTime+0.14){const s=ss%BASS.length;if(BASS[s])pB(BASS[s],nt);if(LEAD[s])pL(LEAD[s],nt);if(CHORD_S.has(s))pC(nt);if(SNAP[s])pSn(nt);ss++;nt+=STEP;}st=setTimeout(sched,40);
  }
  return{ac,master,startMusic(){if(ip)return;ip=true;nt=ac.currentTime+0.05;ss=0;sched();},stopMusic(){ip=false;clearTimeout(st);},get isPlaying(){return ip;},...sfx};
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdamsPinball(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sRef=useRef<any>(null);
  const animRef=useRef<number|null>(null);
  const audioRef=useRef<any>(null);
  const muteRef=useRef(false);
  const wallCool=useRef(0);
  const nudgeRef=useRef<(dir:'L'|'R')=>void>(()=>{});
  const bdRef=useRef<HTMLCanvasElement|null>(null);
  const [muted,setMuted]=useState(false);
  const [musicOn,setMusicOn]=useState(true);
  const [audioUnlocked,setAudioUnlocked]=useState(false);
  const [showAudioPrompt,setShowAudioPrompt]=useState(true);
  const [showInitials,setShowInitials]=useState(false);
  const [initials,setInitials]=useState('');
  const [leaderboard,setLeaderboard]=useState<{name:string,score:number}[]>([]);

  const loadLB=useCallback(()=>{try{return JSON.parse(localStorage.getItem('addams_lb')||'[]');}catch{return [];}},[] );
  const saveLB=useCallback((lb:{name:string,score:number}[])=>{try{localStorage.setItem('addams_lb',JSON.stringify(lb));}catch{}},[] );
  const qualifies=useCallback((score:number)=>{const lb=loadLB();return score>0&&(lb.length<10||score>lb[lb.length-1]?.score);},[loadLB]);
  const submitScore=useCallback((name:string,score:number)=>{
    const lb=loadLB();lb.push({name:name.toUpperCase().slice(0,3)||'???',score});
    lb.sort((a:any,b:any)=>b.score-a.score);const top=lb.slice(0,10);saveLB(top);setLeaderboard(top);setShowInitials(false);
  },[loadLB,saveLB]);

  useEffect(()=>{setLeaderboard(loadLB());},[loadLB]);

  const unlockAudio=useCallback(()=>{
    // Initialize AC in user gesture context (required for iOS)
    try{getSharedAC();}catch(e){}
    resumeAC();
    setAudioUnlocked(true);setShowAudioPrompt(false);
    const a=getAudio();
    if(a&&!a.isPlaying&&!muteRef.current)a.startMusic();
  },[]);

  function getAudio(){
    if(muteRef.current)return null;
    resumeAC(); // always try — no-op if already running
    if(!audioRef.current){try{audioRef.current=buildAudio();}catch(e){console.warn('audio fail',e);return null;}}
    return audioRef.current;
  }
  function sfx(name:string,...args:any[]){const a=getAudio();if(a&&typeof a[name]==='function')a[name](...args);}
  function ensureMusic(){
    resumeAC();
    const a=getAudio();if(!a||a.isPlaying||muteRef.current)return;
    // startMusic() checks ac.state internally and retries
    a.startMusic();
  }

  const mkState=useCallback(()=>({
    balls:[] as any[],inLane:true,charging:false,plunger:0,laneY:578,
    leftUp:false,rightUp:false,leftA:FL.downA,rightA:FR.downA,prevL:false,prevR:false,
    score:0,lives:3,gameOver:false,
    bumperFlash:new Array(BUMPERS.length).fill(0),slingFlash:[0,0],
    targets:TARGETS_DEF.map(t=>({...t,hit:false})),
    floats:[] as any[],combo:0,comboTimer:0,
    ballFlash:0,lightFrames:0,tick:0,highScore:sRef.current?.highScore??0,
    ballSaveTimer:0,kbCharged:true,kbHits:0,kbFlash:0,
    rapidPresses:0,rapidTimer:0,tiltWarn:0,tilted:false,tiltTimer:0,tiltFlash:0,
    shake:{x:0,y:0,frames:0,mag:0},bats:[] as any[],
    drops:DROPS_DEF.map(d=>({...d})),
    spinnerAngle:0,spinnerSpin:0,spinnerFlash:0,
    topLanes:TOP_LANES_DEF.map(l=>({...l})),topLaneMult:1,topLaneCompletions:0,
    lOrbitFlash:0,rOrbitFlash:0,lRampFlash:0,rRampFlash:0,rampCount:0,
    locks:[{locked:false,flash:0},{locked:false,flash:0},{locked:false,flash:0}],lockCount:0,
    multiball:false,jackpotActive:false,jackpotValue:5000,jackpotFlash:0,
    modeIdx:-1,modeTimer:0,modesCompleted:0,modeFlash:0,modeProgress:0,modeObjective:0,modeJackpot:0,
    skillShotActive:false,skillShotTimer:0,skillShotTarget:0,
    inlaneRollovers:INLANE_ROLLOVERS.map(r=>({...r})),
    extraBalls:0,xballHit:false,xballFlash:0,
    insertPulse:0,
    // End-of-ball bonus
    bonusActive:false,bonusValue:0,bonusTick:0,bonusMult:1,
    // Accumulated bonus tracking
    bumperHits:0,
    standups:STANDUPS_DEF.map(t=>({...t})),
    standupFlash:0,
    nudgeCooldown:0, // frames until next nudge allowed
    // Bear trap
    bearTrap:{captured:false,capturedBall:null as any,captureTimer:0,cooldown:0,flash:0,jawAngle:0.8,jawOpen:true,completions:0},
    // Swamp
    swamp:{captured:false,capturedBall:null as any,captureTimer:0,cooldown:0,flash:0,bubbles:[] as any[]},
    // Chandelier (still present)
    chand:{angle:0.3,angleVel:0.011,flash:0},
  }),[]);

  useEffect(()=>{
    const canvas=canvasRef.current!;
    const ctx=canvas.getContext('2d')!;
    sRef.current=mkState();
    bdRef.current=buildBackdrop();
    const batInt=setInterval(()=>{const s=sRef.current;if(s.bats.length<3)s.bats.push({x:WALL_L+Math.random()*(WALL_R-WALL_L),y:42+Math.random()*180,vx:(Math.random()-0.5)*1.1,vy:(Math.random()-0.5)*0.6,ph:Math.random()*Math.PI*2,sz:Math.random()*4+4,life:280+Math.random()*200});},2500);

    function addFloat(x:number,y:number,text:string,color='#c8900a'){sRef.current.floats.push({x,y,text,color,t:70});}
    function shake(f:number,m:number){const s=sRef.current;if(s.shake.frames<f)s.shake={x:0,y:0,frames:f,mag:m};}

    const MODE_OBJECTIVES=[20,2,4,3,30]; // bumper hits, drop banks, ramp shots, trap captures, seconds
    const MODE_OBJ_LABELS=['BUMPER HITS','DROP BANKS','RAMP SHOTS','TRAP CAPTURES','SEC LEFT'];
    function startMode(s:any,idx:number){
      s.modeIdx=idx;s.modeTimer=MODE_DURATION;s.modesCompleted++;s.modeFlash=30;
      s.modeProgress=0;s.modeObjective=MODE_OBJECTIVES[idx];
      s.modeJackpot=idx===2?1000:idx===3?500:0; // PUGSLEY ramp jackpot, MORTICIA trap jackpot
      sfx('modeStart');vibe([30,15,30,15,60]);shake(20,8);
      addFloat(200,300,`⚡ ${MODES[idx].name} MODE! ⚡`,MODES[idx].color);
      addFloat(200,340,MODES[idx].desc,'#ffffff');
      bdRef.current=buildBackdrop(MODES[idx].color);
    }
    function getMult(s:any,base=1):number{let m=base*Math.max(1,s.topLaneMult);if(s.modeIdx===4)m*=5;return m;}

    function spawnLaneBall(){const s=sRef.current;s.inLane=true;s.charging=false;s.plunger=0;s.laneY=578;s.ballSaveTimer=0;s.tiltWarn=0;s.tilted=false;s.tiltTimer=0;s.rapidPresses=0;s.rapidTimer=0;s.skillShotActive=true;s.skillShotTimer=SKILL_SHOT_FRAMES;s.skillShotTarget=Math.floor(Math.random()*SKILL_ZONES.length);}

    function checkRampEntry(ball:any,s:any){
      if(ball.onRamp||ball.vy>RAMP_MIN_VY)return;
      const le=LRAMP_PATH[0],re=RRAMP_PATH[0];
      const ldx=ball.x-le[0],ldy=ball.y-le[1];if(Math.sqrt(ldx*ldx+ldy*ldy)<42&&ball.x<130){ball.onRamp='left';ball.rampT=0;
        let lRampPts=500;if(s.modeIdx===2){s.modeJackpot+=500;s.modeProgress++;lRampPts=s.modeJackpot;if(s.modeProgress>=s.modeObjective){const bonus=getMult(s,s.modeJackpot+2000);s.score+=bonus;s.modeTimer=0;sfx('bonus');vibe([30,30,30,30,60]);shake(15,6);addFloat(90,300,`RAMP JACKPOT! +${bonus}`,'#ff4488');}}else{lRampPts=500;}
        s.score+=getMult(s,lRampPts);s.lRampFlash=40;s.rampCount++;sfx('ramp');vibe([20,15,30]);shake(6,3);addFloat(90,380,`RAMP! +${getMult(s,lRampPts)}`,'#ffaa00');}
      const rdx=ball.x-re[0],rdy=ball.y-re[1];if(Math.sqrt(rdx*rdx+rdy*rdy)<42&&ball.x>270){ball.onRamp='right';ball.rampT=0;
        let rRampPts=500;if(s.modeIdx===2){s.modeJackpot+=500;s.modeProgress++;rRampPts=s.modeJackpot;if(s.modeProgress>=s.modeObjective){const bonus=getMult(s,s.modeJackpot+2000);s.score+=bonus;s.modeTimer=0;sfx('bonus');vibe([30,30,30,30,60]);shake(15,6);addFloat(310,300,`RAMP JACKPOT! +${bonus}`,'#ff4488');}}else{rRampPts=500;}
        s.score+=getMult(s,rRampPts);s.rRampFlash=40;s.rampCount++;sfx('ramp');vibe([20,15,30]);shake(6,3);addFloat(310,380,`RAMP! +${getMult(s,rRampPts)}`,'#ffaa00');}
    }

    function tickFlippers(ball:any,s:any,pLA:number,pRA:number){
      [[FL,s.leftA,pLA,s.leftUp],[FR,s.rightA,pRA,s.rightUp]].forEach(([f,a,pa,up]:any)=>{
        const ep=fpEnd(f,a);
        const checkX=[ball.x,ball.x-ball.vx*0.5,ball.x-ball.vx*0.25];
        const checkY=[ball.y,ball.y-ball.vy*0.5,ball.y-ball.vy*0.25];
        for(let ci=0;ci<checkX.length;ci++){
          const cp=closestOnSeg(f.px,f.py,ep.x,ep.y,checkX[ci],checkY[ci]);
          const dx=checkX[ci]-cp.x,dy=checkY[ci]-cp.y,dist=Math.sqrt(dx*dx+dy*dy);
          if(dist<BALL_R+11&&dist>0){
            const nx=dx/dist,ny=dy/dist;ball.x=cp.x+nx*(BALL_R+11.5);ball.y=cp.y+ny*(BALL_R+11.5);
            const dot=ball.vx*nx+ball.vy*ny;if(dot<0){ball.vx-=2*dot*nx;ball.vy-=2*dot*ny;const av=(a-pa)*60;if(up&&(f===FL?av<-0.01:av>0.01)){ball.vx+=nx*4;ball.vy+=ny*4-7;}}break;
          }
        }
      });
    }

    function tickBall(ball:any,s:any):boolean{
      if(ball.onRamp){ball.rampT+=RAMP_SPEED;const path=ball.onRamp==='left'?LRAMP_PATH:RRAMP_PATH;const pt=bez(path[0],path[1],path[2],path[3],Math.min(1,ball.rampT));ball.x=pt.x;ball.y=pt.y;if(ball.rampT>=1){const wasLeft=ball.onRamp==='left';ball.onRamp=null;ball.rampT=0;ball.vx=wasLeft?3.5:-3.5;ball.vy=0.8;}return false;}
      // Bear trap capture
      if(s.bearTrap.captured&&s.bearTrap.capturedBall===ball){ball.x=BEAR_TRAP.x;ball.y=BEAR_TRAP.y;ball.vx=0;ball.vy=0;s.bearTrap.captureTimer--;if(s.bearTrap.captureTimer<=0){s.bearTrap.captured=false;s.bearTrap.capturedBall=null;
          s.bearTrap.cooldown=s.modeIdx===3?120:360; // MORTICIA: much faster reset
          s.bearTrap.flash=40;s.bearTrap.jawOpen=true;
          if(s.modeIdx===3){s.modeJackpot+=500;s.modeProgress++;if(s.modeProgress>=s.modeObjective){const bonus=getMult(s,s.modeJackpot+2000);s.score+=bonus;s.modeTimer=0;sfx('bonus');vibe([30,30,30,30,60]);shake(15,6);addFloat(160,300,`FRENZY JACKPOT! +${bonus}`,'#cc44ff');}}
          let pts=s.modeIdx===3?BEAR_TRAP.pts*4+s.modeJackpot:BEAR_TRAP.pts;s.score+=getMult(s,pts);sfx('bearTrap');vibe([30,15,30,15,50]);shake(12,5);addFloat(BEAR_TRAP.x,BEAR_TRAP.y-35,`TRAP! +${getMult(s,pts)}`,'#ff6600');// Eject upper-left to avoid the bumper cluster (upper-right)
const a=-Math.PI/2-(0.3+Math.random()*0.5);ball.vx=Math.cos(a)*8;ball.vy=Math.sin(a)*8;}return false;}
      // Swamp capture
      if(s.swamp.captured&&s.swamp.capturedBall===ball){ball.x=SWAMP.x;ball.y=SWAMP.y;ball.vx=0;ball.vy=0;s.swamp.captureTimer--;if(s.swamp.captureTimer<=0){s.swamp.captured=false;s.swamp.capturedBall=null;s.swamp.cooldown=300;s.swamp.flash=40;let pts=SWAMP.pts;s.score+=getMult(s,pts);sfx('swamp');vibe([20,20,20,40]);shake(8,4);addFloat(SWAMP.x+40,SWAMP.y-25,`SWAMP! +${getMult(s,pts)}`,'#44ff88');// Eject rightward-upward from swamp position (not from wall)
ball.x=SWAMP.x;ball.y=SWAMP.y;ball.vx=5+Math.random()*3;ball.vy=-(9+Math.random()*2);}return false;}
      // Physics
      ball.vy+=GRAVITY;ball.x+=ball.vx;ball.y+=ball.vy;
      const spd=Math.sqrt(ball.vx*ball.vx+ball.vy*ball.vy);
      if(spd>0.1){ball.vx*=0.9988;ball.vy*=0.9988;}if(spd>22){ball.vx=ball.vx/spd*22;ball.vy=ball.vy/spd*22;}
      if(ball.x-BALL_R<WALL_L){ball.x=WALL_L+BALL_R;ball.vx=Math.abs(ball.vx)*0.65;if(!wallCool.current){sfx('wall');vibe(12);wallCool.current=8;}}
      if(ball.x+BALL_R>WALL_R){ball.x=WALL_R-BALL_R;ball.vx=-Math.abs(ball.vx)*0.65;if(!wallCool.current){sfx('wall');vibe(12);wallCool.current=8;}}
      if(ball.y-BALL_R<40){ball.y=40+BALL_R;ball.vy=Math.abs(ball.vy)*0.65;if(!wallCool.current){sfx('wall');vibe(12);wallCool.current=8;}}
      if(!ball.fromLane&&ball.x+BALL_R>LANE_X-8&&ball.y>390){ball.x=LANE_X-8-BALL_R;ball.vx=Math.min(ball.vx,-0.5);}
      if(ball.fromLane&&ball.y<180)ball.fromLane=false;
      reflectSeg(ball,LRAMP_GUARD[0],LRAMP_GUARD[1],LRAMP_GUARD[2],LRAMP_GUARD[3],1.0);
      reflectSeg(ball,RRAMP_GUARD[0],RRAMP_GUARD[1],RRAMP_GUARD[2],RRAMP_GUARD[3],1.0);
      // Orbits
      {const dx=ball.x-LORBIT.cx,dy=ball.y-LORBIT.cy;if(Math.sqrt(dx*dx+dy*dy)<LORBIT.r+BALL_R&&ball.vy<-3){let pts=300;if(s.skillShotActive&&s.skillShotTarget===0){pts=2500;s.skillShotActive=false;sfx('skillShot');addFloat(60,90,'SKILL SHOT! +2500','#ffff00');shake(12,5);}s.lOrbitFlash=40;s.score+=getMult(s,pts);sfx('orbit');vibe(15);addFloat(50,90,`+${getMult(s,pts)}`,'#00ccff');}}
      {const dx=ball.x-RORBIT.cx,dy=ball.y-RORBIT.cy;if(Math.sqrt(dx*dx+dy*dy)<RORBIT.r+BALL_R&&ball.vy<-3){let pts=300;if(s.skillShotActive&&s.skillShotTarget===1){pts=2500;s.skillShotActive=false;sfx('skillShot');addFloat(340,90,'SKILL SHOT! +2500','#ffff00');shake(12,5);}s.rOrbitFlash=40;s.score+=getMult(s,pts);sfx('orbit');vibe(15);addFloat(350,90,`+${getMult(s,pts)}`,'#00ccff');}}
      // Top lanes
      s.topLanes.forEach((lane:any)=>{if(lane.flash>0){lane.flash--;return;}const dx=ball.x-lane.cx,dy=ball.y-lane.cy;if(Math.sqrt(dx*dx+dy*dy)<lane.r+BALL_R){if(!lane.lit){lane.lit=true;s.score+=lane.pts;sfx('topLane');addFloat(lane.cx,lane.cy,`+${lane.pts}`,'#ffd700');}lane.flash=20;if(s.topLanes.every((l:any)=>l.lit)){s.topLaneMult=Math.min(s.topLaneMult+1,6);s.topLanes.forEach((l:any)=>l.lit=false);s.topLaneCompletions++;s.score+=1000;sfx('topLaneAll');vibe([15,15,15,15,40]);addFloat(200,80,`${s.topLaneMult}× MULT! +1000`,'#ffff00');if(s.topLaneCompletions%3===0){s.extraBalls++;sfx('xball');addFloat(200,65,'EXTRA BALL!','#ffff00');shake(10,5);}}}});
      // Ramp
      checkRampEntry(ball,s);
      // BUMPERS — swept check to prevent tunneling at high speed
      BUMPERS.forEach((bmp,i)=>{
        // Test current pos AND mid-point of travel path
        const checkPositions=[
          {x:ball.x,y:ball.y},
          {x:ball.x-ball.vx*0.5,y:ball.y-ball.vy*0.5},
        ];
        for(const cp of checkPositions){
          const dx=cp.x-bmp.x,dy=cp.y-bmp.y,dist=Math.sqrt(dx*dx+dy*dy),minD=BALL_R+bmp.r;
          if(dist<minD&&dist>0){
            // Push ball out along the actual ball→bumper axis
            const bx=ball.x-bmp.x,by=ball.y-bmp.y,bd=Math.sqrt(bx*bx+by*by)||1;
            const bnx=bx/bd,bny=by/bd;
            ball.x=bmp.x+bnx*(minD+1);ball.y=bmp.y+bny*(minD+1);
            const sp=Math.max(Math.sqrt(ball.vx*ball.vx+ball.vy*ball.vy),8);ball.vx=bnx*sp*1.06;ball.vy=bny*sp*1.06;s.bumperFlash[i]=16;s.ballFlash=10;s.lightFrames=8;s.combo++;s.comboTimer=130;s.bumperHits++;
            // FESTER progress
            if(s.modeIdx===0){s.modeProgress++;if(s.modeProgress>=s.modeObjective){const bonus=getMult(s,3000);s.score+=bonus;s.modeTimer=0;sfx('bonus');vibe([30,30,30,30,60]);shake(15,6);addFloat(254,220,`FESTER JACKPOT! +${bonus}`,'#ff8800');}}let mult=getMult(s,s.combo>=5?3:s.combo>=3?2:1);if(s.modeIdx===0)mult*=3;s.score+=bmp.pts*mult;sfx('bumper',s.combo);vibe(20);shake(5,3);s.insertPulse=20;addFloat(bmp.x,bmp.y-bmp.r-10,`+${bmp.pts*mult}`,mult>2?'#ffff00':'#ff8800');if(!s.kbCharged){s.kbHits++;if(s.kbHits>=KB_NEEDED){s.kbCharged=true;s.kbHits=0;sfx('kbRecharge');}}if(s.jackpotActive&&s.multiball){s.jackpotActive=false;s.jackpotFlash=50;s.score+=s.jackpotValue;sfx('bonus');vibe([20,20,20,20,40]);shake(15,6);addFloat(bmp.x,bmp.y-50,`JACKPOT! +${s.jackpotValue}`,'#ff44ff');s.jackpotValue=Math.round(s.jackpotValue*1.5);setTimeout(()=>{if(sRef.current&&sRef.current.multiball)sRef.current.jackpotActive=true;},4000);}
            break;
          }
        }
      });
      // GOMEZ targets
      s.targets.forEach((tgt:any)=>{if(tgt.hit)return;const dx=ball.x-tgt.x,dy=ball.y-tgt.y;if(Math.sqrt(dx*dx+dy*dy)<BALL_R+tgt.r){tgt.hit=true;s.score+=getMult(s,tgt.pts);sfx('target');vibe(15);addFloat(tgt.x,tgt.y,`+${getMult(s,tgt.pts)}`,'#ffd700');if(s.targets.every((t:any)=>t.hit)){s.targets.forEach((t:any)=>t.hit=false);startMode(s,(s.modesCompleted)%MODES.length);s.score+=getMult(s,500);}}});
      // LOCK HOLES (vault)
      if(!s.multiball){LOCK_HOLES.forEach((lh,i)=>{if(s.locks[i].locked)return;const dx=ball.x-lh.x,dy=ball.y-lh.y;if(Math.sqrt(dx*dx+dy*dy)<BALL_R+lh.r){s.locks[i].locked=true;s.locks[i].flash=40;s.lockCount++;sfx('lock');vibe([20,15,30]);shake(8,4);addFloat(lh.x-20,lh.y-25,`LOCK ${s.lockCount}/3`,'#ff88ff');if(s.lockCount>=3){s.multiball=true;s.lockCount=0;s.locks.forEach((l:any)=>{l.locked=false;l.flash=30;});s.jackpotActive=true;s.jackpotValue=5000;sfx('multiball');vibe([20,20,20,20,20,20,60]);shake(20,8);addFloat(200,300,'✦ MULTIBALL! ✦','#ff44ff');[1,2].forEach(()=>setTimeout(()=>{if(sRef.current&&!sRef.current.gameOver)sRef.current.balls.push({x:200+(Math.random()-0.5)*80,y:100,vx:(Math.random()-0.5)*4,vy:3});},600));}if(!s.multiball){ball.x=-200;ball.y=-200;}}})}
      // BEAR TRAP
      if(!s.bearTrap.captured&&s.bearTrap.cooldown<=0&&s.bearTrap.jawOpen){const dx=ball.x-BEAR_TRAP.x,dy=ball.y-BEAR_TRAP.y;if(Math.sqrt(dx*dx+dy*dy)<BALL_R+BEAR_TRAP.r){s.bearTrap.captured=true;s.bearTrap.capturedBall=ball;s.bearTrap.captureTimer=90;s.bearTrap.jawOpen=false;s.bearTrap.completions++;ball.vx=0;ball.vy=0;sfx('bearTrap');vibe([25,15,25,15,25]);shake(10,4);addFloat(BEAR_TRAP.x,BEAR_TRAP.y-28,'TRAPPED!','#ff6600');}}
      // SWAMP
      if(!s.swamp.captured&&s.swamp.cooldown<=0){const dx=ball.x-SWAMP.x,dy=ball.y-SWAMP.y;if(Math.sqrt(dx*dx+dy*dy)<BALL_R+SWAMP.r){s.swamp.captured=true;s.swamp.capturedBall=ball;s.swamp.captureTimer=70;ball.vx=0;ball.vy=0;sfx('swamp');vibe([20,20,20,40]);shake(6,3);addFloat(SWAMP.x+40,SWAMP.y-20,'SWAMP CAPTURED!','#44ff88');if(s.skillShotActive&&s.skillShotTarget===2){s.skillShotActive=false;sfx('skillShot');addFloat(SWAMP.x,SWAMP.y-40,'SKILL SHOT! +2500','#ffff00');s.score+=2500;shake(12,5);}}}
      // EXTRA BALL target
      if(!s.xballHit){const dx=ball.x-XBALL_TARGET.x,dy=ball.y-XBALL_TARGET.y;if(Math.sqrt(dx*dx+dy*dy)<BALL_R+XBALL_TARGET.r){s.xballHit=true;s.xballFlash=40;s.extraBalls++;sfx('xball');vibe([20,20,20,20,60]);shake(12,5);addFloat(XBALL_TARGET.x,XBALL_TARGET.y-28,'EXTRA BALL!','#ffff00');setTimeout(()=>{if(sRef.current)sRef.current.xballHit=false;},15000);}}
      // INLANE ROLLOVERS
      s.inlaneRollovers.forEach((rol:any)=>{const rdx=ball.x-rol.x,rdy=ball.y-rol.y;if(Math.sqrt(rdx*rdx+rdy*rdy)<BALL_R+rol.r){rol.lit=true;s.score+=getMult(s,rol.pts);sfx('topLane');vibe(10);addFloat(rol.x,rol.y-18,`+${getMult(s,rol.pts)}`,'#44ffaa');setTimeout(()=>{if(sRef.current){const r=sRef.current.inlaneRollovers.find((r2:any)=>r2.side===rol.side);if(r)r.lit=false;}},3000);}});
      // STANDUPS (left-side lightning bolt targets)
      s.standups.forEach((tgt:any)=>{
        if(tgt.flash>0){tgt.flash--;return;}
        const dx=ball.x-tgt.x,dy=ball.y-tgt.y;
        if(Math.sqrt(dx*dx+dy*dy)<BALL_R+tgt.r){
          // Reflect ball
          const nd=Math.sqrt(dx*dx+dy*dy)||1;const nx=dx/nd,ny=dy/nd;
          ball.x=tgt.x+nx*(BALL_R+tgt.r+1);ball.y=tgt.y+ny*(BALL_R+tgt.r+1);
          const dot=ball.vx*nx+ball.vy*ny;if(dot<0){ball.vx-=2*dot*nx;ball.vy-=2*dot*ny;}
          tgt.hit=true;tgt.flash=18;s.score+=getMult(s,tgt.pts);sfx('target');vibe(18);shake(4,2);
          addFloat(tgt.x+22,tgt.y,`+${getMult(s,tgt.pts)}`,'#ffcc00');
          if(s.standups.every((t:any)=>t.hit)){
            s.standups.forEach((t:any)=>t.hit=false);s.standupFlash=30;
            const bonus=getMult(s,600);s.score+=bonus;sfx('dropComplete');vibe([20,20,20,40]);shake(8,4);
            addFloat(tgt.x+30,tgt.y-20,`⚡ ALL HIT! +${bonus}`,'#ffff00');
          }
        }
      });
      // DROPS
      s.drops.forEach((drop:any)=>{if(drop.down){if(drop.flash>0)drop.flash--;return;}if(ball.x>drop.x-BALL_R&&ball.x<drop.x+drop.w+BALL_R&&ball.y+BALL_R>drop.y&&ball.y+BALL_R<drop.y+drop.h+6&&ball.vy>0){drop.down=true;drop.flash=25;let pts=drop.pts;if(s.modeIdx===1)pts*=4;s.score+=getMult(s,pts);sfx('drop');vibe(25);shake(4,2);addFloat(drop.x+drop.w/2,drop.y-12,`+${getMult(s,pts)}`,'#ff6600');if(s.drops.every((d:any)=>d.down)){
              s.score+=getMult(s,800);sfx('dropComplete');vibe([20,20,20,60]);shake(10,5);addFloat(200,300,'DROPS CLEAR! +800','#ff8800');
              setTimeout(()=>{if(sRef.current)sRef.current.drops.forEach((d:any)=>d.down=false);},1500);
              // WEDNESDAY progress
              if(s.modeIdx===1){s.modeProgress++;if(s.modeProgress>=s.modeObjective){const bonus=getMult(s,5000);s.score+=bonus;s.modeTimer=0;sfx('bonus');vibe([30,30,30,30,60]);shake(15,6);addFloat(200,300,`DROP MASTER! +${bonus}`,'#00ccff');}}}}if(!drop.down)reflectSeg(ball,drop.x,drop.y,drop.x+drop.w,drop.y,1.0);});
      // SPINNER
      {const dx=ball.x-SPINNER.x,dy=ball.y-SPINNER.y;if(Math.abs(dx)<SPINNER.len&&Math.abs(dy)<12&&Math.abs(dy)<Math.abs(dx)+4){s.spinnerSpin=Math.max(-25,Math.min(25,s.spinnerSpin+Math.sign(ball.vy)*Math.sign(dx-dy)*spd*0.4));s.spinnerFlash=12;s.score+=10;sfx('spin');vibe(6);addFloat(SPINNER.x,SPINNER.y-20,'+10','#00ffdd');}}
      // SLINGS
      SLINGS.forEach((sg,i)=>{if(reflectSeg(ball,sg[0],sg[1],sg[2],sg[3],1.35)){s.slingFlash[i]=14;s.score+=10;sfx('sling');vibe(15);shake(3,2);}});
      // Lane guides
      reflectSeg(ball,L_OUT[0],L_OUT[1],L_OUT[2],L_OUT[3],0.7);reflectSeg(ball,L_IN[0],L_IN[1],L_IN[2],L_IN[3],0.8);reflectSeg(ball,L_TRANS[0],L_TRANS[1],L_TRANS[2],L_TRANS[3],0.7);reflectSeg(ball,L_ITRANS[0],L_ITRANS[1],L_ITRANS[2],L_ITRANS[3],0.8);
      if(!ball.fromLane)reflectSeg(ball,R_IN[0],R_IN[1],R_IN[2],R_IN[3],0.8);
      // KICKBACK
      if(s.kbCharged&&ball.x<KB_ZONE.xMax&&ball.y>KB_ZONE.yMin&&ball.vy>0){ball.vx=8;ball.vy=-14;ball.x=WALL_L+BALL_R+2;s.kbCharged=false;s.kbHits=0;s.kbFlash=25;sfx('kickback');vibe([30,20,30]);shake(8,4);addFloat(70,540,'KICKBACK!','#39c400');}
      // CHANDELIER
      {const ch=s.chand;const chTX=200+Math.sin(ch.angle)*72,chTY=42+Math.cos(ch.angle)*72;const cdx=ball.x-chTX,cdy=ball.y-chTY,cdist=Math.sqrt(cdx*cdx+cdy*cdy);if(cdist<BALL_R+13&&cdist>0){const cnx=cdx/cdist,cny=cdy/cdist;ball.x=chTX+cnx*(BALL_R+13.5);ball.y=chTY+cny*(BALL_R+13.5);const cdot=ball.vx*cnx+ball.vy*cny;if(cdot<0){ball.vx-=2*cdot*cnx;ball.vy-=2*cdot*cny;const chandVx=ch.angleVel*Math.cos(ch.angle)*72;ball.vx+=chandVx*1.5;ball.vy-=2;ch.angleVel+=(ball.vx>0?0.018:-0.018);ch.flash=25;s.score+=200;sfx('chandHit');vibe(15);shake(4,2);addFloat(chTX,chTY-18,'+200','#ffdd88');}}}
      return ball.y>H+20;
    }

    function update(){
      const s=sRef.current;s.tick++;if(s.gameOver)return;
      if(wallCool.current>0)wallCool.current--;
      if(s.shake.frames>0){const m=s.shake.mag*(s.shake.frames/12);s.shake.x=(Math.random()-0.5)*m;s.shake.y=(Math.random()-0.5)*m;s.shake.frames--;}else{s.shake.x=0;s.shake.y=0;}
      s.bats=s.bats.map((bt:any)=>{bt.x+=bt.vx+Math.sin(s.tick*0.03+bt.ph)*0.4;bt.y+=bt.vy+Math.cos(s.tick*0.05+bt.ph)*0.3;bt.life--;if(bt.x<WALL_L+5)bt.vx=Math.abs(bt.vx);if(bt.x>WALL_R-5)bt.vx=-Math.abs(bt.vx);if(bt.y<42)bt.vy=Math.abs(bt.vy);if(bt.y>H-110)bt.vy=-Math.abs(bt.vy);return bt;}).filter((bt:any)=>bt.life>0);
      s.spinnerSpin*=0.94;if(Math.abs(s.spinnerSpin)>0.1)s.spinnerAngle+=s.spinnerSpin*0.05;if(s.spinnerFlash>0)s.spinnerFlash--;
      {const ch=s.chand;ch.angle+=ch.angleVel;if(Math.abs(ch.angle)>0.44){ch.angleVel=-ch.angleVel*0.97;ch.angle=Math.sign(ch.angle)*0.44;}ch.angleVel*=0.9997;if(Math.abs(ch.angleVel)<0.009)ch.angleVel=0.009*(ch.angle>0?-1:1);if(ch.flash>0)ch.flash--;}
      // Bear trap jaw animation
      {const bt=s.bearTrap;if(bt.cooldown>0){bt.cooldown--;const openAt=s.modeIdx===3?30:60;if(bt.cooldown<openAt)bt.jawOpen=true;}if(bt.flash>0)bt.flash--;if(!bt.captured&&bt.jawOpen){bt.jawAngle=0.7+0.1*Math.sin(s.tick*0.06);}}
      // Swamp bubbles
      {const sw=s.swamp;if(sw.cooldown>0)sw.cooldown--;if(sw.flash>0)sw.flash--;sw.bubbles=sw.bubbles.map((b:any)=>({...b,y:b.y-0.8,r:b.r+0.05,life:b.life-1})).filter((b:any)=>b.life>0);if(Math.random()<0.12)sw.bubbles.push({x:SWAMP.x+(Math.random()-0.5)*20,y:SWAMP.y+8,r:2+Math.random()*4,life:30+Math.random()*20});}
      if(s.jackpotFlash>0)s.jackpotFlash--;if(s.jackpotActive&&s.multiball)s.jackpotValue=Math.min(s.jackpotValue+2,99999);if(s.standupFlash>0)s.standupFlash--;
      if(s.lOrbitFlash>0)s.lOrbitFlash--;if(s.rOrbitFlash>0)s.rOrbitFlash--;
      if(s.lRampFlash>0)s.lRampFlash--;if(s.rRampFlash>0)s.rRampFlash--;
      if(s.insertPulse>0)s.insertPulse--;if(s.xballFlash>0)s.xballFlash--;
      s.locks.forEach((l:any)=>{if(l.flash>0)l.flash--;});
      if(s.modeIdx>=0){
        s.modeTimer--;if(s.modeFlash>0)s.modeFlash--;
        // LURCH: count down seconds as objective
        if(s.modeIdx===4&&s.modeTimer%60===0)s.modeProgress=Math.floor(s.modeTimer/60);
        if(s.modeTimer<=0){
          // Mode completion bonus
          let completionBonus=0;
          if(s.modeProgress>=s.modeObjective&&s.modeIdx!==4)completionBonus=0; // already paid
          else if(s.modeIdx===4){completionBonus=s.modeProgress*200;} // LURCH: bonus per second survived
          if(completionBonus>0){s.score+=completionBonus;addFloat(200,300,`MODE COMPLETE! +${completionBonus}`,'#ffffff');}
          else addFloat(200,300,'MODE OVER','#888888');
          s.modeIdx=-1;s.modeTimer=0;s.modeFlash=0;s.modeProgress=0;s.modeJackpot=0;
          bdRef.current=buildBackdrop();
        }
      }
      if(s.skillShotTimer>0){s.skillShotTimer--;if(s.skillShotTimer===0)s.skillShotActive=false;}
      // End-of-ball bonus countdown
      if(s.bonusActive){
        s.bonusTick++;
        if(s.bonusTick%3===0&&s.bonusValue>0){
          const award=Math.min(s.bonusValue,s.bonusMult*10);
          s.score+=award;s.bonusValue-=Math.min(s.bonusValue,s.bonusMult*10);
          sfx('topLane');
        }
        if(s.bonusValue<=0&&s.bonusTick>40){
          s.bonusActive=false;s.bonusTick=0;s.bumperHits=0;s.rampCount=0;s.topLaneMult=1;
          s.lives--;
          if(s.lives<=0){s.gameOver=true;s.highScore=Math.max(s.highScore,s.score);sfx('gameover');vibe([80,40,80,40,300]);if(qualifies(s.score)){setTimeout(()=>setShowInitials(true),1800);}}
          else{spawnLaneBall();}
        }
        return; // freeze gameplay during bonus
      }
      if(s.tilted){s.tiltTimer--;if(s.tiltTimer<=0){s.tilted=false;s.tiltWarn=0;}}
      else{if(s.rapidTimer>0)s.rapidTimer--;else s.rapidPresses=0;}
      if(s.tiltFlash>0)s.tiltFlash--;
      if(!s.tilted){if(s.leftUp&&!s.prevL){sfx('flipper');vibe(8);s.rapidPresses++;s.rapidTimer=55;}if(s.rightUp&&!s.prevR){sfx('flipper');vibe(8);s.rapidPresses++;s.rapidTimer=55;}}
      s.prevL=s.leftUp;s.prevR=s.rightUp;
      if(!s.tilted&&s.rapidPresses>=TILT_THRESH){s.rapidPresses=0;s.rapidTimer=0;s.tiltWarn++;if(s.tiltWarn>=TILT_MAX){s.tilted=true;s.tiltTimer=TILT_LOCK;s.tiltFlash=TILT_LOCK;sfx('tilt');vibe([100,50,100,50,200]);addFloat(200,400,'T I L T','#ff2222');}else{sfx('tiltWarn');vibe([40,20,40]);addFloat(200,400,`⚠ WARNING ${s.tiltWarn}/${TILT_MAX-1}`,'#ff8800');}}
      const el=s.tilted?false:s.leftUp,er=s.tilted?false:s.rightUp;
      const pLA=s.leftA,pRA=s.rightA;
      s.leftA+=((el?FL.upA:FL.downA)-s.leftA)*0.38;s.rightA+=((er?FR.upA:FR.downA)-s.rightA)*0.38;
      if(s.inLane){if(s.charging)s.plunger=Math.min(1,s.plunger+0.022);else s.laneY=Math.min(s.laneY+0.5,608);return;}
      if(s.ballSaveTimer>0)s.ballSaveTimer--;
      const drained:number[]=[];
      s.balls.forEach((b:any,i:number)=>{tickFlippers(b,s,pLA,pRA);const fell=tickBall(b,s);if(!fell)tickFlippers(b,s,pLA,pRA);else drained.push(i);});
      for(let i=drained.length-1;i>=0;i--)s.balls.splice(drained[i],1);
      if(drained.length>0&&s.balls.length===0){
        s.multiball=false;s.combo=0;
        if(s.ballSaveTimer>0){
          sfx('ballsave');vibe([10,30,10,30,10]);addFloat(200,400,'BALL SAVED!','#39c400');spawnLaneBall();
        } else if(s.extraBalls>0){
          s.extraBalls--;sfx('ballsave');vibe([10,30,10,30,10]);addFloat(200,400,'EXTRA BALL!','#ffff00');spawnLaneBall();
        } else {
          // Trigger end-of-ball bonus sequence before respawning
          const bonusVal=s.bumperHits*10+s.rampCount*50+(s.topLaneMult-1)*200+s.bearTrap.completions*100;
          s.bonusValue=bonusVal;s.bonusMult=Math.max(1,s.topLaneMult);s.bonusActive=true;s.bonusTick=0;
          sfx('drain');vibe([50,30,80]);
        }
      }
      // Anti-stuck: if ball barely moves for 2s, kick it free
      s.balls.forEach((b:any)=>{
        if(b.onRamp||s.bearTrap.capturedBall===b||s.swamp.capturedBall===b)return;
        if(!b._stk)b._stk={frames:0,lx:b.x,ly:b.y};
        const moved=Math.abs(b.x-b._stk.lx)+Math.abs(b.y-b._stk.ly);
        if(moved<1.5){b._stk.frames++;if(b._stk.frames>120){b.vx=(Math.random()-0.5)*12;b.vy=-(Math.random()*10+6);b._stk.frames=0;shake(8,5);}}
        else{b._stk.frames=0;b._stk.lx=b.x;b._stk.ly=b.y;}
      });
      if(s.nudgeCooldown>0)s.nudgeCooldown--;
      s.bumperFlash=s.bumperFlash.map((f:number)=>Math.max(0,f-1));s.slingFlash=s.slingFlash.map((f:number)=>Math.max(0,f-1));
      s.ballFlash=Math.max(0,s.ballFlash-1);s.kbFlash=Math.max(0,s.kbFlash-1);
      if(s.lightFrames>0)s.lightFrames--;if(s.comboTimer>0){s.comboTimer--;if(!s.comboTimer)s.combo=0;}
      s.floats=s.floats.map((f:any)=>({...f,y:f.y-0.8,t:f.t-1})).filter((f:any)=>f.t>0);
    }

    // ── DRAW ─────────────────────────────────────────────────────────────────
    function gl(c:string,b:number){ctx.shadowColor=c;ctx.shadowBlur=b;}
    function ng(){ctx.shadowBlur=0;}

    function drawBall(b:any,flash:number){
      if(!b.trail)b.trail=[];b.trail.push({x:b.x,y:b.y});if(b.trail.length>10)b.trail.shift();
      b.trail.forEach((pt:any,i:number)=>{const a=(i/b.trail.length)*0.18;ctx.beginPath();ctx.arc(pt.x,pt.y,BALL_R*(i/b.trail.length)*0.65,0,Math.PI*2);ctx.fillStyle=flash>0?`rgba(200,100,255,${a})`:`rgba(80,50,160,${a})`;ctx.fill();});
      ctx.save();ctx.shadowColor='rgba(0,0,0,0.6)';ctx.shadowBlur=10;ctx.shadowOffsetX=2;ctx.shadowOffsetY=4;ctx.beginPath();ctx.ellipse(b.x+1,b.y+2,BALL_R,BALL_R*0.7,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fill();ctx.restore();
      const gr=ctx.createRadialGradient(b.x-BALL_R*0.4,b.y-BALL_R*0.4,0,b.x,b.y,BALL_R);
      if(flash>0){gr.addColorStop(0,'#fff');gr.addColorStop(0.2,'#ffccff');gr.addColorStop(0.55,'#cc44ff');gr.addColorStop(0.85,'#770099');gr.addColorStop(1,'#330044');gl('#cc44ff',22);}
      else{gr.addColorStop(0,'#fff');gr.addColorStop(0.15,'#eeeef8');gr.addColorStop(0.5,'#9090c0');gr.addColorStop(0.82,'#404860');gr.addColorStop(1,'#1a1a28');gl('#7755aa',14);}
      ctx.beginPath();ctx.arc(b.x,b.y,BALL_R,0,Math.PI*2);ctx.fillStyle=gr;ctx.fill();ng();
      const sp=ctx.createRadialGradient(b.x-BALL_R*0.42,b.y-BALL_R*0.45,0,b.x-BALL_R*0.42,b.y-BALL_R*0.45,BALL_R*0.55);sp.addColorStop(0,'rgba(255,255,255,0.95)');sp.addColorStop(0.5,'rgba(255,255,255,0.3)');sp.addColorStop(1,'rgba(255,255,255,0)');ctx.beginPath();ctx.arc(b.x,b.y,BALL_R,0,Math.PI*2);ctx.fillStyle=sp;ctx.fill();
    }

    function drawFlipper(f:any,angle:number,active:boolean){
      const ep=fpEnd(f,angle);ctx.lineCap='round';
      ctx.save();ctx.shadowColor='rgba(0,0,0,0.7)';ctx.shadowBlur=10;ctx.shadowOffsetX=2;ctx.shadowOffsetY=5;ctx.strokeStyle='#000';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(f.px,f.py);ctx.lineTo(ep.x,ep.y);ctx.stroke();ctx.restore();
      ctx.strokeStyle=active?'#113311':'#0a2a0a';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(f.px,f.py);ctx.lineTo(ep.x,ep.y);ctx.stroke();
      const dx=ep.x-f.px,dy=ep.y-f.py,len=Math.sqrt(dx*dx+dy*dy),px2=-dy/len*7,py2=dx/len*7;
      const bodyG=ctx.createLinearGradient(f.px+px2,f.py+py2,f.px-px2,f.py-py2);
      if(active){bodyG.addColorStop(0,'#aaffaa');bodyG.addColorStop(0.3,'#44ff44');bodyG.addColorStop(0.65,'#228822');bodyG.addColorStop(1,'#0a3a0a');}
      else{bodyG.addColorStop(0,'#77cc77');bodyG.addColorStop(0.3,'#339933');bodyG.addColorStop(0.65,'#1a5a1a');bodyG.addColorStop(1,'#082008');}
      ctx.strokeStyle=bodyG;ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(f.px,f.py);ctx.lineTo(ep.x,ep.y);ctx.stroke();
      ctx.strokeStyle=active?'rgba(180,255,180,0.85)':'rgba(120,200,120,0.55)';ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(f.px,f.py);ctx.lineTo(ep.x,ep.y);ctx.stroke();
      const pivG=ctx.createRadialGradient(f.px-3,f.py-3,0,f.px,f.py,9);pivG.addColorStop(0,active?'#ddffdd':'#99cc99');pivG.addColorStop(0.5,active?'#44cc44':'#228822');pivG.addColorStop(1,active?'#114411':'#082008');
      ctx.save();ctx.shadowColor=active?'rgba(100,255,100,0.5)':'rgba(50,150,50,0.3)';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(f.px,f.py,9,0,Math.PI*2);ctx.fillStyle=pivG;ctx.fill();ctx.strokeStyle=active?'rgba(150,255,150,0.7)':'rgba(80,180,80,0.4)';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    }

    function draw(){
      const s=sRef.current;ctx.save();ctx.translate(s.shake.x,s.shake.y);
      const mode=s.modeIdx>=0?MODES[s.modeIdx]:null;
      ctx.drawImage(bdRef.current!,0,0);
      if(mode){
        // Visible color wash over table
        ctx.fillStyle=mode.color+'28';ctx.fillRect(WALL_L,40,WALL_R-WALL_L,H-40);
        // Pulsing border around table
        const mPulse=0.6+0.4*Math.abs(Math.sin(s.tick*0.08));
        gl(mode.color,Math.round(20*mPulse));ctx.strokeStyle=mode.color;ctx.lineWidth=3;ctx.strokeRect(WALL_L,40,WALL_R-WALL_L,H-40);ng();
        // Mode timer bar at bottom
        const pct=s.modeTimer/MODE_DURATION;
        ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(WALL_L,H-8,WALL_R-WALL_L,6);
        ctx.fillStyle=mode.color;gl(mode.color,10);ctx.fillRect(WALL_L,H-8,(WALL_R-WALL_L)*pct,6);ng();
      }
      // Mode start white flash
      if(s.modeFlash>0&&s.modeIdx>=0){
        ctx.globalAlpha=(s.modeFlash/30)*0.6;
        ctx.fillStyle=MODES[s.modeIdx].color;ctx.fillRect(WALL_L,40,WALL_R-WALL_L,H-40);
        ctx.globalAlpha=1;
      }
      if(s.tiltFlash>0&&s.tilted){ctx.fillStyle=`rgba(160,0,0,${Math.min(0.28,(s.tiltFlash/TILT_LOCK)*0.28)})`;ctx.fillRect(0,0,W,H);}
      s.bats.forEach((bt:any)=>{const w=Math.sin(s.tick*0.25+bt.ph)*0.7;ctx.save();ctx.translate(bt.x,bt.y);const alp=Math.min(1,bt.life/60)*0.6;ctx.strokeStyle=`rgba(120,60,160,${alp})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,bt.sz*0.3,bt.sz*0.2,0,0,Math.PI*2);ctx.fillStyle=`rgba(55,0,75,${alp*0.9})`;ctx.fill();ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-bt.sz,w*bt.sz,-bt.sz*1.8,bt.sz*0.5);ctx.stroke();ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(bt.sz,w*bt.sz,bt.sz*1.8,bt.sz*0.5);ctx.stroke();ctx.restore();});
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(LANE_X,386,WALL_R-LANE_X,H-386);ctx.strokeStyle='rgba(200,144,10,0.25)';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(LANE_X,386);ctx.lineTo(LANE_X,H);ctx.stroke();ctx.setLineDash([]);
      if(s.lightFrames>0&&Math.random()<0.65){gl('#cc44ff',22);ctx.strokeStyle='rgba(220,120,255,0.8)';ctx.lineWidth=1.8;const bmp=BUMPERS[Math.floor(Math.random()*BUMPERS.length)];ctx.beginPath();ctx.moveTo(bmp.x,bmp.y);const tx=bmp.x+(Math.random()-0.5)*100,ty=bmp.y-Math.random()*90-10;for(let i=1;i<=7;i++){const t=i/7;ctx.lineTo(bmp.x+(tx-bmp.x)*t+(Math.random()-0.5)*14,bmp.y+(ty-bmp.y)*t+(Math.random()-0.5)*14);}ctx.lineTo(tx,ty);ctx.stroke();ng();}

      // ── MODE FEATURE STATE ────────────────────────────────────────────────
      // Each mode dims inactive features and activates its target feature
      const mIdx=s.modeIdx;
      // Per-feature activity levels (0=dimmed, 1=normal, 2=lit/active)
      const bumpAct = mIdx<0?1 : mIdx===0?2 : mIdx===4?2 : 0.25;  // FESTER or LURCH
      const dropAct  = mIdx<0?1 : mIdx===1?2 : mIdx===4?2 : 0.25; // WEDNESDAY or LURCH
      const rampAct  = mIdx<0?1 : mIdx===2?2 : mIdx===4?2 : 0.25; // PUGSLEY or LURCH
      const trapAct  = mIdx<0?1 : mIdx===3?2 : mIdx===4?2 : 0.25; // MORTICIA or LURCH
      const swampAct = mIdx<0?1 : mIdx===4?2 : 0.6;               // always playable
      const vaultAct = mIdx<0?1 : mIdx===4?2 : 0.6;               // always playable

      // ── RAMPS (3D pipe, left=blue, right=red/orange) ──────────────────────
      {ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      const lLit=s.lRampFlash>0,rLit=s.rRampFlash>0;
      function drawRamp(path:P[],lit:boolean,baseCol:string,midCol:string,topCol:string){
        ctx.save();ctx.translate(4,7);ctx.strokeStyle='rgba(0,0,0,0.45)';ctx.lineWidth=68;drawBez(ctx,path[0],path[1],path[2],path[3]);ctx.restore();
        ctx.strokeStyle='#060102';ctx.lineWidth=64;drawBez(ctx,path[0],path[1],path[2],path[3]);
        ctx.strokeStyle=baseCol;ctx.lineWidth=52;drawBez(ctx,path[0],path[1],path[2],path[3]);
        ctx.strokeStyle=lit?midCol:baseCol;ctx.lineWidth=38;drawBez(ctx,path[0],path[1],path[2],path[3]);
        ctx.strokeStyle=lit?topCol:midCol;ctx.lineWidth=22;drawBez(ctx,path[0],path[1],path[2],path[3]);
        ctx.strokeStyle=lit?'rgba(255,255,255,0.6)':topCol;ctx.lineWidth=8;drawBez(ctx,path[0],path[1],path[2],path[3]);
        gl(lit?topCol:'rgba(255,255,255,0.3)',lit?18:6);ctx.strokeStyle=lit?'rgba(255,255,255,0.85)':'rgba(255,255,255,0.4)';ctx.lineWidth=2.5;drawBez(ctx,path[0],path[1],path[2],path[3]);ng();
      }
      // Left ramp = BLUE
      drawRamp(LRAMP_PATH,lLit,'#001a5a','#0044cc','#44aaff');
      // Right ramp = RED/ORANGE  
      drawRamp(RRAMP_PATH,rLit,'#5a0800','#cc2200','#ff6644');
      if(mIdx===2){// PUGSLEY: jackpot label on ramps
        const pu=0.65+0.35*Math.abs(Math.sin(s.tick*0.16));ctx.globalAlpha=pu;gl(MODES[2].color,18);ctx.fillStyle=MODES[2].color;ctx.font='bold 10px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('★ JACKPOT ★',LRAMP_PATH[0][0]-2,LRAMP_PATH[0][1]+20);ctx.fillText('★ JACKPOT ★',RRAMP_PATH[0][0]+2,RRAMP_PATH[0][1]+20);ng();ctx.globalAlpha=1;
      } else if(mIdx===4){
        ctx.fillStyle=MODES[4].color;ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('5× RAMP',LRAMP_PATH[0][0]-2,LRAMP_PATH[0][1]+20);ctx.fillText('5× RAMP',RRAMP_PATH[0][0]+2,RRAMP_PATH[0][1]+20);
      } else {
        ctx.fillStyle=lLit?'#88ccff':'rgba(80,160,255,0.7)';ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('▲ RAMP',LRAMP_PATH[0][0]-2,LRAMP_PATH[0][1]+20);
        ctx.fillStyle=rLit?'#ffaa88':'rgba(255,120,60,0.7)';ctx.fillText('▲ RAMP',RRAMP_PATH[0][0]+2,RRAMP_PATH[0][1]+20);
      }
      if(s.rampCount>0){gl('#ff8800',8);ctx.fillStyle='#ffaa44';ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(`🔀 RAMPS ×${s.rampCount}`,200,76);ng();}
      ctx.restore();}

      // ── WALLS (gold chrome) ───────────────────────────────────────────────
      function wline(x1:number,y1:number,x2:number,y2:number,c='#c8900a',w=3){gl(c,16);ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ng();}
      wline(WALL_L,40,WALL_L,H);wline(WALL_R,40,WALL_R,H);wline(WALL_L,40,W/2-24,40);wline(W/2+24,40,WALL_R,40);
      [[WALL_L,40],[WALL_R,40]].forEach(([tx,ty])=>{gl('#c8900a',10);ctx.strokeStyle='#c8900a';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(tx-10,ty);ctx.lineTo(tx,ty-18);ctx.lineTo(tx+10,ty);ctx.stroke();gl('#ffcc44',12);ctx.fillStyle='#ffcc44';ctx.beginPath();ctx.arc(tx,ty-18,3,0,Math.PI*2);ctx.fill();ng();});
      gl('#c8900a',10);ctx.strokeStyle='#c8900a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(W/2,40,24,Math.PI,0);ctx.stroke();ng();

      // ── DYNAMIC INSERT LIGHTS ─────────────────────────────────────────────
      {const tick=s.tick;const ip=s.insertPulse>0;const mC=mode?mode.color:'#c8900a';
      INSERTS_ALL.forEach(ins=>{
        // Determine if this insert should be lit based on game state
        let lit=false;
        if(ip) lit=true; // global pulse on bumper hit
        if(ins.type==='arrow'&&ins.col==='#44ff44'&&(s.leftUp||s.rightUp))lit=true; // flipper arrows
        if(ins.type==='diamond'&&ins.col.startsWith('#ff')&&s.bumperFlash.some((f:number)=>f>0))lit=true;
        if(ins.col==='#00ccff'&&(s.lOrbitFlash>0||s.rOrbitFlash>0))lit=true;
        if(ins.col==='#44aaff'&&s.lRampFlash>0)lit=true;
        if(ins.col==='#ff6644'&&s.rRampFlash>0)lit=true;
        if(ins.col==='#ffd700')lit=s.targets.some((t:any)=>t.hit);
        if(ins.col==='#ff8800')lit=s.bearTrap.flash>0||s.swamp.flash>0;
        if(ins.col==='#44ff88')lit=s.standupFlash>0;
        if(mode&&!lit){const pulse=0.4+0.3*Math.abs(Math.sin(tick*0.06+ins.x*0.1));lit=pulse>0.6;}
        if(!lit)return;
        const pulse=ip?1:0.7+0.3*Math.abs(Math.sin(tick*0.1+ins.x*0.05));
        ctx.globalAlpha=0.5+0.5*pulse;
        gl(ins.col,8);
        if(ins.type==='diamond'){ctx.save();ctx.translate(ins.x,ins.y);ctx.rotate(Math.PI/4);ctx.fillStyle=ins.col;ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.rect(-5,-5,10,10);ctx.fill();ctx.stroke();ctx.restore();}
        else if(ins.type==='arrow'){ctx.save();ctx.translate(ins.x,ins.y);ctx.rotate(ins.ang||0);ctx.fillStyle=ins.col;ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(6,4);ctx.lineTo(-6,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
        else if(ins.type==='star'){ctx.fillStyle=ins.col;ctx.beginPath();for(let i=0;i<5;i++){const a=i/5*Math.PI*2-Math.PI/2,b=a+Math.PI/5;ctx.lineTo(ins.x+Math.cos(a)*6,ins.y+Math.sin(a)*6);ctx.lineTo(ins.x+Math.cos(b)*3,ins.y+Math.sin(b)*3);}ctx.closePath();ctx.fill();}
        else{ctx.beginPath();ctx.arc(ins.x,ins.y,5,0,Math.PI*2);ctx.fillStyle=ins.col;ctx.fill();}
        ng();ctx.globalAlpha=1;
      });}

      // ── STANDUP TARGETS (left-side ⚡ bolts) ──────────────────────────────
      {const allLit=s.standupFlash>0;
        if(allLit){const p=0.6+0.4*Math.abs(Math.sin(s.tick*0.2));ctx.globalAlpha=p;gl('#ffff00',18);ctx.fillStyle='#ffff00';ctx.font='bold 10px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('⚡ ALL HIT ⚡',64,236);ng();ctx.globalAlpha=1;}
        s.standups.forEach((tgt:any)=>{
          const fl=tgt.flash>0||allLit,hit=tgt.hit;
          ctx.save();ctx.shadowColor=fl?'rgba(255,255,0,0.8)':hit?'rgba(255,200,0,0.5)':'rgba(0,0,0,0.5)';ctx.shadowBlur=fl?16:hit?8:6;ctx.shadowOffsetY=3;
          ctx.beginPath();ctx.arc(tgt.x,tgt.y,tgt.r+2,0,Math.PI*2);ctx.fillStyle=fl?'rgba(60,50,0,0.9)':hit?'rgba(40,35,0,0.9)':'rgba(5,3,0,0.9)';ctx.fill();ctx.restore();
          gl(fl?'#ffff00':hit?'#ccaa00':'rgba(80,70,0,0.5)',fl?14:hit?8:3);
          ctx.beginPath();ctx.arc(tgt.x,tgt.y,tgt.r+2,0,Math.PI*2);ctx.strokeStyle=fl?'#ffff00':hit?'#ccaa00':'rgba(80,70,0,0.4)';ctx.lineWidth=2;ctx.stroke();ng();
          // Lightning bolt fill
          if(fl||hit){const lg=ctx.createRadialGradient(tgt.x,tgt.y,0,tgt.x,tgt.y,tgt.r);lg.addColorStop(0,fl?'rgba(255,255,0,0.4)':'rgba(200,180,0,0.2)');lg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=lg;ctx.beginPath();ctx.arc(tgt.x,tgt.y,tgt.r,0,Math.PI*2);ctx.fill();}
          ctx.fillStyle=fl?'#ffff00':hit?'#ccaa00':'rgba(120,100,0,0.7)';ctx.font='bold 10px serif';ctx.textAlign='center';ctx.fillText(tgt.char,tgt.x,tgt.y+4);
          ctx.font='bold 7px "Courier New",monospace';ctx.fillStyle='rgba(180,160,0,0.6)';ctx.fillText(`${tgt.pts}`,tgt.x,tgt.y+tgt.r+10);
        });
        // Label
        ctx.fillStyle='rgba(150,130,0,0.45)';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('⚡ BOLTS',64,334);
      }

      // ── ORBIT SENSORS ─────────────────────────────────────────────────────
      [{cx:LORBIT.cx,cy:LORBIT.cy,flash:s.lOrbitFlash,skill:s.skillShotActive&&s.skillShotTarget===0},
       {cx:RORBIT.cx,cy:RORBIT.cy,flash:s.rOrbitFlash,skill:s.skillShotActive&&s.skillShotTarget===1}].forEach(orb=>{
        const lit=orb.flash>0,skill=orb.skill,pulse=0.5+0.5*Math.abs(Math.sin(s.tick*0.25));
        const c=skill?'#ffff00':lit?'#44ffff':'rgba(0,60,80,0.5)';
        if(skill){ctx.globalAlpha=pulse;}gl(c,lit||skill?18:4);
        ctx.beginPath();ctx.arc(orb.cx,orb.cy,14,0,Math.PI*2);ctx.strokeStyle=c;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=lit||skill?`${c}33`:'rgba(0,30,40,0.3)';ctx.fill();ng();ctx.globalAlpha=1;
        ctx.fillStyle=skill?'#ffff00':lit?'#44ffff':'rgba(0,80,100,0.6)';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(skill?'★':'ORBIT',orb.cx,orb.cy+3);
      });

      // ── TOP LANES ─────────────────────────────────────────────────────────
      s.topLanes.forEach((lane:any,i:number)=>{const lit=lane.lit,fl=lane.flash>0;const c=fl?'#ffff44':lit?'#ffd700':'rgba(60,50,0,0.5)';gl(c,lit||fl?16:3);ctx.beginPath();ctx.arc(lane.cx,lane.cy,lane.r,0,Math.PI*2);ctx.strokeStyle=c;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=lit||fl?`${c}44`:'rgba(15,10,0,0.5)';ctx.fill();ng();ctx.fillStyle=lit||fl?'#ffdd00':'rgba(80,65,0,0.6)';ctx.font='bold 8px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(['G','H','O'][i],lane.cx,lane.cy+3);});
      if(s.topLaneMult>1){const mc=s.topLaneMult>=4?'#ff44ff':'#ffaa00';gl(mc,8);ctx.fillStyle=mc;ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(`${s.topLaneMult}× MULT`,200,48);ng();}

      // ── SLINGSHOTS ────────────────────────────────────────────────────────
      SLINGS.forEach((sg,i)=>{const fl=s.slingFlash[i]>0,c=fl?'#ff4466':'#cc1133';gl(c,fl?22:8);ctx.strokeStyle=c;ctx.lineWidth=fl?5:3.5;ctx.beginPath();ctx.moveTo(sg[0],sg[1]);ctx.lineTo(sg[2],sg[3]);ctx.stroke();if(fl){ctx.strokeStyle='rgba(255,150,180,0.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sg[0],sg[1]);ctx.lineTo(sg[2],sg[3]);ctx.stroke();}ng();});

      // Lane guides
      function lw(pts:number[],c='#aa7700',w=2){gl(c,8);ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);ctx.lineTo(pts[2],pts[3]);ctx.stroke();ng();}
      lw(L_OUT,'#aa7700',2);lw(L_IN,'#aa7700',2);lw(R_IN,'#aa7700',2);lw(L_TRANS,'#885500',1.5);lw(R_TRANS,'#885500',1.5);lw(L_ITRANS,'#885500',1.5);lw(R_ITRANS,'#885500',1.5);

      // Kickback
      {const ky=552,ch=s.kbCharged,fl=s.kbFlash>0,pulse=ch?0.7+0.3*Math.abs(Math.sin(s.tick*0.1)):0;const c=fl?'#fff':ch?`rgba(57,196,0,${0.6+pulse*0.4})`:'#1a3a1a';gl(c,ch?14:2);ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(WALL_L+3,ky);ctx.lineTo(WALL_L+15,ky-9);ctx.lineTo(WALL_L+15,ky+9);ctx.closePath();ctx.fill();ng();if(!ch){const pct=s.kbHits/KB_NEEDED;ctx.fillStyle='#0a1a0a';ctx.fillRect(WALL_L+2,ky+13,18,4);ctx.fillStyle='#39c400';ctx.fillRect(WALL_L+2,ky+13,18*pct,4);}}

      // Ball save
      if(s.ballSaveTimer>0&&!s.inLane){const pct=s.ballSaveTimer/BALL_SAVE_FRAMES,pulse=0.5+0.5*Math.abs(Math.sin(s.tick*0.18));ctx.globalAlpha=pulse;gl('#39c400',12);ctx.strokeStyle='#39c400';ctx.lineWidth=2;ctx.fillStyle='#39c400';ctx.font='bold 11px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('● BALL SAVE ●',W/2,H-22);ctx.beginPath();ctx.arc(W/2,H-40,13,-(Math.PI/2),-(Math.PI/2)+pct*Math.PI*2);ctx.stroke();ng();ctx.globalAlpha=1;}

      // Tilt
      if(s.tilted){const pulse=0.6+0.4*Math.abs(Math.sin(s.tick*0.25));ctx.globalAlpha=pulse;gl('#ff2222',18);ctx.fillStyle='#ff4444';ctx.font='bold 20px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('T I L T',W/2,H-24);ng();ctx.globalAlpha=1;const pct=s.tiltTimer/TILT_LOCK;ctx.fillStyle='#2a0000';ctx.fillRect(WALL_L+5,H-14,WALL_R-WALL_L-10,5);ctx.fillStyle='#cc2200';ctx.fillRect(WALL_L+5,H-14,(WALL_R-WALL_L-10)*pct,5);}
      else if(s.tiltWarn>0&&!s.gameOver&&s.balls.length>0){ctx.fillStyle='rgba(255,120,0,0.6)';ctx.font='bold 10px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(`⚠ TILT WARNINGS: ${s.tiltWarn}/${TILT_MAX-1}`,W/2,H-7);}

      // ── GOMEZ targets ─────────────────────────────────────────────────────
      s.targets.forEach((tgt:any)=>{const hit=tgt.hit;ctx.save();ctx.shadowColor=hit?'rgba(255,215,0,0.7)':'rgba(0,0,0,0.5)';ctx.shadowBlur=hit?14:6;ctx.shadowOffsetY=3;ctx.beginPath();ctx.arc(tgt.x,tgt.y,tgt.r+2,0,Math.PI*2);ctx.fillStyle=hit?'rgba(60,40,0,0.9)':'rgba(8,5,0,0.9)';ctx.fill();ctx.restore();gl(hit?'#ffd700':'rgba(100,75,0,0.5)',hit?16:4);ctx.beginPath();ctx.arc(tgt.x,tgt.y,tgt.r+2,0,Math.PI*2);ctx.strokeStyle=hit?'#ffd700':'rgba(100,75,0,0.45)';ctx.lineWidth=2;ctx.stroke();ng();if(hit){const ig=ctx.createRadialGradient(tgt.x,tgt.y,0,tgt.x,tgt.y,tgt.r);ig.addColorStop(0,'rgba(255,215,0,0.35)');ig.addColorStop(1,'rgba(255,140,0,0)');ctx.fillStyle=ig;ctx.beginPath();ctx.arc(tgt.x,tgt.y,tgt.r,0,Math.PI*2);ctx.fill();}ctx.fillStyle=hit?'#ffd700':'rgba(180,140,0,0.7)';ctx.font='bold 10px "Times New Roman",serif';ctx.textAlign='center';ctx.fillText(tgt.char,tgt.x,tgt.y+4);});
      {const hitCount=s.targets.filter((t:any)=>t.hit).length,allHit=hitCount===s.targets.length;
      const gPulse=0.7+0.3*Math.abs(Math.sin(s.tick*0.1));
      if(allHit){ctx.globalAlpha=gPulse;gl('#ffd700',10);}
      const gomezStr=s.targets.map((t:any)=>t.hit?t.char:'·').join(' · ');
      ctx.fillStyle=allHit?'#ffd700':`rgba(${120+hitCount*26},${90+hitCount*20},0,0.85)`;
      ctx.font=`bold ${allHit?9:8}px "Courier New",monospace`;ctx.textAlign='center';ctx.fillText(gomezStr,130,170);ng();ctx.globalAlpha=1;
      for(let gi=0;gi<s.targets.length;gi++){const hit=s.targets[gi].hit;ctx.beginPath();ctx.arc(112+gi*10,176,3,0,Math.PI*2);ctx.fillStyle=hit?'#ffd700':'rgba(80,60,0,0.5)';ctx.fill();}}

      // ── 6 BUMPERS ─────────────────────────────────────────────────────────
      // FESTER mode: bumpers glow extra bright with 3× label + targeting arrow
      if(mIdx===0){
        // "AIM HERE" arrow cluster
        const pulse=0.6+0.4*Math.abs(Math.sin(s.tick*0.15));
        gl('#ff8800',Math.round(20*pulse));ctx.strokeStyle='#ff8800';ctx.lineWidth=3;
        ctx.beginPath();ctx.arc(254,222,74,0,Math.PI*2);ctx.stroke();ng();
        ctx.globalAlpha=pulse;ctx.fillStyle='#ff8800';ctx.font='bold 10px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('▼ HIT BUMPERS 3× ▼',254,156);ctx.globalAlpha=1;
      }
      // LURCH mode: 5× badge above cluster
      if(mIdx===4){
        const pulse=0.7+0.3*Math.abs(Math.sin(s.tick*0.18));
        ctx.globalAlpha=pulse;gl(MODES[4].color,16);ctx.fillStyle=MODES[4].color;ctx.font='bold 12px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('5× BUMPERS',254,156);ctx.globalAlpha=1;ng();
      }
      BUMPERS.forEach((bmp,i)=>{
        const fl=s.bumperFlash[i]>0,r=bmp.r;const pulse=fl?1:0.8+0.2*Math.abs(Math.sin(s.tick*0.07+i));ctx.globalAlpha=fl?1:Math.max(0.2,bumpAct<1?bumpAct:1);
        const col=bmp.col;
        // Drop shadow
        ctx.save();ctx.shadowColor='rgba(0,0,0,0.75)';ctx.shadowBlur=18;ctx.shadowOffsetX=3;ctx.shadowOffsetY=7;ctx.beginPath();ctx.ellipse(bmp.x+2,bmp.y+3,r+3,r+1,0,0,Math.PI*2);ctx.fillStyle='#000';ctx.fill();ctx.restore();
        // Outer ring (metallic)
        const ringG=ctx.createRadialGradient(bmp.x-r*0.5,bmp.y-r*0.5,r*0.1,bmp.x+r*0.2,bmp.y+r*0.3,r+5);
        ringG.addColorStop(0,fl?`${col}ff`:`${col}cc`);ringG.addColorStop(0.5,fl?`${col}88`:`${col}55`);ringG.addColorStop(1,'rgba(0,0,0,0.8)');
        ctx.beginPath();ctx.arc(bmp.x,bmp.y,r+5,0,Math.PI*2);ctx.fillStyle=ringG;ctx.fill();
        ctx.beginPath();ctx.arc(bmp.x,bmp.y,r+4,0,Math.PI*2);ctx.strokeStyle=fl?col:`${col}aa`;ctx.lineWidth=2;ctx.stroke();
        // Dome body lit from top-left
        const domeG=ctx.createRadialGradient(bmp.x-r*0.4,bmp.y-r*0.42,r*0.05,bmp.x+r*0.15,bmp.y+r*0.2,r);
        if(fl){domeG.addColorStop(0,'#ffffff');domeG.addColorStop(0.2,col+'ff');domeG.addColorStop(0.55,col+'cc');domeG.addColorStop(0.85,col+'66');domeG.addColorStop(1,'rgba(0,0,0,0.5)');}
        else{domeG.addColorStop(0,'rgba(255,255,255,0.6)');domeG.addColorStop(0.3,col+'cc');domeG.addColorStop(0.65,col+'66');domeG.addColorStop(0.9,'rgba(0,0,0,0.4)');domeG.addColorStop(1,'rgba(0,0,0,0.7)');}
        gl(fl?col:'rgba(0,0,0,0)',fl?25:0);ctx.beginPath();ctx.arc(bmp.x,bmp.y,r,0,Math.PI*2);ctx.fillStyle=domeG;ctx.fill();ng();
        // Specular highlight
        const spec=ctx.createRadialGradient(bmp.x-r*0.38,bmp.y-r*0.42,0,bmp.x-r*0.38,bmp.y-r*0.42,r*0.55);spec.addColorStop(0,fl?'rgba(255,255,255,1)':'rgba(255,255,255,0.8)');spec.addColorStop(0.4,'rgba(255,255,255,0.3)');spec.addColorStop(1,'rgba(255,255,255,0)');ctx.beginPath();ctx.ellipse(bmp.x-r*0.32,bmp.y-r*0.36,r*0.44,r*0.32,-0.45,0,Math.PI*2);ctx.fillStyle=spec;ctx.fill();
        ctx.font=`bold ${r>20?13:11}px serif`;ctx.textAlign='center';ctx.fillStyle=fl?'#fff':'rgba(255,255,255,0.85)';ctx.fillText(bmp.label,bmp.x,bmp.y+5);
        const bMult=mIdx===0?'3×':mIdx===4?'5×':`${bmp.pts}`;
        const bMulC=mIdx===0?'#ffaa44':mIdx===4?MODES[4].color:'rgba(200,200,200,0.5)';
        ctx.font='bold 7px "Courier New",monospace';ctx.fillStyle=fl?'rgba(255,255,255,0.9)':bMulC;ctx.fillText(bMult,bmp.x,bmp.y+r+10);
        ctx.globalAlpha=1;
        if(fl){const fR=ctx.createRadialGradient(bmp.x,bmp.y,r,bmp.x,bmp.y,r+18);fR.addColorStop(0,`${col}55`);fR.addColorStop(1,`${col}00`);ctx.beginPath();ctx.arc(bmp.x,bmp.y,r+18,0,Math.PI*2);ctx.fillStyle=fR;ctx.fill();}
      });

      // ── BEAR TRAP ─────────────────────────────────────────────────────────
      ctx.globalAlpha=Math.max(0.2,trapAct<1?trapAct:1);
      if(mIdx===3){// MORTICIA: FRENZY label above trap
        const pu=0.6+0.4*Math.abs(Math.sin(s.tick*0.22));ctx.globalAlpha=pu;
        gl(MODES[3].color,20);ctx.fillStyle=MODES[3].color;ctx.font='bold 12px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('⚡ TRAP FRENZY ⚡',BEAR_TRAP.x,BEAR_TRAP.y-36);ng();
        ctx.globalAlpha=Math.max(0.2,trapAct<1?trapAct:1);
      }
      {const bt=s.bearTrap,captured=bt.captured,fl=bt.flash>0;const jawA=bt.jawAngle;
        // Ground shadow
        ctx.save();ctx.shadowColor='rgba(0,0,0,0.7)';ctx.shadowBlur=20;ctx.shadowOffsetY=8;ctx.beginPath();ctx.ellipse(BEAR_TRAP.x+3,BEAR_TRAP.y+5,BEAR_TRAP.r+6,BEAR_TRAP.r+2,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fill();ctx.restore();
        // Base plate
        const baseG=ctx.createRadialGradient(BEAR_TRAP.x-4,BEAR_TRAP.y-4,2,BEAR_TRAP.x,BEAR_TRAP.y,BEAR_TRAP.r+6);
        baseG.addColorStop(0,captured?'#442200':'#221100');baseG.addColorStop(0.5,'#110800');baseG.addColorStop(1,'#050300');
        gl(captured||fl?'#ff6600':'rgba(100,50,0,0.5)',captured||fl?20:8);ctx.beginPath();ctx.arc(BEAR_TRAP.x,BEAR_TRAP.y,BEAR_TRAP.r+6,0,Math.PI*2);ctx.fillStyle=baseG;ctx.fill();ng();
        // Chain links around base
        for(let i=0;i<8;i++){const a=i/8*Math.PI*2,cx=BEAR_TRAP.x+Math.cos(a)*(BEAR_TRAP.r+4),cy=BEAR_TRAP.y+Math.sin(a)*(BEAR_TRAP.r+4);ctx.beginPath();ctx.arc(cx,cy,2.5,0,Math.PI*2);ctx.fillStyle=captured?'#ff8800':'#886633';ctx.fill();}
        // JAWS
        ctx.save();ctx.translate(BEAR_TRAP.x,BEAR_TRAP.y);
        // Upper jaw
        ctx.save();ctx.rotate(-jawA);
        const jawColor=captured?'#cc4400':fl?'#ff8800':'#885533';gl(jawColor,fl||captured?14:6);
        ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,BEAR_TRAP.r+2,-0.1,Math.PI+0.1,false);ctx.closePath();
        ctx.fillStyle=ctx.createLinearGradient(0,-BEAR_TRAP.r,0,0) as any;
        const jG1=ctx.createLinearGradient(0,-BEAR_TRAP.r,0,0);jG1.addColorStop(0,captured?'#aa3300':'#774422');jG1.addColorStop(1,captured?'#662200':'#442211');ctx.fillStyle=jG1;ctx.fill();
        // Teeth
        for(let t=0;t<6;t++){const ta=-0.1+t/5*(Math.PI+0.2),tx=Math.cos(ta)*(BEAR_TRAP.r+2),ty=Math.sin(ta)*(BEAR_TRAP.r+2);ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx*0.7,ty*0.7);ctx.lineTo(tx+Math.cos(ta+0.12)*5,ty+Math.sin(ta+0.12)*5);ctx.closePath();ctx.fillStyle='rgba(220,220,200,0.9)';ctx.fill();}
        ctx.restore();
        // Lower jaw
        ctx.save();ctx.rotate(jawA);ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,BEAR_TRAP.r+2,Math.PI-0.1,Math.PI*2+0.1,false);ctx.closePath();const jG2=ctx.createLinearGradient(0,0,0,BEAR_TRAP.r);jG2.addColorStop(0,captured?'#992200':'#553311');jG2.addColorStop(1,captured?'#551100':'#331108');ctx.fillStyle=jG2;ctx.fill();for(let t=0;t<6;t++){const ta=Math.PI-0.1+t/5*(Math.PI+0.2),tx=Math.cos(ta)*(BEAR_TRAP.r+2),ty=Math.sin(ta)*(BEAR_TRAP.r+2);ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx*0.7,ty*0.7);ctx.lineTo(tx+Math.cos(ta+0.12)*5,ty+Math.sin(ta+0.12)*5);ctx.closePath();ctx.fillStyle='rgba(220,220,200,0.9)';ctx.fill();}ctx.restore();ng();
        // Center pivot bolt
        const boltG=ctx.createRadialGradient(-2,-2,0,0,0,6);boltG.addColorStop(0,'#ddddcc');boltG.addColorStop(0.5,'#888877');boltG.addColorStop(1,'#333322');ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fillStyle=boltG;ctx.fill();ctx.strokeStyle='rgba(150,150,130,0.5)';ctx.lineWidth=1;ctx.stroke();
        ctx.restore();
        // Label
        const statusTxt=captured?'CAUGHT!':bt.cooldown>0?'RESET...':'BEAR TRAP';const statusCol=captured?'#ff8800':bt.cooldown>0?'#886633':'rgba(160,100,40,0.8)';gl(statusCol,captured?10:4);ctx.fillStyle=statusCol;ctx.font='bold 8px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(statusTxt,BEAR_TRAP.x,BEAR_TRAP.y+BEAR_TRAP.r+18);ng();
        if(bt.completions>0){ctx.fillStyle='rgba(255,120,0,0.5)';ctx.font='7px "Courier New",monospace';ctx.fillText(`×${bt.completions}`,BEAR_TRAP.x,BEAR_TRAP.y+BEAR_TRAP.r+28);}
      }ctx.globalAlpha=1;

      // ── SWAMP (left scoop) ────────────────────────────────────────────────
      {const sw=s.swamp,captured=sw.captured,fl=sw.flash>0;
        // Swamp glow
        const swampG=ctx.createRadialGradient(SWAMP.x,SWAMP.y,0,SWAMP.x,SWAMP.y,SWAMP.r+8);
        swampG.addColorStop(0,captured?'rgba(0,120,30,0.7)':fl?'rgba(0,180,50,0.6)':'rgba(0,60,15,0.5)');swampG.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=swampG;ctx.beginPath();ctx.arc(SWAMP.x,SWAMP.y,SWAMP.r+8,0,Math.PI*2);ctx.fill();
        // Pit (dark hole)
        ctx.save();ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=15;ctx.shadowOffsetY=5;ctx.beginPath();ctx.arc(SWAMP.x,SWAMP.y,SWAMP.r,0,Math.PI*2);ctx.fillStyle=captured?'rgba(0,50,10,0.9)':'rgba(0,0,0,0.9)';ctx.fill();ctx.restore();
        gl(fl||captured?'#44ff88':'rgba(0,120,40,0.5)',fl||captured?16:6);ctx.beginPath();ctx.arc(SWAMP.x,SWAMP.y,SWAMP.r,0,Math.PI*2);ctx.strokeStyle=fl||captured?'#44ff88':'rgba(0,100,30,0.5)';ctx.lineWidth=2.5;ctx.stroke();ng();
        // Bubbles
        sw.bubbles.forEach((b:any)=>{ctx.globalAlpha=Math.min(0.8,b.life/30)*0.6;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.strokeStyle='rgba(0,200,60,0.7)';ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;});
        // Ripple rings
        for(let r=0;r<3;r++){const phase=(s.tick*0.03+r*0.33)%1,ringR=5+phase*(SWAMP.r-5);ctx.beginPath();ctx.arc(SWAMP.x,SWAMP.y,ringR,0,Math.PI*2);ctx.strokeStyle=`rgba(0,180,50,${0.35*(1-phase)})`;ctx.lineWidth=1;ctx.stroke();}
        ctx.fillStyle=fl||captured?'#44ff88':'rgba(0,130,40,0.6)';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('SWAMP',SWAMP.x,SWAMP.y+SWAMP.r+12);
      }

      // ── VAULT LOCKS ──────────────────────────────────────────────────────
      // During normal play (no mode): arrow pointing at vault
      if(mIdx<0&&!s.multiball){
        const pulse=0.5+0.5*Math.abs(Math.sin(s.tick*0.08));
        ctx.globalAlpha=0.4+0.3*pulse;ctx.fillStyle='#ff88ff';ctx.font='bold 8px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('▶ LOCK',LOCK_HOLES[1].x-32,LOCK_HOLES[1].y+3);ctx.globalAlpha=1;
      }
      {const locksLit=s.locks.filter((l:any)=>l.locked).length;
        LOCK_HOLES.forEach((lh,i)=>{const locked=s.locks[i].locked,fl=s.locks[i].flash>0;const c=locked?'#ff88ff':fl?'#fff':'rgba(120,40,150,0.4)';
          ctx.save();ctx.shadowColor='rgba(0,0,0,0.8)';ctx.shadowBlur=12;ctx.shadowOffsetY=4;ctx.beginPath();ctx.arc(lh.x,lh.y,lh.r,0,Math.PI*2);ctx.fillStyle=locked?'rgba(80,0,80,0.8)':'rgba(0,0,0,0.85)';ctx.fill();ctx.restore();
          gl(c,locked?14:5);ctx.beginPath();ctx.arc(lh.x,lh.y,lh.r,0,Math.PI*2);ctx.strokeStyle=c;ctx.lineWidth=2.5;ctx.stroke();
          if(locked){const ig=ctx.createRadialGradient(lh.x,lh.y,0,lh.x,lh.y,lh.r);ig.addColorStop(0,'rgba(255,100,255,0.5)');ig.addColorStop(1,'rgba(255,100,255,0)');ctx.fillStyle=ig;ctx.beginPath();ctx.arc(lh.x,lh.y,lh.r,0,Math.PI*2);ctx.fill();}ng();
          ctx.fillStyle=c;ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(locked?'●':'○',lh.x,lh.y+3);
        });
        ctx.fillStyle=locksLit>0?'#ff88ff':'rgba(120,40,150,0.4)';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(`VAULT ${locksLit}/3`,LOCK_HOLES[1].x,LOCK_HOLES[2].y+22);
      }

      // ── DROP TARGETS ──────────────────────────────────────────────────────
      // WEDNESDAY mode: drops glow blue with 4× label, sequence arrows
      ctx.globalAlpha=Math.max(0.2,dropAct<1?dropAct:1);
      if(mIdx===1){
        const pulse=0.6+0.4*Math.abs(Math.sin(s.tick*0.14));
        gl(MODES[1].color,Math.round(18*pulse));ctx.strokeStyle=MODES[1].color;ctx.lineWidth=2;
        ctx.strokeRect(138,296,140,28);ng();
        ctx.globalAlpha=pulse;ctx.fillStyle=MODES[1].color;ctx.font='bold 11px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('▼ HIT ALL — 4× ▼',185,292);ctx.globalAlpha=Math.max(0.2,dropAct<1?dropAct:1);
      } else if(mIdx===4){
        ctx.fillStyle=MODES[4].color;ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('▼ DROPS 5× ▼',185,292);
      } else {
        ctx.fillStyle='rgba(200,100,20,0.4)';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('▼  DROP TARGETS  ▼',185,302);
      }
      s.drops.forEach((drop:any)=>{const fl=drop.flash>0,x=drop.x,y=drop.y,w=drop.w,h=drop.h;if(drop.down){ctx.save();ctx.shadowColor='rgba(0,0,0,0.5)';ctx.shadowBlur=4;ctx.shadowOffsetY=2;ctx.fillStyle=fl?'rgba(255,120,0,0.6)':'rgba(30,12,0,0.7)';ctx.fillRect(x,y+h-3,w,4);ctx.restore();ctx.fillStyle='rgba(60,25,0,0.4)';ctx.fillRect(x+1,y+1,w-2,h-2);}else{ctx.save();ctx.shadowColor='rgba(0,0,0,0.7)';ctx.shadowBlur=8;ctx.shadowOffsetX=2;ctx.shadowOffsetY=5;ctx.fillStyle='#000';ctx.fillRect(x,y,w,h);ctx.restore();const faceG=ctx.createLinearGradient(x,y,x,y+h);if(fl){faceG.addColorStop(0,'#ff9900');faceG.addColorStop(0.5,'#dd5500');faceG.addColorStop(1,'#992200');}else{faceG.addColorStop(0,'#ee5500');faceG.addColorStop(0.5,'#cc2200');faceG.addColorStop(1,'#881100');}ctx.fillStyle=faceG;ctx.fillRect(x,y,w,h);ctx.fillStyle=fl?'rgba(255,210,100,0.7)':'rgba(255,150,60,0.5)';ctx.fillRect(x+1,y,w-2,3);ctx.fillStyle=fl?'rgba(255,200,80,0.5)':'rgba(255,130,50,0.3)';ctx.fillRect(x,y,2,h);ctx.fillStyle='rgba(0,0,0,0.35)';ctx.fillRect(x+w-2,y,2,h);ctx.fillRect(x,y+h-2,w,2);ctx.fillStyle=fl?'#fff':'rgba(255,220,160,0.9)';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(`${drop.pts}`,x+w/2,y+h-1);if(fl){gl('#ff8800',12);ctx.strokeStyle='#ffaa44';ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);ng();}}});ctx.globalAlpha=1;

      // ── SPINNER ───────────────────────────────────────────────────────────
      {const fl=s.spinnerFlash>0,spinning=Math.abs(s.spinnerSpin)>1;const c=fl||spinning?'#00ffdd':'rgba(0,130,100,0.5)';gl(c,fl?18:spinning?12:4);const cos=Math.cos(s.spinnerAngle),sin=Math.sin(s.spinnerAngle);ctx.strokeStyle=c;ctx.lineWidth=fl?3:2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(SPINNER.x-SPINNER.len*cos,SPINNER.y-SPINNER.len*sin);ctx.lineTo(SPINNER.x+SPINNER.len*cos,SPINNER.y+SPINNER.len*sin);ctx.stroke();ctx.globalAlpha=0.4;ctx.beginPath();ctx.moveTo(SPINNER.x-SPINNER.len*sin,SPINNER.y+SPINNER.len*cos);ctx.lineTo(SPINNER.x+SPINNER.len*sin,SPINNER.y-SPINNER.len*cos);ctx.stroke();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(SPINNER.x,SPINNER.y,3,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();ng();ctx.fillStyle=c;ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('SPIN',SPINNER.x,SPINNER.y+14);}

      // ── CHANDELIER ────────────────────────────────────────────────────────
      {const ch=s.chand;const chTX=200+Math.sin(ch.angle)*72,chTY=42+Math.cos(ch.angle)*72;const lit=ch.flash>0;
        ctx.save();ctx.shadowColor='rgba(0,0,0,0.35)';ctx.shadowBlur=6;ctx.shadowOffsetY=3;ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(200,42);ctx.lineTo(chTX,chTY);ctx.stroke();ctx.restore();
        const segs=8;for(let i=0;i<segs;i++){const t0=i/segs,t1=(i+1)/segs;const ax=200+Math.sin(ch.angle*t0)*72*t0,ay=42+Math.cos(ch.angle*t0)*72*t0;const bx=200+Math.sin(ch.angle*t1)*72*t1,by=42+Math.cos(ch.angle*t1)*72*t1;ctx.strokeStyle=lit?'#ffee88':'#cc9922';ctx.lineWidth=i%2===0?3:2;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();}
        const gemR=13;const gemG=ctx.createRadialGradient(chTX-5,chTY-5,0,chTX,chTY,gemR);if(lit){gemG.addColorStop(0,'#fff');gemG.addColorStop(0.3,'#ffeeaa');gemG.addColorStop(1,'#664400');}else{gemG.addColorStop(0,'#ffeecc');gemG.addColorStop(0.4,'#cc9933');gemG.addColorStop(1,'#442200');}gl(lit?'rgba(255,200,0,0.8)':'rgba(180,140,0,0.4)',lit?18:6);ctx.beginPath();ctx.arc(chTX,chTY,gemR,0,Math.PI*2);ctx.fillStyle=gemG;ctx.fill();for(let i=0;i<8;i++){const a=i/8*Math.PI*2;ctx.strokeStyle=lit?'rgba(255,240,180,0.6)':'rgba(220,180,80,0.3)';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(chTX,chTY);ctx.lineTo(chTX+Math.cos(a)*gemR,chTY+Math.sin(a)*gemR);ctx.stroke();}ctx.strokeStyle=lit?'rgba(255,220,100,0.8)':'rgba(200,160,60,0.4)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(chTX,chTY,gemR,0,Math.PI*2);ctx.stroke();ng();const mG3=ctx.createRadialGradient(200-2,42-2,0,200,42,6);mG3.addColorStop(0,'#ffee88');mG3.addColorStop(1,'#442200');gl('#cc9900',5);ctx.beginPath();ctx.arc(200,42,6,0,Math.PI*2);ctx.fillStyle=mG3;ctx.fill();ng();}

      // ── EXTRA BALL TARGET ─────────────────────────────────────────────────
      {const hit=s.xballHit,fl=s.xballFlash>0;const pulse=0.65+0.35*Math.abs(Math.sin(s.tick*0.14));
        ctx.save();ctx.shadowColor=hit?'rgba(0,0,0,0.3)':'rgba(255,255,0,0.7)';ctx.shadowBlur=hit?4:14;ctx.shadowOffsetY=3;ctx.beginPath();ctx.arc(XBALL_TARGET.x,XBALL_TARGET.y,XBALL_TARGET.r+2,0,Math.PI*2);ctx.fillStyle=hit?'rgba(40,40,0,0.7)':'rgba(50,50,0,0.8)';ctx.fill();ctx.restore();
        gl(hit?'rgba(80,80,0,0.3)':'#ffff00',hit?2:10);ctx.beginPath();ctx.arc(XBALL_TARGET.x,XBALL_TARGET.y,XBALL_TARGET.r+2,0,Math.PI*2);ctx.strokeStyle=hit?'rgba(80,80,0,0.3)':'#ffff00';ctx.lineWidth=2;ctx.stroke();ng();
        ctx.fillStyle=hit?'rgba(80,80,0,0.5)':'#ffff00';ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(hit?'✓ USED':'⭐XBALL',XBALL_TARGET.x,XBALL_TARGET.y+3);
        if(s.extraBalls>0){gl('#ffff00',10);ctx.fillStyle='#ffff00';ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='right';ctx.fillText(`⭐×${s.extraBalls}`,WALL_R-5,H-20);ng();}
      }

      // ── INLANE ROLLOVERS ─────────────────────────────────────────────────
      s.inlaneRollovers.forEach((rol:any)=>{const c=rol.lit?'#44ffaa':'rgba(0,80,50,0.45)';gl(c,rol.lit?14:3);ctx.beginPath();ctx.arc(rol.x,rol.y,rol.r,0,Math.PI*2);ctx.fillStyle=rol.lit?'rgba(20,100,60,0.8)':'rgba(0,15,8,0.6)';ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2;ctx.stroke();ng();ctx.fillStyle=rol.lit?'#44ffaa':'rgba(0,120,70,0.5)';ctx.font='bold 8px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(rol.side==='L'?'▶':'◀',rol.x,rol.y+3);});

      // ── MULTIBALL JACKPOT ─────────────────────────────────────────────────
      if(s.jackpotActive&&s.multiball){const pulse=0.5+0.5*Math.abs(Math.sin(s.tick*0.22));ctx.globalAlpha=s.jackpotFlash>0?1:pulse;gl('#ff44ff',s.jackpotFlash>0?24:14);ctx.fillStyle='#ff88ff';ctx.font=`bold ${s.jackpotFlash>0?14:11}px "Courier New",monospace`;ctx.textAlign='center';ctx.fillText(`🎯 JACKPOT ${s.jackpotValue.toLocaleString()}`,W/2,170);ng();ctx.globalAlpha=1;}

      // ── FLIPPERS ─────────────────────────────────────────────────────────
      drawFlipper(FL,s.leftA,s.tilted?false:s.leftUp);
      drawFlipper(FR,s.rightA,s.tilted?false:s.rightUp);

      // ── BALLS ─────────────────────────────────────────────────────────────
      s.balls.forEach((b:any)=>drawBall(b,s.ballFlash));
      if(s.inLane)drawBall({x:362,y:s.laneY},0);

      // ── PLUNGER with skill shot zone meter ──────────────────────────────────
      if(s.inLane){
        // Spring coils
        const springTop=614+s.plunger*52;
        for(let cy=springTop;cy<698;cy+=7){
          const cg=ctx.createLinearGradient(355,cy,370,cy);cg.addColorStop(0,'#3a2808');cg.addColorStop(0.5,'#6a4a18');cg.addColorStop(1,'#3a2808');
          ctx.strokeStyle=cg;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(362,cy+3,6,2,0,0,Math.PI*2);ctx.stroke();
        }
        // Plunger tip
        const hue=(1-s.plunger)*50+20;
        ctx.fillStyle=s.charging?`hsl(${hue},100%,55%)`:'#5a3800';
        gl(ctx.fillStyle,s.charging?16:4);ctx.beginPath();ctx.roundRect(352,springTop-10,20,11,4);ctx.fill();ng();

        // ── POWER METER with skill shot zones (left side of lane) ──────────
        const meterX=WALL_L+5,meterY=H-110,meterW=14,meterH=90;
        // Background
        ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(meterX-2,meterY-2,meterW+4,meterH+4);
        ctx.strokeStyle='#442200';ctx.lineWidth=1;ctx.strokeRect(meterX-2,meterY-2,meterW+4,meterH+4);
        // Zone bands (bottom=soft, top=full)
        const zones=[
          {min:0,   max:0.28,col:'rgba(50,50,50,0.6)',  label:'SOFT'},
          {min:0.28,max:0.56,col:SKILL_ZONES[0].color+'99',label:'ORBIT'},
          {min:0.56,max:0.82,col:SKILL_ZONES[1].color+'99',label:'LANES'},
          {min:0.82,max:1.0, col:SKILL_ZONES[2].color+'99',label:'RAMP'},
        ];
        zones.forEach(z=>{
          const yBot=meterY+meterH-(z.max*meterH);const yTop=meterY+meterH-(z.min*meterH)-((z.max-z.min)*meterH);
          const zh=(z.max-z.min)*meterH;
          ctx.fillStyle=z.col;ctx.fillRect(meterX,meterY+meterH-z.max*meterH,meterW,zh);
        });
        // Skill shot zone highlight (brighter, pulsing)
        if(s.skillShotActive){
          const sz=SKILL_ZONES[s.skillShotTarget];
          const szPulse=0.5+0.5*Math.abs(Math.sin(s.tick*0.18));
          const szY=meterY+meterH-sz.max*meterH;const szH=(sz.max-sz.min)*meterH;
          gl(sz.color,Math.round(12*szPulse));
          ctx.fillStyle=sz.color+(szPulse>0.7?'cc':'88');ctx.fillRect(meterX,szY,meterW,szH);
          ctx.strokeStyle=sz.color;ctx.lineWidth=2;ctx.strokeRect(meterX,szY,meterW,szH);ng();
          // Arrow pointing at zone
          ctx.fillStyle=sz.color;ctx.font='bold 7px "Courier New",monospace';ctx.textAlign='left';
          ctx.fillText('◀ '+sz.name,meterX+meterW+3,szY+szH/2+3);
        }
        // Current power indicator line
        if(s.charging&&s.plunger>0){
          const indY=meterY+meterH-s.plunger*meterH;
          ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fillRect(meterX-4,indY-2,meterW+8,4);
          gl('white',8);ctx.strokeStyle='white';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(meterX-4,indY);ctx.lineTo(meterX+meterW+4,indY);ctx.stroke();ng();
        }
        // Zone label at bottom
        ctx.fillStyle='rgba(200,144,10,0.7)';ctx.font='bold 6px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText('POWER',meterX+meterW/2,meterY+meterH+9);

        // Skill shot instruction below plunger
        if(s.skillShotActive){
          const sz=SKILL_ZONES[s.skillShotTarget];
          const pulse=0.6+0.4*Math.abs(Math.sin(s.tick*0.2));
          ctx.globalAlpha=pulse;gl(sz.color,10);ctx.fillStyle=sz.color;
          ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';
          ctx.fillText(`★ AIM FOR ${sz.name.toUpperCase()} ZONE`,200,H-6);ng();ctx.globalAlpha=1;
        } else if(s.charging){
          ctx.fillStyle='rgba(200,144,10,0.6)';ctx.font='bold 9px "Courier New",monospace';ctx.textAlign='center';
          ctx.fillText('▼ HOLD SPACE · RELEASE TO LAUNCH ▼',200,H-6);
        }
      }

      // ── FLOATS ────────────────────────────────────────────────────────────
      s.floats.forEach((f:any)=>{ctx.globalAlpha=Math.min(1,f.t/25);gl(f.color,10);ctx.fillStyle=f.color;ctx.font='bold 13px "Times New Roman",serif';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);ng();ctx.globalAlpha=1;});

      // ── CONTEXTUAL PLAY HINTS (no mode, idle state) ─────────────────────────
      if(mIdx<0&&!s.multiball&&!s.bonusActive&&s.balls.length>0){
        const hPulse=0.4+0.3*Math.abs(Math.sin(s.tick*0.06));
        // Hint changes based on what's most worth doing
        const locksLeft=3-s.locks.filter((l:any)=>l.locked).length;
        const gomezLeft=s.targets.filter((t:any)=>!t.hit).length;
        if(locksLeft>0&&locksLeft<3){
          ctx.globalAlpha=hPulse;ctx.fillStyle='#ff88ff';ctx.font='bold 8px "Courier New",monospace';ctx.textAlign='center';
          ctx.fillText(`▶ ${locksLeft} MORE LOCK${locksLeft>1?'S':''} → MULTIBALL`,W/2,H-18);ctx.globalAlpha=1;
        } else if(gomezLeft===1){
          ctx.globalAlpha=hPulse;ctx.fillStyle='#ffd700';ctx.font='bold 8px "Courier New",monospace';ctx.textAlign='center';
          ctx.fillText(`★ 1 TARGET LEFT → MODE START`,W/2,H-18);ctx.globalAlpha=1;
        }
      }

      // ── END OF BALL BONUS SEQUENCE ──────────────────────────────────────────
      if(s.bonusActive){
        const fadeIn=Math.min(1,s.bonusTick/20);
        ctx.globalAlpha=fadeIn*0.82;
        ctx.fillStyle='rgba(0,0,0,0.85)';ctx.fillRect(WALL_L+10,260,WALL_R-WALL_L-20,160);
        ctx.strokeStyle='#c8900a';ctx.lineWidth=2;ctx.strokeRect(WALL_L+10,260,WALL_R-WALL_L-20,160);
        ctx.globalAlpha=fadeIn;
        // Title
        gl('#c8900a',10);ctx.fillStyle='#c8900a';ctx.font='bold 14px "Times New Roman",serif';ctx.textAlign='center';ctx.fillText('✦ END OF BALL BONUS ✦',W/2,285);ng();
        // Bonus breakdown
        ctx.font='11px "Courier New",monospace';ctx.fillStyle='rgba(255,220,100,0.9)';
        ctx.fillText(`BUMPERS   ${s.bumperHits}× 10 = ${s.bumperHits*10}`,W/2,308);
        ctx.fillText(`RAMPS     ${s.rampCount}× 50 = ${s.rampCount*50}`,W/2,324);
        ctx.fillText(`MULTIPLIER  ${s.bonusMult}×`,W/2,340);
        // Countdown bar
        const origBonus=s.bumperHits*10+s.rampCount*50+(s.topLaneMult-1)*200+s.bearTrap.completions*100||1;
        const pct2=s.bonusValue/origBonus;
        ctx.fillStyle='rgba(30,15,0,0.7)';ctx.fillRect(WALL_L+20,358,WALL_R-WALL_L-40,12);
        const barG=ctx.createLinearGradient(WALL_L+20,0,WALL_R-20,0);barG.addColorStop(0,'#ff6600');barG.addColorStop(1,'#ffcc00');
        gl('#ff8800',8);ctx.fillStyle=barG;ctx.fillRect(WALL_L+20,358,(WALL_R-WALL_L-40)*pct2,12);ng();
        // Awarding counter
        gl('#ffff00',8);ctx.fillStyle='#ffff00';ctx.font='bold 16px "Courier New",monospace';ctx.textAlign='center';ctx.fillText(`AWARDING: ${s.bonusValue}`,W/2,390);ng();
        ctx.globalAlpha=1;
      }

      // COMBO
      if(s.combo>=3&&s.comboTimer>0){ctx.globalAlpha=Math.min(1,s.comboTimer/40);const cc=s.combo>=5?'#ff44ff':'#ffaa00';gl(cc,20);ctx.fillStyle=cc;ctx.font=`bold ${s.combo>=5?18:15}px "Times New Roman",serif`;ctx.textAlign='center';ctx.fillText(`${s.combo>=5?'3×':'2×'} COMBO!`,W/2,382);ng();ctx.globalAlpha=1;}

      // MULTIBALL
      if(s.multiball&&s.balls.length>1){const pulse=0.6+0.4*Math.abs(Math.sin(s.tick*0.14));ctx.globalAlpha=pulse;gl('#cc44ff',14);ctx.fillStyle='#dd66ff';ctx.font='bold 13px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('✦  M U L T I B A L L  ✦',W/2,56);ng();ctx.globalAlpha=1;}

      // MODE
      if(s.modeIdx>=0){
        const md=MODES[s.modeIdx],pulse=0.75+0.25*Math.abs(Math.sin(s.tick*0.1));
        ctx.globalAlpha=pulse;
        // Mode pill background
        ctx.fillStyle='rgba(0,0,0,0.72)';ctx.beginPath();ctx.roundRect(W/2-105,458,210,46,8);ctx.fill();
        ctx.strokeStyle=md.color;ctx.lineWidth=2;gl(md.color,14);ctx.stroke();ng();
        // Mode name + objective progress
        const progStr=s.modeIdx===4
          ? `${Math.max(0,s.modeObjective-Math.floor((MODE_DURATION-s.modeTimer)/60))}s LEFT`
          : `${s.modeProgress}/${s.modeObjective}`;
        ctx.fillStyle=md.color;ctx.font='bold 13px "Courier New",monospace';ctx.textAlign='center';
        ctx.fillText(`⚡ ${md.name}: ${progStr}`,W/2,477);
        // Progress bar
        const pPct=Math.min(1,s.modeProgress/Math.max(1,s.modeObjective));
        ctx.fillStyle='rgba(255,255,255,0.15)';ctx.fillRect(W/2-90,482,180,7);
        const pG=ctx.createLinearGradient(W/2-90,0,W/2+90,0);pG.addColorStop(0,md.color);pG.addColorStop(1,'#ffffff');
        gl(md.color,6);ctx.fillStyle=pG;ctx.fillRect(W/2-90,482,180*pPct,7);ng();
        // Jackpot value if applicable
        if(s.modeJackpot>0){ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='bold 8px "Courier New",monospace';ctx.fillText(`JACKPOT: ${s.modeJackpot.toLocaleString()}`,W/2,498);}
        else{ctx.fillStyle='rgba(255,255,255,0.6)';ctx.font='bold 8px "Courier New",monospace';ctx.fillText(md.desc,W/2,498);}
        ctx.globalAlpha=1;
        // Small label below HUD
        gl(md.color,8);ctx.fillStyle=md.color;ctx.font='bold 10px "Courier New",monospace';
        ctx.fillText(`⚡ ${md.name} ${progStr}`,W/2,54);ng();
      }

      // ── HUD ───────────────────────────────────────────────────────────────
      const hudG=ctx.createLinearGradient(0,0,0,40);hudG.addColorStop(0,'#080010');hudG.addColorStop(1,'rgba(6,0,8,0.96)');ctx.fillStyle=hudG;ctx.fillRect(0,0,W,40);
      gl('#c8900a',8);ctx.strokeStyle='#c8900a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,40);ctx.lineTo(W,40);ctx.stroke();ng();
      gl('#c8900a',8);ctx.fillStyle='#c8900a';ctx.font='bold 14px "Courier New",monospace';ctx.textAlign='left';ctx.fillText(s.score.toString().padStart(8,'0'),30,26);ng();
      for(let i=0;i<s.lives;i++){gl('#cc1144',8);ctx.fillStyle='#cc1144';ctx.font='14px serif';ctx.textAlign='left';ctx.fillText('♥',W-28-(s.lives-1-i)*18,27);ng();}
      ctx.textAlign='center';ctx.fillStyle='#5a3800';ctx.font='9px "Courier New",monospace';ctx.fillText(`HI  ${s.highScore.toString().padStart(8,'0')}`,W/2,22);
      ctx.fillStyle='rgba(200,144,10,0.2)';ctx.font='7px "Courier New",monospace';ctx.fillText('ADDAMS MANSION',W/2,33);
      if(!s.tilted&&!s.gameOver&&s.balls.length>0&&s.ballSaveTimer===0&&s.modeIdx<0){ctx.fillStyle='rgba(57,196,0,0.25)';ctx.font='9px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('Z/← LEFT   SPACE LAUNCH   →/X RIGHT',W/2,H-6);}
      if(s.inLane&&!s.gameOver){const glow=0.5+0.5*Math.abs(Math.sin(s.tick*0.08));ctx.fillStyle=`rgba(200,144,10,${glow*0.65})`;ctx.font='10px "Courier New",monospace';ctx.textAlign='center';ctx.fillText('▼  HOLD SPACE · RELEASE TO LAUNCH  ▼',W/2,H-6);}

      // ── GAME OVER ─────────────────────────────────────────────────────────
      if(s.gameOver){const goG=ctx.createRadialGradient(W/2,H/2,50,W/2,H/2,W);goG.addColorStop(0,'rgba(5,0,10,0.87)');goG.addColorStop(1,'rgba(0,0,5,0.97)');ctx.fillStyle=goG;ctx.fillRect(0,0,W,H);gl('#aa00cc',40);ctx.fillStyle='#cc44ff';ctx.font='bold 40px "Times New Roman",serif';ctx.textAlign='center';ctx.fillText("THEY'RE CREEPY!",W/2,H/2-50);ng();gl('#cc1144',20);ctx.fillStyle='#cc1144';ctx.font='bold 22px "Times New Roman",serif';ctx.fillText("AND THEY'RE KOOKY…",W/2,H/2-20);ng();ctx.strokeStyle='#c8900a';ctx.lineWidth=1;ctx.strokeRect(W/2-90,H/2-4,180,56);ctx.fillStyle='rgba(10,0,5,0.6)';ctx.fillRect(W/2-90,H/2-4,180,56);gl('#c8900a',6);ctx.fillStyle='#c8900a';ctx.font='14px "Courier New",monospace';ctx.fillText(`SCORE  ${s.score.toString().padStart(8,'0')}`,W/2,H/2+18);ng();gl('#ffd700',6);ctx.fillStyle='#ffd700';ctx.fillText(`BEST   ${s.highScore.toString().padStart(8,'0')}`,W/2,H/2+40);ng();if(Math.floor(Date.now()/600)%2===0){ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='12px "Courier New",monospace';ctx.fillText('PRESS SPACE / TAP TO PLAY AGAIN',W/2,H/2+76);}}

      const vig=ctx.createRadialGradient(W/2,H/2,H*0.3,W/2,H/2,H*0.75);vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(0,0,0,0.52)');ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);
      ctx.fillStyle='rgba(0,0,0,0.04)';for(let y=0;y<H;y+=2)ctx.fillRect(0,y,W,1);
      ctx.restore();
    }

    function loop(){update();draw();animRef.current=requestAnimationFrame(loop);}

    function onKeyDown(e:KeyboardEvent){const s=sRef.current;ensureMusic();resumeAC();if(['ArrowLeft','z','Z'].includes(e.key))s.leftUp=true;if(['ArrowRight','/','?','x','X'].includes(e.key))s.rightUp=true;if(e.key==='ArrowLeft'&&e.shiftKey)nudgeRef.current('L');if(e.key==='ArrowRight'&&e.shiftKey)nudgeRef.current('R');if(e.key.toLowerCase()==='n')nudgeRef.current(Math.random()<0.5?'L':'R');if(e.key===' '||e.key==='ArrowDown'){e.preventDefault();if(s.gameOver){sRef.current=mkState();return;}if(s.inLane)s.charging=true;}}
    function onKeyUp(e:KeyboardEvent){const s=sRef.current;if(['ArrowLeft','z','Z'].includes(e.key))s.leftUp=false;if(['ArrowRight','/','?','x','X'].includes(e.key))s.rightUp=false;if((e.key===' '||e.key==='ArrowDown')&&s.inLane&&s.charging){e.preventDefault();sfx('launch',s.plunger);let kvx=-0.3;if(s.plunger<0.28){kvx=-2.2;}else if(s.plunger<0.56){kvx=-1.6;}else if(s.plunger<0.82){kvx=-0.8;}else{kvx=-0.2;}if(s.skillShotActive){const sz=SKILL_ZONES[s.skillShotTarget];if(s.plunger>=sz.min&&s.plunger<=sz.max){setTimeout(()=>{if(sRef.current){const sc=sRef.current;sc.score+=2500;sfx('skillShot');vibe([20,20,20,60]);addFloat(200,200,'SKILL SHOT! +2500','#ffff00');sc.skillShotActive=false;}},300);}}s.balls.push({x:362,y:s.laneY,vx:kvx,vy:-(s.plunger*19+5),fromLane:true});s.inLane=false;s.charging=false;s.plunger=0;s.ballSaveTimer=BALL_SAVE_FRAMES;}}

    function onTouchStart(e:TouchEvent){
      e.preventDefault();
      resumeAC();   // call directly on every touch — fastest possible unlock
      unlockAudio();
      if(audioRef.current){
        const ac=audioRef.current.ac;
        if(ac.state!=='running'){
          ac.resume().then(()=>{
            try{const b=ac.createBuffer(1,1,ac.sampleRate);const s2=ac.createBufferSource();s2.buffer=b;s2.connect(ac.destination);s2.start(0);}catch(er){}
          }).catch(()=>{});
        }
      }
      const s=sRef.current;ensureMusic();if(s.gameOver){sRef.current=mkState();return;}const rect=canvas.getBoundingClientRect();Array.from(e.touches).forEach((t:Touch)=>{if(t.clientX-rect.left<rect.width/2)s.leftUp=true;else s.rightUp=true;});if(s.inLane)s.charging=true;}
    function onTouchEnd(e:TouchEvent){e.preventDefault();const s=sRef.current;const rect=canvas.getBoundingClientRect();const ts=Array.from(e.touches);if(!ts.some((t:any)=>t.clientX-rect.left<rect.width/2))s.leftUp=false;if(!ts.some((t:any)=>t.clientX-rect.left>=rect.width/2))s.rightUp=false;if(ts.length===0&&s.inLane&&s.charging){
      sfx('launch',s.plunger);
      let tvx=-0.3;
      if(s.plunger<0.28){tvx=-2.2;}else if(s.plunger<0.56){tvx=-1.6;}else if(s.plunger<0.82){tvx=-0.8;}else{tvx=-0.2;}
      if(s.skillShotActive){const sz=SKILL_ZONES[s.skillShotTarget];if(s.plunger>=sz.min&&s.plunger<=sz.max){setTimeout(()=>{if(sRef.current){const sc=sRef.current;sc.score+=2500;sfx('skillShot');vibe([20,20,20,60]);addFloat(200,200,'SKILL SHOT! +2500','#ffff00');sc.skillShotActive=false;}},300);}}
      s.balls.push({x:362,y:s.laneY,vx:tvx,vy:-(s.plunger*19+5),fromLane:true});
      s.inLane=false;s.charging=false;s.plunger=0;s.ballSaveTimer=BALL_SAVE_FRAMES;
    }}

    window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);
    canvas.addEventListener('touchstart',onTouchStart,{passive:false});canvas.addEventListener('touchend',onTouchEnd,{passive:false});canvas.addEventListener('touchcancel',onTouchEnd,{passive:false});
    spawnLaneBall();animRef.current=requestAnimationFrame(loop);
    return()=>{clearInterval(batInt);cancelAnimationFrame(animRef.current!);audioRef.current?.stopMusic();window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);canvas.removeEventListener('touchstart',onTouchStart);canvas.removeEventListener('touchend',onTouchEnd);canvas.removeEventListener('touchcancel',onTouchEnd);};
  },[mkState]);

  function doNudge(dir:'L'|'R'){
    const s=sRef.current;if(!s||s.gameOver||s.inLane||s.nudgeCooldown>0)return;
    s.nudgeCooldown=120;
    const force=dir==='L'?-8:8;
    s.balls.forEach((b:any)=>{if(b.onRamp)return;b.vx+=force+(Math.random()-0.5)*3;b.vy-=3+Math.random()*3;});
    if(s.shake)s.shake={x:0,y:0,frames:14,mag:8};
    sfx('nudge');vibe([30,20,30]);
    s.rapidPresses+=3;s.rapidTimer=55;
    s.floats.push({x:200,y:400,text:dir==='L'?'◀ NUDGE':'NUDGE ▶',color:'#cc8800',t:70});
  }

  nudgeRef.current=doNudge;
  function toggleMute(){muteRef.current=!muteRef.current;setMuted(muteRef.current);if(audioRef.current)audioRef.current.master.gain.setValueAtTime(muteRef.current?0:0.7,audioRef.current.ac.currentTime);if(muteRef.current)audioRef.current?.stopMusic();}
  function toggleMusic(){const a=audioRef.current;if(!a)return;if(a.isPlaying){a.stopMusic();setMusicOn(false);}else{a.startMusic();setMusicOn(true);}}
  const btn:React.CSSProperties={background:'none',border:'1px solid #5a3a00',borderRadius:4,color:'#c8900a',cursor:'pointer',fontSize:14,padding:'2px 8px',lineHeight:'1',fontFamily:'"Courier New",monospace'};

  const [viewport,setViewport]=useState({w:0,h:0});
  useEffect(()=>{
    function measure(){const vv=(window as any).visualViewport;setViewport({w:vv?vv.width:window.innerWidth,h:vv?vv.height:window.innerHeight});}
    measure();window.addEventListener('resize',measure);
    const vv=(window as any).visualViewport;
    if(vv){vv.addEventListener('resize',measure);vv.addEventListener('scroll',measure);}
    return()=>{window.removeEventListener('resize',measure);if(vv){vv.removeEventListener('resize',measure);vv.removeEventListener('scroll',measure);}};
  },[]);

  const isMobile=viewport.w>0&&viewport.w<600;
  const scale=viewport.w>0?Math.min(viewport.w/(isMobile?W:W+80),(isMobile?viewport.h:viewport.h-80)/H):1;
  const cw=Math.round(W*scale),ch=Math.round(H*scale);

  const cabinetBtn:React.CSSProperties={background:'none',border:'1px solid #5a3a00',borderRadius:4,color:'#c8900a',cursor:'pointer',fontSize:13,padding:'3px 10px',fontFamily:'"Courier New",monospace',letterSpacing:1};

  return(
    <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'radial-gradient(ellipse at 50% 40%, #1a0a00 0%, #0a0400 60%, #000 100%)',overflow:'hidden',userSelect:'none'}}>
      {/* Cabinet wrapper */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:0}}>
        {/* Top bezel — backglass panel */}
        {!isMobile&&<div style={{width:cw+24,background:'linear-gradient(180deg,#1a1008 0%,#0d0804 100%)',border:'1px solid #3a2008',borderBottom:'none',borderRadius:'8px 8px 0 0',padding:'8px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'0 -4px 20px rgba(200,144,10,0.15)'}}>
          <div style={{color:'#c8900a',fontFamily:'"Times New Roman",serif',fontSize:14,letterSpacing:4,textShadow:'0 0 10px #c8900a88'}}>⚰ ADDAMS MANSION PINBALL ⚰</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={toggleMute} style={cabinetBtn}>{muted?'🔇':'🔊'}</button>
            <button onClick={toggleMusic} style={cabinetBtn}>{musicOn?'⏸':'▶'}</button>
          </div>
        </div>}
        {/* Side rails + canvas */}
        <div style={{display:'flex',alignItems:'stretch',gap:0}}>
          {!isMobile&&<div style={{width:12,background:'linear-gradient(90deg,#2a1808,#1a0f04,#2a1808)',border:'1px solid #3a2008',borderRight:'none'}}/>}
          <div style={{position:'relative'}}>
            <canvas ref={canvasRef} width={W} height={H} style={{display:'block',touchAction:'none',width:cw,height:ch,border:isMobile?'2px solid #c8900a':'none',boxShadow:'0 0 60px rgba(124,34,204,0.4),0 0 120px rgba(200,144,10,0.15)'}}/>
            {/* Mobile audio/controls overlay */}
            {isMobile&&<div style={{position:'absolute',top:6,right:6,display:'flex',gap:5,zIndex:10}}>
              <button onClick={toggleMute} style={btn}>{muted?'🔇':'🔊'}</button>
              <button onClick={toggleMusic} style={btn}>{musicOn?'⏸':'▶'}</button>
            </div>}
            {/* Audio unlock prompt — shows until user taps */}
            {showAudioPrompt&&!audioUnlocked&&<div onClick={unlockAudio} style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',paddingBottom:40,background:'transparent',cursor:'pointer',zIndex:20}}>
              <div style={{background:'rgba(0,0,0,0.82)',border:'1px solid #c8900a',borderRadius:8,padding:'10px 20px',textAlign:'center',animation:'pulse 1.5s ease-in-out infinite'}}>
                <div style={{color:'#c8900a',fontSize:16,fontFamily:'"Courier New",monospace',letterSpacing:2}}>🔊 TAP TO ENABLE SOUND</div>
                <div style={{color:'rgba(200,144,10,0.6)',fontSize:10,marginTop:4,fontFamily:'"Courier New",monospace'}}>iOS requires a tap to unlock audio</div>
              </div>
            </div>}
            {/* Nudge buttons — always rendered, always available */}
            <div style={{position:'absolute',bottom:36,left:0,right:0,display:'flex',justifyContent:'space-between',padding:'0 6px',zIndex:5,pointerEvents:'none'}}>
              <button onPointerDown={e=>{e.preventDefault();unlockAudio();doNudge('L');}}
                style={{pointerEvents:'all',background:'rgba(0,0,0,0.72)',border:'1px solid #664400',borderRadius:6,color:'#cc8800',fontSize:11,padding:'6px 12px',fontFamily:'"Courier New",monospace',letterSpacing:1,touchAction:'none',userSelect:'none'}}>
                ◀ NUDGE
              </button>
              <button onPointerDown={e=>{e.preventDefault();unlockAudio();doNudge('R');}}
                style={{pointerEvents:'all',background:'rgba(0,0,0,0.72)',border:'1px solid #664400',borderRadius:6,color:'#cc8800',fontSize:11,padding:'6px 12px',fontFamily:'"Courier New",monospace',letterSpacing:1,touchAction:'none',userSelect:'none'}}>
                NUDGE ▶
              </button>
            </div>
            {/* Initials entry overlay */}
            {showInitials&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.88)',zIndex:30}}>
              <div style={{background:'#0a0010',border:'2px solid #c8900a',borderRadius:10,padding:'28px 32px',textAlign:'center',minWidth:260}}>
                <div style={{color:'#c8900a',fontSize:18,fontFamily:'"Times New Roman",serif',marginBottom:4}}>✦ HIGH SCORE ✦</div>
                <div style={{color:'#ffd700',fontSize:28,fontFamily:'"Courier New",monospace',marginBottom:16,letterSpacing:4}}>{sRef.current?.score?.toLocaleString()}</div>
                <div style={{color:'rgba(200,144,10,0.8)',fontSize:11,fontFamily:'"Courier New",monospace',marginBottom:10,letterSpacing:2}}>ENTER YOUR INITIALS</div>
                <input maxLength={3} value={initials} onChange={e=>setInitials(e.target.value.toUpperCase())}
                  style={{background:'#000',border:'2px solid #c8900a',borderRadius:4,color:'#ffd700',fontSize:28,fontFamily:'"Courier New",monospace',textAlign:'center',width:100,letterSpacing:8,padding:'6px 8px',outline:'none'}}
                  autoFocus placeholder="AAA"/>
                <div style={{display:'flex',gap:10,marginTop:16,justifyContent:'center'}}>
                  <button onClick={()=>{submitScore(initials||'???',sRef.current?.score||0);}} style={{...cabinetBtn,background:'#c8900a22',padding:'8px 20px',fontSize:13}}>SUBMIT</button>
                  <button onClick={()=>setShowInitials(false)} style={{...cabinetBtn,padding:'8px 16px',fontSize:13}}>SKIP</button>
                </div>
                {/* Mini leaderboard */}
                {leaderboard.length>0&&<div style={{marginTop:18,borderTop:'1px solid #3a2008',paddingTop:12}}>
                  <div style={{color:'rgba(200,144,10,0.6)',fontSize:9,fontFamily:'"Courier New",monospace',letterSpacing:2,marginBottom:6}}>TOP SCORES</div>
                  {leaderboard.slice(0,5).map((e,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',color:i===0?'#ffd700':'rgba(200,144,10,0.7)',fontFamily:'"Courier New",monospace',fontSize:11,padding:'1px 0'}}>
                      <span>{i+1}. {e.name}</span><span>{e.score.toLocaleString()}</span>
                    </div>
                  ))}
                </div>}
              </div>
            </div>}
          </div>
          {!isMobile&&<div style={{width:12,background:'linear-gradient(90deg,#2a1808,#1a0f04,#2a1808)',border:'1px solid #3a2008',borderLeft:'none'}}/>}
        </div>
        {/* Bottom rail */}
        {!isMobile&&<div style={{width:cw+24,height:14,background:'linear-gradient(180deg,#1a1008,#0d0804)',border:'1px solid #3a2008',borderTop:'none',borderRadius:'0 0 8px 8px',boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.8}50%{opacity:1}}`}</style>
    </div>
  );
}
