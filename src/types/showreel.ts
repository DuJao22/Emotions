export type SceneRole = 'hook' | 'body' | 'climax' | 'closing';
export type FallbackKind = 'kinetic' | 'burst' | 'tunnel' | 'grid' | 'orbit' | 'cube' | 'closing';
export type StructureKind = 'crescendo' | 'explosao_respiro' | 'uniforme';
export type TransitionKind = 'flash' | 'wipe_h' | 'wipe_v' | 'crossfade' | 'glitch' | 'zoom';

export interface Palette {
  bg1: string;
  bg2: string;
  acc: string;
  acc2: string;
  fg: string;
  dim: string;
}

export interface DNA {
  structure: StructureKind;
  transition: TransitionKind;
  estilo: string;
  estilo_desc?: string;
  pal: Palette;
  bpm: number;
  energy: number;
  hue?: number;
}

export interface SceneSpec {
  role: SceneRole;
  text: string;
  sub: string;
  idea: string;
  weight?: number;
  dur: number;
  seed: number;
  fb: FallbackKind;
  code: string | null;
  origem: 'gemini' | 'biblioteca' | 'fallback' | 'custom';
  status?: 'idle' | 'compiling' | 'ready' | 'fallback';
  compileMs?: number;
  start?: number;
}

export interface ShowreelData {
  title: string;
  prompt?: string;
  W: number;
  H: number;
  duration: number;
  dna: DNA;
  scenes: SceneSpec[];
}

export interface SceneLibraryEntry {
  id: string;
  role: SceneRole;
  idea: string;
  text?: string;
  estilo: string;
  code: string;
  createdAt: string;
}

export const ROLES: SceneRole[] = ['hook', 'body', 'climax', 'closing'];
export const FALLBACKS: FallbackKind[] = ['kinetic', 'burst', 'tunnel', 'grid', 'orbit', 'cube'];
export const STRUCTURES: { id: StructureKind; label: string; desc: string }[] = [
  { id: 'crescendo', label: 'Crescendo', desc: 'Acelera gradualmente até o clímax' },
  { id: 'explosao_respiro', label: 'Explosão & Respiro', desc: 'Alterna cortes rápidos e pausas visuais' },
  { id: 'uniforme', label: 'Cadência Uniforme', desc: 'Pulso constante sincronizado ao BPM' },
];

export const TRANSITIONS: { id: TransitionKind; label: string }[] = [
  { id: 'wipe_h', label: 'Wipe Horizontal' },
  { id: 'wipe_v', label: 'Wipe Vertical' },
  { id: 'zoom', label: 'Zoom Inercial' },
  { id: 'glitch', label: 'Glitch Slice' },
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'flash', label: 'Flash Cut' },
];

export const STYLES: { name: string; desc: string }[] = [
  {
    name: 'tipografia cinética',
    desc: 'texto gigante entrando em palavras, cortes rápidos, escalas e rotações com easing forte',
  },
  {
    name: 'glitch digital',
    desc: 'fatias deslocadas, aberração cromática, scanlines, ruído, números e código',
  },
  {
    name: 'minimalista elegante',
    desc: 'muito espaço vazio, linhas finas, círculos, movimento lento e preciso, tipografia leve',
  },
  {
    name: '3D em perspectiva',
    desc: 'objetos 3D (cubos, esferas de partículas, túneis) projetados com M.rot3 e M.proj',
  },
  {
    name: 'grid dinâmico',
    desc: 'grades, painéis, colagem de retângulos que se revelam em onda, barras e blocos',
  },
  {
    name: 'líquido orgânico',
    desc: 'blobs, ondas senoidais, metaballs falsas, curvas suaves, movimento fluido',
  },
  {
    name: 'neon synthwave',
    desc: 'linhas de horizonte, grade em perspectiva, sol, brilhos (glow), gradientes vibrantes',
  },
  {
    name: 'blueprint técnico',
    desc: 'wireframes, medidas, cruzes, linhas de cota, números pequenos, estética de engenharia',
  },
];

