#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MOTION SHOWREEL AGENT - RENDER PRODUCTION SERVER (Python Puro + Baixa Latência)
===============================================================================
Este arquivo é a evolução direta do seu script Python original otimizado para o Render:
- Escuta em 0.0.0.0 na porta definida pela variável de ambiente PORT do Render
- Cache em memória da descoberta de modelos (evita +1s de latência por requisição)
- Suporte nativo a GEMINI_API_KEY_1 e GEMINI_API_KEY_2 (via UI Engrenagem ou Variáveis de Ambiente)
- Endpoints HTTP JSON (/healthz, /api/agent/models, /api/agent/plan, /api/agent/scene)
- Serve o front-end compilado em /dist (ou HTML fallback embutido) com compressão Gzip
"""
import os, sys, re, json, time, gzip, random, colorsys, mimetypes
import urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", 3000))
GEMINI_API_KEY_1 = os.environ.get("GEMINI_API_KEY_1", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_API_KEY_2 = os.environ.get("GEMINI_API_KEY_2", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "auto")

_BASE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
DIST_DIR = os.path.join(_BASE, "dist")
OUTPUT_DIR = os.path.join(_BASE, ".data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

ROLES = ["hook", "body", "climax", "closing"]
FALLBACKS = ["kinetic", "burst", "tunnel", "grid", "orbit", "cube"]
STRUCTURES = ["crescendo", "explosao_respiro", "uniforme"]
TRANSITIONS = ["flash", "wipe_h", "wipe_v", "crossfade", "glitch", "zoom"]
STYLES = [
    ("tipografia cinética", "texto gigante entrando em palavras, cortes rápidos, escalas e rotações com easing forte"),
    ("glitch digital", "fatias deslocadas, aberração cromática, scanlines, ruído, números e código"),
    ("minimalista elegante", "muito espaço vazio, linhas finas, círculos, movimento lento e preciso, tipografia leve"),
    ("3D em perspectiva", "objetos 3D (cubos, esferas de partículas, túneis) projetados com M.rot3 e M.proj"),
    ("grid dinâmico", "grades, painéis, colagem de retângulos que se revelam em onda, barras e blocos"),
    ("líquido orgânico", "blobs, ondas senoidais, metaballs falsas, curvas suaves, movimento fluido"),
    ("neon synthwave", "linhas de horizonte, grade em perspectiva, sol, brilhos (glow), gradientes vibrantes"),
    ("blueprint técnico", "wireframes, medidas, cruzes, linhas de cota, números pequenos, estética de engenharia"),
]

_EXCLUI = ("image", "tts", "live", "audio", "embedding", "computer", "robotics", "vision", "aqa",
           "learnlm", "gemma", "imagen", "veo", "dialog", "customtools", "-exp")

M_API = """M (biblioteca, já existe, NÃO redefina):
 M.clamp(x,a=0,b=1) M.lerp(a,b,t) M.map(x,a,b,c,d)  M.p(ts,inicio,duração)->0..1  M.stagger(ts,i,inicio,intervalo,duração)->0..1
 M.ease.outExpo|outCubic|inCubic|inOutCubic|inOutQuint|outBack|outElastic (recebem 0..1, SEMPRE use M.p para clampar)  M.spring(x)
 M.col(hex,alpha)->'rgba()'   M.mixc(hex1,hex2,t)->'rgb()'   M.rng(seed)->função aleatória determinística (0..1)
 M.text(ctx,str,x,y,size,{color,alpha,weight,align,rot,glow,stroke,spacing,shadow:false})   M.fit(ctx,str,maxW,size)->size
 M.lines(str,maxChars)->array de linhas   M.mainText(ctx,W,H,P,ts,{scale,alpha,cy})  (desenha P.text centralizado e bonito)
 M.rot3([x,y,z],ax,ay,az)->[x,y,z]   M.proj([x,y,z],W,H,fov,cx,cy)->{x,y,s}   M.deco(ctx,W,H,P,ts) (partículas e cantos)"""

EXEMPLO = """const R=M.rng(P.seed);
const e=M.ease.outExpo(M.p(ts,0,.8));
for(let k=0;k<14;k++){const a=k/14*Math.PI*2+ts*.5,r=W*(.15+.35*e);
  ctx.fillStyle=M.col(k%2?P.pal.acc:P.pal.acc2,.8);ctx.beginPath();
  ctx.arc(W/2+Math.cos(a)*r,H*.46+Math.sin(a)*r,10+P.pulse*8,0,7);ctx.fill();}
