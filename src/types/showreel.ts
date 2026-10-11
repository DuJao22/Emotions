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
  universo_visual?: string;
  client_intent?: string;
  narrative_thread?: string;
  visual_motifs?: string[];
  voice_name?: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  pal: Palette;
  bpm: number;
  energy: number;
  hue?: number;
}

export interface SceneVisualCheck {
  passed: boolean;
  motionScore: number; // % de variação de pixels entre t=0.15, t=0.50 e t=0.85
  coverageScore: number; // % de elementos visuais ativos em relação ao fundo
  reviewNote: string;
  snapshots?: string[]; // dataURLs dos quadros capturados (15%, 50%, 85%)
  repaired?: boolean;
}

export interface SceneSpec {
  role: SceneRole;
  text: string;
  sub: string;
  narration?: string; // Locução falada na cena (praticamente tudo que é falado aparece escrito na tela)
  voiceAudioBase64?: string; // Áudio neural gerado (WAV/PCM base64)
  voiceMimeType?: string;
  idea: string;
  layout_mode?: string;
  camera_motion?: string;
  visual_bridge?: string;
  transition_out?: TransitionKind;
  weight?: number;
  dur: number;
  seed: number;
  fb: FallbackKind;
  code: string | null;
  origem: 'gemini' | 'biblioteca' | 'fallback' | 'custom';
  status?: 'idle' | 'compiling' | 'reviewing' | 'revisando' | 'ready' | 'fallback';
  compileMs?: number;
  start?: number;
  agentId?: 1 | 2;
  fileName?: string;
  visualCheck?: SceneVisualCheck;
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
    name: 'direção de arte autoral sob medida',
    desc: 'linguagem visual, metáforas, tipografia e atmosfera criadas exclusivamente para o pedido do cliente',
  },
  {
    name: 'narrativa cinética editorial',
    desc: 'composições assimétricas, contrastes dramáticos de escala, recortes geométricos e transições orgânicas',
  },
  {
    name: 'imersão espacial 3D & luz',
    desc: 'arquitetura em perspectiva, partículas com profundidade de campo e iluminação volumétrica',
  },
  {
    name: 'fluxo orgânico sensorial',
    desc: 'ondas fluidas, curvas bezier vivas, texturas naturais e movimento contínuo entre cenas',
  },
  {
    name: 'brutalismo gráfico de alto impacto',
    desc: 'diagonais agressivas, blocos modulares vivos, tipografia monumental e cortes sincopados',
  },
  {
    name: 'engenharia visual & precisão',
    desc: 'telemetria viva, diagramas animados, vetores paramétricos e estética de alta tecnologia',
  },
];