export const INITIAL_SHOWREEL: ShowreelData = {
  title: 'Kinetix Motion Architecture',
  prompt: 'Showreel de direção de arte digital, tipografia cinética e geometria 3D em alta cadência',
  W: 720,
  H: 1280,
  duration: 24,
  dna: {
    structure: 'explosao_respiro',
    transition: 'wipe_h',
    estilo: '3D em perspectiva',
    estilo_desc: 'objetos 3D (cubos, esferas de partículas, túneis) projetados com M.rot3 e M.proj',
    pal: {
      bg1: '#07070c',
      bg2: '#121324',
      acc: '#e11d48',
      acc2: '#f59e0b',
      fg: '#f5f5f7',
      dim: '#9496a8',
    },
    bpm: 124,
    energy: 4,
    hue: 0.96,
  },
  scenes: [
    {
      role: 'hook',
      text: 'PRECISÃO EM MOVIMENTO',
      sub: 'direção de arte procedural 60fps',
      idea: 'Anéis concêntricos e partículas em expansão rápida com tipografia elástica central',
      dur: 3.2,
      seed: 104921,
      fb: 'kinetic',
      origem: 'gemini',
      status: 'ready',
      compileMs: 8,
      code: `const R=M.rng(P.seed);
const e=M.ease.outExpo(M.p(ts,0,.75));
const cx=W/2,cy=H*.46;
for(let r=0;r<4;r++){
  const rad=W*(.14+r*.11)*e*(1+P.pulse*.06);
  ctx.strokeStyle=M.col(r%2?P.pal.acc:P.pal.acc2,.25+.15*(3-r));
  ctx.lineWidth=2+(r===0?3:1);
  ctx.beginPath();
  ctx.arc(cx,cy,rad,ts*(r%2?1.2:-.9),ts*(r%2?1.2:-.9)+Math.PI*1.45);
  ctx.stroke();
}
M.deco(ctx,W,H,P,ts);
M.mainText(ctx,W,H,P,ts,{scale:.75+.25*M.ease.outBack(M.p(ts,.06,.55)),alpha:M.p(ts,0,.25)});`,
    },
    {
      role: 'body',
      text: 'VETORES NO ESPAÇO',
      sub: 'projeção perspectiva em tempo real',
      idea: 'Cubo wireframe 3D rotacionando com vértices pulsantes no compasso do BPM',
      dur: 2.8,
      seed: 382910,
      fb: 'cube',
      origem: 'gemini',
      status: 'ready',
      compileMs: 6,
      code: `const R=M.rng(P.seed),cx=W/2,cy=H*.38;
const s=W*.22*M.ease.outBack(M.p(ts,0,.65))*(1+P.pulse*.08);
const V=[];
for(let x=-1;x<=1;x+=2)for(let y=-1;y<=1;y+=2)for(let z=-1;z<=1;z+=2)V.push([x*s,y*s,z*s]);
const E=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
const ax=ts*1.1+R()*2,ay=ts*1.45,az=ts*.5;
const Q=V.map(v=>M.proj(M.rot3(v,ax,ay,az),W,H,850,cx,cy));
ctx.lineWidth=4;ctx.lineCap='round';
E.forEach((e,i)=>{
  ctx.strokeStyle=M.col(i%2?P.pal.acc:P.pal.acc2,.9);
  ctx.beginPath();ctx.moveTo(Q[e[0]].x,Q[e[0]].y);ctx.lineTo(Q[e[1]].x,Q[e[1]].y);ctx.stroke();
});
Q.forEach(p=>{
  ctx.fillStyle=P.pal.fg;ctx.beginPath();ctx.arc(p.x,p.y,5.5*p.s,0,7);ctx.fill();
});
M.deco(ctx,W,H,P,ts);
M.mainText(ctx,W,H,P,ts,{cy:H*.69,scale:.76,alpha:M.p(ts,.12,.35)});`,
    },
    {
      role: 'body',
      text: 'BAIXA LATÊNCIA PURA',
      sub: 'compilação paralela instantânea',
      idea: 'Grade modular iluminada por ondas radiais sincronizadas à batida',
      dur: 3.4,
      seed: 591823,
      fb: 'grid',
      origem: 'fallback',
      status: 'ready',
      compileMs: 5,
      code: null,
    },
    {
      role: 'body',
      text: 'RITMO ALGORÍTMICO',
      sub: 'síntese sonora web audio nativa',
      idea: 'Túnel geométrico infinito avançando em direção à câmera com rotação progressiva',
      dur: 2.7,
      seed: 774120,
      fb: 'tunnel',
      origem: 'fallback',
      status: 'ready',
      compileMs: 4,
      code: null,
    },
    {
      role: 'body',
      text: 'FLUÍDEZ TÁTIL MOBILE',
      sub: 'arquitetura focada em performance',
      idea: 'Sistema orbital de satélites luminosos traçando arcos de precisão',
      dur: 3.4,
      seed: 849201,
      fb: 'orbit',
      origem: 'fallback',
      status: 'ready',
      compileMs: 4,
      code: null,
    },
    {
      role: 'climax',
      text: 'IMPACTO VISUAL TOTAL',
      sub: 'explosão radial de alta energia',
      idea: 'Feixes de luz radiais explodindo do centro com tipografia em escala máxima',
      dur: 4.3,
      seed: 918273,
      fb: 'burst',
      origem: 'gemini',
      status: 'ready',
      compileMs: 7,
      code: `const R=M.rng(P.seed),cx=W/2,cy=H*.46;
const g=M.ease.outExpo(M.p(ts,0,.7));
const n=32;
ctx.lineCap='round';
for(let k=0;k<n;k++){
  const a=Math.PI*2*k/n+ts*.65;
  const ln=.4+R()*.6;
  const r0=W*(.12+P.pulse*.05);
  const r1=W*(.16+.62*g*ln);
  ctx.strokeStyle=M.col(k%2?P.pal.acc:P.pal.acc2,.45+.55*g);
  ctx.lineWidth=3+(k%3)*2.5;
  ctx.beginPath();
  ctx.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);
  ctx.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);
  ctx.stroke();
}
M.deco(ctx,W,H,P,ts);
M.mainText(ctx,W,H,P,ts,{scale:.78+.22*M.ease.outBack(M.p(ts,.08,.45)),alpha:M.p(ts,0,.25)});`,
    },
    {
      role: 'closing',
      text: 'KINETIX STUDIO',
      sub: 'pronto para exportação mp4 e render',
      idea: 'Selo circular minimalista com assinatura visual e linha de horizonte',
      dur: 4.2,
      seed: 441092,
      fb: 'closing',
      origem: 'fallback',
      status: 'ready',
      compileMs: 3,
      code: null,
    },
  ],
};