M.mainText(ctx,W,H,P,ts,{scale:.7+.3*M.ease.outBack(M.p(ts,.1,.5)),alpha:M.p(ts,0,.3)});"""

PROIBIDO = ["fetch(", "XMLHttpRequest", "document.", "window.", "eval(", "import(", "localStorage",
            "WebSocket", "navigator.", "require(", "Function("]

_MODEL_CACHE = {}  # chave_prefix -> (timestamp, lista_modelos)


def hsl_hex(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h % 1.0, l, s)
    return "#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255))


def ler_json(nome, padrao):
    try:
        with open(os.path.join(OUTPUT_DIR, nome), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


def gravar_json(nome, dados):
    try:
        with open(os.path.join(OUTPUT_DIR, nome), "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=1)
    except Exception:
        pass


def extrair_chaves(k1="", k2=""):
    c1 = (k1 or GEMINI_API_KEY_1 or "").strip()
    c2 = (k2 or GEMINI_API_KEY_2 or "").strip()
    out = []
    for k in (c1, c2):
        if k and k != "MY_GEMINI_API_KEY" and k not in out:
            out.append(k)
    return out


def descobrir_modelos(chave0):
    cache_key = chave0[:12]
    now = time.time()
    if cache_key in _MODEL_CACHE and (now - _MODEL_CACHE[cache_key][0]) < 1800:
        return _MODEL_CACHE[cache_key][1], []

    nomes, logs, token = [], [], ""
    for _ in range(5):
        url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200" + (("&pageToken=" + token) if token else "")
        req = urllib.request.Request(url, headers={"x-goog-api-key": chave0})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as ex:
            logs.append("  (não consegui listar os modelos: %s)" % ex)
            break
        for m in data.get("models", []):
            nome = str(m.get("name", "")).split("/")[-1]
            if ("generateContent" in m.get("supportedGenerationMethods", []) and nome.startswith("gemini-")
                    and "flash" in nome and not any(x in nome for x in _EXCLUI)):
                nomes.append(nome)
        token = data.get("nextPageToken", "")
        if not token:
            break

    def ordem(n):
        mv = re.match(r"gemini-(\d+(?:\.\d+)?)", n)
        ver = float(mv.group(1)) if mv else 0.0
        return (-ver, "lite" in n, "preview" in n, n)

    ordenados = sorted(set(nomes), key=ordem)
    if ordenados:
        _MODEL_CACHE[cache_key] = (now, ordenados)
    return ordenados, logs


def preparar_modelos(chaves, pref="auto"):
    logs = []
    achados, disc_logs = descobrir_modelos(chaves[0]) if chaves else ([], [])
    logs.extend(disc_logs)
    if achados:
        logs.append("Modelos Gemini disponíveis na sua chave: " + ", ".join(achados[:12]))
    padrao = ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"]
    base = achados[:8] if achados else padrao
    if pref and pref.lower() != "auto":
        modelos = [pref] + [m for m in base if m != pref]
    else:
        modelos = base
    logs.append("Modelo em uso: %s (se falhar, troca sozinho)" % modelos[0])
    return modelos, logs


def gemini_call(prompt, chaves, modelos, mi_box, json_mode=False, temperature=0.9, tries=4, chave=0):
    logs = []
    if not chaves or not modelos:
        return None, logs
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": 8192}}
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    n, k = len(chaves), 0
    while k < tries:
        modelo = modelos[min(mi_box[0], len(modelos) - 1)]
        idx = (chave + k) % n
        logs.append("    (chave %d de %d, modelo %s)" % (idx + 1, n, modelo))
        url = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % modelo
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json",
                                              "x-goog-api-key": chaves[idx]})
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            parts = data["candidates"][0]["content"]["parts"]
            txt = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            if txt.strip():
                return txt, logs
            k += 1
        except urllib.error.HTTPError as ex:
            msg = ex.read().decode("utf-8", "ignore")[:1200]
            sem_modelo = ex.code == 404 or (ex.code == 429 and re.search(r"limit:\s*0\b", msg))
            if sem_modelo and mi_box[0] < len(modelos) - 1:
                mi_box[0] += 1
                logs.append("  Modelo %s indisponível (%s). Trocando para %s" % (modelo, ex.code, modelos[mi_box[0]]))
                continue
            if ex.code == 429 or ex.code >= 500:
                troca = n > 1 and k < n - 1
                if not troca and mi_box[0] < len(modelos) - 1:
                    mi_box[0] += 1
                    logs.append("  Limite em %s. Alternando para %s..." % (modelo, modelos[mi_box[0]]))
                    continue
                espera = 2 if troca else 4
                logs.append("  Chave %d ocupada/limite (%s). Aguardando %ds..." % (idx + 1, ex.code, espera))
                time.sleep(espera)
                k += 1
                continue
            if n > 1 and k < n - 1:
                k += 1
                continue
            return None, logs
        except Exception as ex:
            logs.append("  Erro Gemini: %s" % ex)
            time.sleep(2)
            k += 1
    return None, logs


def make_dna(rng, runs):
    ultimos = runs[-2:]
    structure = rng.choice([s for s in STRUCTURES if s not in [r.get("structure") for r in ultimos]] or STRUCTURES)
    trans = rng.choice([t for t in TRANSITIONS if t not in [r.get("transition") for r in ultimos]] or TRANSITIONS)
    estilos = [s for s in STYLES if s[0] not in [r.get("estilo") for r in ultimos]] or STYLES
    estilo = rng.choice(estilos)
    hue = rng.random()
    if runs:
        for _ in range(30):
            if abs(hue - runs[-1].get("hue", 0)) > 0.15:
                break
            hue = rng.random()
    off = rng.choice([0.5, 0.12, 0.33])
    pal = {"bg1": hsl_hex(hue, 0.55, 0.045), "bg2": hsl_hex(hue + 0.05, 0.6, 0.15),
           "acc": hsl_hex(hue + off, 0.9, 0.58), "acc2": hsl_hex(hue + off / 2 + 0.08, 0.85, 0.62),
           "fg": "#f5f5f5", "dim": "#b0b0c0"}
    return {"structure": structure, "transition": trans, "estilo": estilo[0], "estilo_desc": estilo[1],
            "pal": pal, "bpm": rng.randint(90, 140), "energy": rng.randint(2, 5), "hue": hue}


def offline_plan(user_prompt, rng):
    words = [w for w in user_prompt.upper().replace(",", " ").split() if len(w) > 2][:12] or ["MOTION"]
    ideias = ["MOVIMENTO", "RITMO", "IMPACTO", "DETALHE", "ENERGIA", "FLUXO", "FOCO"]
    scenes = [{"role": "hook", "text": " ".join(words[:4]), "sub": "showreel", "idea": "", "weight": 2}]
    for i in range(1, 7):
        scenes.append({"role": "climax" if i == 5 else "body",
                       "text": rng.choice(ideias) + (" " + words[i % len(words)] if i % 2 else ""),
                       "sub": "", "idea": "", "weight": rng.choice([1, 1, 2])})
    scenes.append({"role": "closing", "text": " ".join(words[:3]), "sub": "obrigado", "idea": "", "weight": 2})
    return {"title": " ".join(words[:3]).title(), "scenes": scenes}


def clean_plan(plan, rng):
    scenes = []
    for s in plan.get("scenes", [])[:10]:
        if not isinstance(s, dict):
            continue
        role = s.get("role") if s.get("role") in ROLES else "body"
        scenes.append({"role": role, "text": str(s.get("text", "") or "MOTION")[:40],
                       "sub": str(s.get("sub", "") or "")[:60], "idea": str(s.get("idea", "") or "")[:300],
                       "weight": s.get("weight", 1)})
    if not scenes:
        scenes = [{"role": "hook", "text": "MOTION", "sub": "", "idea": "", "weight": 1}]
    if len(scenes) == 1:
        scenes.append({"role": "closing", "text": "FIM", "sub": "", "idea": "", "weight": 1})
    scenes[0]["role"] = "hook"
    for s in scenes[1:-1]:
        if s["role"] in ("hook", "closing"):
            s["role"] = "body"
    scenes[-1]["role"] = "closing"
    prev = None
    for s in scenes:
        if s["role"] == "closing":
            s["fb"] = "closing"
        else:
            op = [f for f in FALLBACKS if f != prev] or FALLBACKS
            s["fb"] = rng.choice(op)
        prev = s["fb"]
    return {"title": str(plan.get("title", "showreel"))[:60], "scenes": scenes}


def schedule(scenes, structure, total):
    n = len(scenes)
    ws = []
    for i, s in enumerate(scenes):
        try:
            base = max(0.5, min(3.0, float(s.get("weight", 1))))
        except Exception:
            base = 1.0
        if structure == "crescendo":
            f = 1.7 - 1.2 * i / max(1, n - 1)
        elif structure == "explosao_respiro":
            f = 0.7 if i % 2 else 1.3
        else:
            f = 1.0
        ws.append(base * f)
    durs = [max(1.6, total * w / sum(ws)) for w in ws]
    k = total / sum(durs)
    return [d * k for d in durs]


class RenderServerHandler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send_json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if "gzip" in self.headers.get("Accept-Encoding", "") and len(raw) > 512:
            raw = gzip.compress(raw)
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        if self.path in ("/healthz", "/api/ping"):
            return self._send_json({"status": "ok", "engine": "python-render"})
        if self.path == "/api/showreel/library":
            return self._send_json({
                "library": ler_json("biblioteca_cenas.json", []),
                "runs": ler_json("historico_planos.json", {"runs": []}).get("runs", [])
            })

        # Serve static files from /dist
        rel = self.path.split("?")[0].lstrip("/") or "index.html"
        target = os.path.join(DIST_DIR, rel)
        if not os.path.isfile(target):
            target = os.path.join(DIST_DIR, "index.html")
        if os.path.isfile(target):
            ctype, _ = mimetypes.guess_type(target)
            with open(target, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype or "text/html; charset=utf-8")
            if rel.startswith("assets/"):
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        self._send_json({"status": "ok", "message": "Execute npm run build para gerar a pasta dist"}, 200)

    def do_POST(self):
        body = self._read_body()
        if self.path == "/api/agent/models":
            chaves = extrair_chaves(body.get("key1", ""), body.get("key2", ""))
            if not chaves:
                return self._send_json({
                    "chavesCount": 0,
                    "modelos": ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"],
                    "logs": ["Modo offline (nenhuma chave informada)."]
                })
            modelos, logs = preparar_modelos(chaves, body.get("modelPref", "auto"))
            return self._send_json({"chavesCount": len(chaves), "modelos": modelos, "logs": logs})

        if self.path == "/api/agent/plan":
            user_prompt = body.get("prompt") or "showreel de motion design moderno"
            duration = float(body.get("duration") or 30)
            width = int(body.get("width") or 720)
            height = int(body.get("height") or 1280)
            reaproveitar = float(body.get("reaproveitar") if body.get("reaproveitar") is not None else 0.25)
            rng = random.Random(int.from_bytes(os.urandom(4), "big"))
            runs = ler_json("historico_planos.json", {"runs": []}).get("runs", [])
            dna = make_dna(rng, runs)
            logs = ["DNA: estilo=%s | estrutura=%s | transição=%s | bpm=%d | energia=%d" %
                    (dna["estilo"], dna["structure"], dna["transition"], dna["bpm"], dna["energy"])]
            chaves = extrair_chaves(body.get("key1", ""), body.get("key2", ""))
            tem_chave = bool(chaves)
            modelos = ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"]
            mi_box = [0]
            plan = None
            if tem_chave:
                logs.append("Chaves Gemini em uso: %d (as cenas alternam entre elas)" % len(chaves))
                modelos, mlogs = preparar_modelos(chaves, body.get("geminiModel", "auto"))
                logs.extend(mlogs)
                evitar = "; ".join(str(r.get("title", "")) for r in runs[-3:]) or "nenhum"
                p = f"""Você é um diretor de motion design sênior e roteirista de showreels.