export const INITIAL_SHOWREEL: ShowreelData = {
  title: 'SOLARIS — Energia Viva',
  prompt: 'Lançamento de marca de bioenergia solar urbana: da luz bruta do sol à cidade inteligente em movimento contínuo',
  W: 720,
  H: 1280,
  duration: 24,
  dna: {
    structure: 'crescendo',
    transition: 'zoom',
    estilo: 'Cinema Sensorial & Geometria Solar',
    estilo_desc: 'Raios atmosféricos dourados, ondas de energia fluida, arquitetura urbana iluminada e tipografia viva onde tudo que é narrado aparece escrito na tela',
    client_intent: 'Apresentar a jornada da luz solar se transformando em energia limpa que pulsa pelas veias de uma metrópole moderna',
    narrative_thread: 'O feixe de luz nasce no horizonte (Cena 1), atravessa cristais fotônicos (Cena 2), flui em correntes líquidas (Cena 3), alimenta a arquitetura da cidade (Cena 4), sincroniza a rede inteligente (Cena 5), explode em potência limpa (Cena 6) e consolida a assinatura SOLARIS (Cena 7).',
    visual_motifs: ['feixes de luz solar', 'ondas de energia líquida', 'prismas fotônicos 3D', 'torres urbanas iluminadas'],
    voice_name: 'Kore',
    pal: {
      bg1: '#090604',
      bg2: '#1f1209',
      acc: '#ff6b00',
      acc2: '#ffd166',
      fg: '#fff8f0',
      dim: '#c9a98d',
    },
    bpm: 122,
    energy: 4,
    hue: 0.08,
  },
  scenes: [
    {
      role: 'hook',
      text: 'TUDO COMEÇA NA LUZ',
      sub: 'a fonte inesgotável do novo mundo',
      narration: 'Tudo começa na luz: a fonte inesgotável do novo mundo.',
      idea: 'Um eclipse dourado se abre no topo da tela lançando feixes diagonais volumétricos enquanto cada palavra narrada emerge escrita pelo horizonte solar',
      layout_mode: 'horizonte_solar_topo_assimetrico',
      camera_motion: 'ascensao_vertical_lenta',
      visual_bridge: 'Os feixes solares descem na diagonal para atingir o prisma 3D da Cena 2',
      transition_out: 'zoom',
      dur: 3.4,
      seed: 104921,
      fb: 'kinetic',
      origem: 'gemini',
      status: 'ready',
      agentId: 1,
      fileName: 'cena_01_hook.js',
      compileMs: 5,
      code: `const R=M.rng(P.seed),e=M.ease.outExpo(M.p(ts,0,.85));
const sunY=H*(.32-.06*e),sunR=W*(.18+.08*e)*(1+P.pulse*.06);
const g=ctx.createRadialGradient(W*.5,sunY,sunR*.1,W*.5,sunY,W*.95);
g.addColorStop(0,M.col(P.pal.acc2,.95));g.addColorStop(.35,M.col(P.pal.acc,.45));g.addColorStop(1,'rgba(0,0,0,0)');
ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
for(let k=0;k<18;k++){
  const ang=M.lerp(-Math.PI*.15,Math.PI*1.15,k/17)+Math.sin(ts+k)*.03;
  ctx.strokeStyle=M.col(k%2?P.pal.acc2:P.pal.acc,.12+.18*Math.sin(ts*2+k));
  ctx.lineWidth=2+(k%3)*4;ctx.beginPath();
  ctx.moveTo(W*.5,sunY);ctx.lineTo(W*.5+Math.cos(ang)*H,sunY+Math.sin(ang)*H);ctx.stroke();
}
ctx.fillStyle=P.pal.acc2;ctx.beginPath();ctx.arc(W*.5,sunY,sunR,0,Math.PI*2);ctx.fill();
ctx.fillStyle=P.pal.bg1;ctx.fillRect(0,H*.56,W,H*.44);
for(let i=0;i<9;i++){
  const y=H*.58+i*i*6.5,w=W*(.92-i*.06)*M.ease.outCubic(M.p(ts,.1+i*.04,.5));
  ctx.fillStyle=M.col(i%2?P.pal.acc:P.pal.acc2,.75-i*.07);
  ctx.fillRect((W-w)/2,y,w,Math.max(2,8-i*.7));
}
const L=M.lines(P.text,12),fs=M.fit(ctx,'TUDO COMEÇA',W*.84,W*.15);
L.forEach((line,i)=>{
  const st=M.ease.outBack(M.stagger(ts,i,.06,.1,.45));
  M.text(ctx,line,W*.08,H*.66+i*fs*1.12,fs,{align:'left',color:i===L.length-1?P.pal.acc2:P.pal.fg,alpha:st,glow:P.pal.acc});
});`,
    },
    {
      role: 'body',
      text: 'CAPTURA FOTÔNICA',
      sub: 'cristais solares de alta densidade',
      narration: 'Captura fotônica através de cristais solares de alta densidade.',
      idea: 'Os feixes solares entram pela diagonal esquerda, atravessam um cristal octaédrico 3D giratório e revelam as palavras faladas na tela',
      layout_mode: 'prisma_diagonal_dividido',
      camera_motion: 'orbita_3d_aproximacao',
      visual_bridge: 'O feixe refratado na direita se transforma nas correntes líquidas da Cena 3',
      transition_out: 'wipe_h',
      dur: 3.3,
      seed: 382910,
      fb: 'cube',
      origem: 'gemini',
      status: 'ready',
      agentId: 2,
      fileName: 'cena_02_body.js',
      compileMs: 5,
      code: `const e=M.ease.outCubic(M.p(ts,0,.7)),cx=W*.52,cy=H*.46,s=W*.25*e*(1+P.pulse*.08);
ctx.strokeStyle=M.col(P.pal.acc2,.85);ctx.lineWidth=6;
ctx.beginPath();ctx.moveTo(0,H*.18);ctx.lineTo(cx,cy);ctx.stroke();
for(let k=0;k<7;k++){
  const p=M.ease.outExpo(M.p(ts,.2+k*.04,.55));
  const ty=cy+(k-3)*H*.075;
  ctx.strokeStyle=M.col(k%2?P.pal.acc:P.pal.acc2,.75);ctx.lineWidth=3+P.pulse*3;
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(M.lerp(cx,W,p),M.lerp(cy,ty,p));ctx.stroke();
}
const V=[[0,-s*1.3,0],[0,s*1.3,0],[-s,0,-s],[s,0,-s],[s,0,s],[-s,0,s]];
const E=[[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,3],[3,4],[4,5],[5,2]];
const Q=V.map(v=>M.proj(M.rot3(v,ts*.8,ts*1.4,ts*.3),W,H,800,cx,cy));
ctx.lineWidth=3.5;
E.forEach((ed,i)=>{
  ctx.strokeStyle=M.col(i%2?P.pal.acc2:P.pal.acc,.92);
  ctx.beginPath();ctx.moveTo(Q[ed[0]].x,Q[ed[0]].y);ctx.lineTo(Q[ed[1]].x,Q[ed[1]].y);ctx.stroke();
});
const words=P.text.split(' '),fs=M.fit(ctx,P.text,W*.85,W*.13);
words.forEach((w,i)=>{
  const st=M.ease.outExpo(M.stagger(ts,i,.05,.12,.45));
  M.text(ctx,w,W*.92,H*.14+i*fs*1.15,fs,{align:'right',color:i===0?P.pal.fg:P.pal.acc2,alpha:st,glow:P.pal.acc});
});`,
    },
    {
      role: 'body',
      text: 'CORRENTE VIVA',
      sub: 'transmissão sem perdas em tempo real',
      narration: 'Corrente viva: transmissão sem perdas em tempo real.',
      idea: 'Fitas de energia líquida fluem em curvas senoidais pelo palco inteiro com o texto narrado escrito em destaque sobre o fluxo',
      layout_mode: 'fluxo_liquido_horizontal_imersivo',
      camera_motion: 'travelling_acompanhando_onda',
      visual_bridge: 'As correntes sobem verticalmente na borda direita para erguer os edifícios da Cena 4',
      transition_out: 'wipe_v',
      dur: 3.4,
      seed: 591823,
      fb: 'orbit',
      origem: 'gemini',
      status: 'ready',
      agentId: 1,
      fileName: 'cena_03_body.js',
      compileMs: 5,
      code: `const R=M.rng(P.seed),e=M.ease.outCubic(M.p(ts,0,.7));
for(let band=0;band<8;band++){
  const yBase=H*(.2+band*.08);
  ctx.beginPath();
  for(let x=0;x<=W;x+=18){
    const wave=Math.sin(x*.012-ts*3.8+band*.7)*H*.042*(1+P.pulse*.35)+Math.cos(x*.006+ts*2)*H*.02;
    const py=yBase+wave*e;
    if(x===0)ctx.moveTo(x,py);else ctx.lineTo(x,py);
  }
  ctx.strokeStyle=M.col(band%2?P.pal.acc:P.pal.acc2,.35+.08*band);
  ctx.lineWidth=3+band*1.2;ctx.stroke();
  const px=((ts*260*(1+band*.15)+band*110)%W);
  const py=yBase+Math.sin(px*.012-ts*3.8+band*.7)*H*.042*(1+P.pulse*.35)*e;
  ctx.fillStyle=P.pal.fg;ctx.beginPath();ctx.arc(px,py,6+P.pulse*5,0,7);ctx.fill();
}
ctx.save();ctx.translate(W*.5,H*.46);ctx.rotate(-.07);
const fs=M.fit(ctx,P.text,W*.86,W*.15);
ctx.fillStyle=M.col(P.pal.bg1,.86);ctx.fillRect(-W*.46,-fs*.8,W*.92,fs*1.6);
ctx.strokeStyle=P.pal.acc;ctx.lineWidth=3;ctx.strokeRect(-W*.46,-fs*.8,W*.92,fs*1.6);
M.text(ctx,P.text,0,0,fs*(.85+.15*e),{color:P.pal.acc2,glow:P.pal.acc});
ctx.restore();`,
    },
    {
      role: 'body',
      text: 'METRÓPOLE ACESA',
      sub: 'arquitetura alimentada pelo sol',
      narration: 'Metrópole acesa, com arquitetura alimentada pelo sol.',
      idea: 'Silhueta de arranha-céus emergindo de baixo para cima com janelas se acendendo e o texto falado gravado no céu urbano',
      layout_mode: 'arquitetura_vertical_skyline',
      camera_motion: 'tilt_up_monumental',
      visual_bridge: 'O topo das torres emite pulsos concêntricos que formam a malha neural da Cena 5',
      transition_out: 'crossfade',
      dur: 3.3,
      seed: 774120,
      fb: 'grid',
      origem: 'gemini',
      status: 'ready',
      agentId: 2,
      fileName: 'cena_04_body.js',
      compileMs: 4,
      code: `const R=M.rng(P.seed),nB=11,bw=W/nB;
for(let b=0;b<nB;b++){
  const st=M.ease.outExpo(M.stagger(ts,b,0,.04,.65));
  const bh=H*(.28+R()*0.38)*st;
  const x=b*bw+4,y=H*.78-bh,w=bw-8;
  ctx.fillStyle=M.mixc(P.pal.bg1,P.pal.bg2,.6+(b%3)*.2);
  ctx.fillRect(x,y,w,bh);
  ctx.strokeStyle=M.col(P.pal.acc,.55);ctx.lineWidth=2;ctx.strokeRect(x,y,w,bh);
  const rows=Math.floor(bh/28);
  for(let r=0;r<rows;r++){
    const lit=Math.sin(ts*5+b*1.7+r*.6)>-.1;
    if(lit){
      ctx.fillStyle=M.col((r+b)%2?P.pal.acc2:P.pal.acc,.75+P.pulse*.25);
      ctx.fillRect(x+6,y+10+r*26,w-12,14);
    }
  }
}
const L=M.lines(P.text,10),fs=M.fit(ctx,L[0]||P.text,W*.84,W*.16);
L.forEach((l,i)=>{
  const p=M.ease.outBack(M.stagger(ts,i,.06,.1,.45));
  M.text(ctx,l,W*.08,H*.15+i*fs*1.1,fs,{align:'left',color:i===0?P.pal.fg:P.pal.acc,alpha:p,glow:P.pal.acc});
});`,
    },
    {
      role: 'body',
      text: 'REDE INTELIGENTE',
      sub: 'equilíbrio autônomo em cada quarteirão',
      narration: 'Rede inteligente: equilíbrio autônomo em cada quarteirão.',
      idea: 'Constelação de nós urbanos interconectados em 3D trocando pacotes de luz com toda a fala escrita na tela',
      layout_mode: 'constelacao_isometrica_hud',
      camera_motion: 'rotacao_orbital_rede',
      visual_bridge: 'Todos os nós convergem para o núcleo central preparando a explosão de potência da Cena 6',
      transition_out: 'flash',
      dur: 3.3,
      seed: 849201,
      fb: 'tunnel',
      origem: 'gemini',
      status: 'ready',
      agentId: 1,
      fileName: 'cena_05_body.js',
      compileMs: 5,
      code: `const R=M.rng(P.seed),cx=W*.5,cy=H*.48,e=M.ease.outExpo(M.p(ts,0,.7));
const nodes=[];
for(let i=0;i<24;i++){
  const a=i*2.39996,r=W*.36*Math.sqrt((i+.5)/24)*e;
  const p3=M.rot3([Math.cos(a)*r,Math.sin(a)*r,(R()-.5)*W*.35],ts*.55,ts*.75,0);
  nodes.push(M.proj(p3,W,H,750,cx,cy));
}
ctx.lineWidth=1.8;
for(let i=0;i<nodes.length;i++){
  for(let j=i+1;j<nodes.length;j++){
    const d=Math.hypot(nodes[i].x-nodes[j].x,nodes[i].y-nodes[j].y);
    if(d<W*.28){
      ctx.strokeStyle=M.col(P.pal.acc,(1-d/(W*.28))*.65);
      ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.stroke();
    }
  }
}
nodes.forEach((n,i)=>{
  ctx.fillStyle=i%2?P.pal.acc2:P.pal.acc;
  ctx.beginPath();ctx.arc(n.x,n.y,(5+P.pulse*5)*n.s,0,7);ctx.fill();
});
const fs=M.fit(ctx,P.text,W*.86,W*.13);
M.text(ctx,P.text,W*.5,H*.15,fs,{color:P.pal.fg,glow:P.pal.acc});`,
    },
    {
      role: 'climax',
      text: '100% IMPACTO LIMPO',
      sub: 'zero emissões e potência máxima',
      narration: 'Cem por cento impacto limpo: zero emissões e potência máxima!',
      idea: 'Supernova solar de anéis concêntricos e raios geométricos expandindo do núcleo com tipografia monumental sincronizada à voz',
      layout_mode: 'explosao_monumental_centro',
      camera_motion: 'zoom_choque_elastico',
      visual_bridge: 'A supernova desacelera e se condensa no emblema circular perfeito da Cena 7',
      transition_out: 'zoom',
      dur: 3.7,
      seed: 918273,
      fb: 'burst',
      origem: 'gemini',
      status: 'ready',
      agentId: 2,
      fileName: 'cena_06_climax.js',
      compileMs: 6,
      code: `const R=M.rng(P.seed),cx=W/2,cy=H*.44,g=M.ease.outExpo(M.p(ts,0,.65));
for(let ring=0;ring<6;ring++){
  const rad=W*(.1+ring*.13)*g*(1+P.pulse*.1);
  ctx.strokeStyle=M.col(ring%2?P.pal.acc2:P.pal.acc,.85-ring*.11);
  ctx.lineWidth=8-ring;
  ctx.beginPath();ctx.arc(cx,cy,rad,ts*(ring%2?2:-2),ts*(ring%2?2:-2)+Math.PI*1.65);ctx.stroke();
}
for(let k=0;k<36;k++){
  const a=Math.PI*2*k/36+ts*.8;
  const r0=W*.12,r1=W*(.2+.55*g*(.5+R()*.5));
  ctx.strokeStyle=M.col(k%2?P.pal.acc:P.pal.acc2,.7);ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);ctx.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);ctx.stroke();
}
const L=M.lines(P.text,10),fs=M.fit(ctx,L[0]||P.text,W*.88,W*.18);
L.forEach((l,i)=>{
  const st=M.ease.outBack(M.stagger(ts,i,.04,.08,.45));
  M.text(ctx,l,cx,cy+(i-(L.length-1)/2)*fs*1.12,fs*st*(1+P.pulse*.07),{color:i===0?P.pal.fg:P.pal.acc2,stroke:P.pal.bg1,strokeW:10,glow:P.pal.acc});
});`,
    },
    {
      role: 'closing',
      text: 'SOLARIS',
      sub: 'o futuro já está aceso',
      narration: 'Solaris: o futuro já está aceso.',
      idea: 'O sol estilizado da abertura retorna em equilíbrio minimalista com órbitas douradas suaves e assinatura final narrada e escrita',
      layout_mode: 'assinatura_emblema_minimalista',
      camera_motion: 'estabilizacao_cinematografica',
      visual_bridge: 'Encerramento cíclico conectando com a luz da Cena 1',
      transition_out: 'crossfade',
      dur: 3.6,
      seed: 441092,
      fb: 'closing',
      origem: 'gemini',
      status: 'ready',
      agentId: 1,
      fileName: 'cena_07_closing.js',
      compileMs: 4,
      code: `const cx=W/2,cy=H*.42,e=M.ease.outExpo(M.p(ts,0,.85));
const grad=ctx.createRadialGradient(cx,cy,10,cx,cy,W*.45*e);
grad.addColorStop(0,M.col(P.pal.acc2,.45));grad.addColorStop(1,'rgba(0,0,0,0)');
ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
ctx.strokeStyle=P.pal.acc2;ctx.lineWidth=4;
ctx.beginPath();ctx.arc(cx,cy,W*.22*e*(1+P.pulse*.04),0,Math.PI*2);ctx.stroke();
ctx.strokeStyle=M.col(P.pal.acc,.7);ctx.lineWidth=2;
ctx.beginPath();ctx.arc(cx,cy,W*.3*e,ts*.6,ts*.6+Math.PI*1.35);ctx.stroke();
ctx.fillStyle=P.pal.acc;ctx.beginPath();ctx.arc(cx,cy-W*.12*e,W*.045*e,0,Math.PI*2);ctx.fill();
const fs=M.fit(ctx,P.text,W*.82,W*.18);
M.text(ctx,P.text,cx,cy+W*.03,fs*e,{color:P.pal.fg,glow:P.pal.acc,spacing:6});
const bw=W*.36*M.ease.outExpo(M.p(ts,.3,.55));
ctx.fillStyle=P.pal.acc2;ctx.fillRect(cx-bw/2,cy+W*.18,bw,4);`,
    },
  ],
};