Crie o roteiro de um showreel vertical (9:16) de {int(duration)} segundos para o pedido abaixo.
Estilo visual obrigatório: {dna['estilo']} - {dna['estilo_desc']}.
Estrutura: {dna['structure']}. Energia {dna['energy']}/5. BPM {dna['bpm']}.
Regras: gancho forte na 1ª cena; alterne respiro e explosão; clímax perto do fim; a última cena é o card final.
Use de 7 a 9 cenas. Cada cena tem:
- "role": hook, body, climax ou closing (closing só na última)
- "text": texto principal CURTO em português (máx. 5 palavras, impactante)
- "sub": subtítulo opcional (máx. 8 palavras)
- "idea": descrição visual ESPECÍFICA e diferente das outras (formas, movimento, câmera, 1-2 frases)
- "weight": 1 a 3 (duração relativa)
Evite repetir estes títulos recentes: {evitar}.
Responda APENAS com JSON: {{"title":"...","scenes":[{{"role":"hook","text":"...","sub":"...","idea":"...","weight":2}}]}}
PEDIDO: {user_prompt}"""
                txt, glogs = gemini_call(p, chaves, modelos, mi_box, json_mode=True, temperature=1.0, chave=0)
                logs.extend(glogs)
                if txt:
                    try:
                        txt = txt.strip().strip("`")
                        if txt.lower().startswith("json"):
                            txt = txt[4:]
                        parsed = json.loads(txt)
                        if isinstance(parsed, dict) and parsed.get("scenes"):
                            plan = parsed
                    except Exception as ex:
                        logs.append("  Roteiro inválido: %s" % ex)
            if plan is None:
                logs.append("Modo offline (cenas prontas)." if not tem_chave else "Gemini falhou no roteiro - usando roteiro offline.")
                plan = offline_plan(user_prompt, rng)
            plan = clean_plan(plan, rng)
            scenes = plan["scenes"]
            biblioteca = ler_json("biblioteca_cenas.json", [])
            acc = 0.0
            for i, (s, d) in enumerate(zip(scenes, schedule(scenes, dna["structure"], duration))):
                s["dur"] = round(d, 3)
                s["start"] = round(acc, 3)
                acc += s["dur"]
                s["seed"] = rng.randint(1, 10 ** 6)
                s["code"], s["origem"] = None, "fallback"
                reuso = [e for e in biblioteca if e.get("role") == s["role"]]
                if reuso and rng.random() < reaproveitar:
                    e = rng.choice(reuso)
                    s["code"], s["origem"], s["status"] = e["code"], "biblioteca", "ready"
                    logs.append("  cena %d/%d [%s] reaproveitada da biblioteca" % (i + 1, len(scenes), s["role"]))
                else:
                    s["status"] = "compiling" if tem_chave else "ready"
            logs.append("Roteiro '%s': %d cenas" % (plan["title"], len(scenes)))
            runs.append({"title": plan["title"], "structure": dna["structure"], "transition": dna["transition"],
                         "estilo": dna["estilo"], "hue": dna["hue"]})
            gravar_json("historico_planos.json", {"runs": runs[-30:]})
            return self._send_json({
                "showreel": {"title": plan["title"], "prompt": user_prompt, "W": width, "H": height,
                             "duration": duration, "dna": dna, "scenes": scenes},
                "modelos": modelos, "mi": mi_box[0], "tem_chave": tem_chave, "logs": logs
            })

        if self.path == "/api/agent/scene":
            dna = body.get("dna") or {}
            scene = body.get("scene") or {}
            idx = int(body.get("idx") or 0)
            total = int(body.get("total") or 8)
            anterior = body.get("anterior") or ""
            width = int(body.get("width") or 720)
            height = int(body.get("height") or 1280)
            modelos = body.get("modelos") or ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"]
            mi_box = [int(body.get("mi") or 0)]
            chaves = extrair_chaves(body.get("key1", ""), body.get("key2", ""))
            if not chaves:
                return self._send_json({"code": None, "origem": "fallback", "mi": mi_box[0], "logs": []})
            logs = ['  cena %d/%d [%s] "%s" -> pedindo código ao Gemini...' % (idx + 1, total, scene.get("role"), scene.get("text"))]
            pal = dna.get("pal") or {}
            p = f"""Você é um motion designer sênior que escreve JavaScript para Canvas 2D.
Escreva SOMENTE o CORPO de uma função (sem a palavra function, sem markdown, sem explicações), com estes parâmetros disponíveis:
(ctx, t, ts, W, H, P, M)
- ctx: CanvasRenderingContext2D, tela vertical W x H ({width}x{height}). O fundo em gradiente JÁ foi pintado.
- t: progresso da cena 0..1. ts: segundos desde o início da cena. P.dur: duração da cena em segundos.
- P: {{text, role, seed, pulse (batida 0..1), bpm, energy (1-5), pal:{{bg1,bg2,acc,acc2,fg,dim}}}}  (cores em hex)
  Paleta: bg1={pal.get('bg1')} bg2={pal.get('bg2')} acc={pal.get('acc')} acc2={pal.get('acc2')} fg={pal.get('fg')} dim={pal.get('dim')}
- {M_API}
REGRAS:
1. A cena é uma função PURA de ts: sem estado, sem Date/performance.now, sem Math.random (use M.rng(P.seed)).
2. Anime TUDO com easing (nunca linear): entrada com antecipação/overshoot, movimento principal, detalhes secundários em atraso (overlap/stagger).
3. Use no mínimo 3 camadas: elementos de fundo, elemento principal, detalhes de primeiro plano. Reaja à batida com P.pulse.
4. O texto principal "{scene.get('text')}" (use P.text) DEVE aparecer legível: use M.text/M.mainText/M.fit. NÃO desenhe o subtítulo (o motor desenha).
5. Use só as cores da paleta (e transparências). Mantenha ctx.save()/ctx.restore() equilibrados.
6. Leve: no máximo ~1500 formas por frame. Sem imagens, sem DOM, sem rede, sem bibliotecas.
CONTEXTO:
- Estilo do reel: {dna.get('estilo')} - {dna.get('estilo_desc', '')}.
- Cena {idx + 1} de {total}, papel: {scene.get('role')}. Duração aprox. {float(scene.get('dur', 3)):.1f}s.
- Ideia visual desta cena: {scene.get('idea') or 'livre, coerente com o estilo'}
- Cena anterior (NÃO repita): {anterior or 'nenhuma'}
Exemplo do FORMATO esperado (corpo da função, outra ideia):
{EXEMPLO}
Agora escreva o corpo da função da cena."""
            txt, glogs = gemini_call(p, chaves, modelos, mi_box, temperature=0.95, chave=idx)
            logs.extend(glogs)
            if not txt:
                logs.append("    sem código válido -> cena pronta (fallback)")
                return self._send_json({"code": None, "origem": "fallback", "mi": mi_box[0], "logs": logs})
            m = re.search(r"```(?:javascript|js)?\s*\n(.*?)```", txt, re.S)
            code = (m.group(1) if m else txt).strip().strip("`").strip()
            if len(code) < 40 or len(code) > 16000 or any(b in code for b in PROIBIDO):
                logs.append("    sem código válido -> cena pronta (fallback)")
                return self._send_json({"code": None, "origem": "fallback", "mi": mi_box[0], "logs": logs})
            biblioteca = ler_json("biblioteca_cenas.json", [])
            biblioteca.append({"role": scene.get("role"), "idea": scene.get("idea"), "estilo": dna.get("estilo"), "code": code})
            gravar_json("biblioteca_cenas.json", biblioteca[-80:])
            return self._send_json({"code": code, "origem": "gemini", "mi": mi_box[0], "logs": logs})

        self._send_json({"error": "Not found"}, 404)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), RenderServerHandler)
    print("Servidor Render Motion Showreel iniciado em http://0.0.0.0:%d" % PORT)
    srv.serve_forever()
