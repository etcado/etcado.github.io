(() => {
    // ---------- Einstellungen ----------
    const PITCH_X = 11;       // Abstand der Kacheln (CSS-Pixel) ohne Lupe
    const PITCH_Y = 16;
    const GAP = 0.3;           // Anteil Lücke zwischen den Kacheln (aussen)
    const GAP_LENS = 0.07;     // Anteil Lücke in der Lupe
    const MAGNIFY = 23;        // Vergrösserung im Zentrum der Lupe
    const LENS_POW = 1.7;      // Form der Lupe (höher = flacher)
    const LENS_SIZES = [0, 0.7, 1, 1.35];
    const HOVER_DELAY = 220;   // ms, bis Titel und Text erscheinen
    const LENS_FOLLOW = 6;     // wie schnell die Lupe zur nächsten Kachel gleitet (kleiner = weicher)
    const SPEED_SHRINK = 1800; // ab dieser Geschwindigkeit (px/s) ist die Lupe am kleinsten
    const LENS_MIN = 0.35;     // kleinste Lupe bei schneller Bewegung

    const canvas = document.getElementById('stage');
    const hud = document.getElementById('hud');
    const hudText = document.getElementById('hud-text');
    const hudTitle = document.getElementById('hud-title');
    const hudYear = document.getElementById('hud-year');
    const hudTags = document.getElementById('hud-tags');
    const detail = document.getElementById('detail');
    const detailTitle = document.getElementById('detail-title');
    const detailText = document.getElementById('detail-text');
    const detailLink = document.getElementById('detail-link');
    const root = document.documentElement;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const projects = PROJECTS.filter(p => p && p.src);

    // ---------- Zustand ----------
    const state = {
        dpr: 1,
        w: 0,
        h: 0,
        mouse: { x: 0, y: 0 },          // Ziel der Lupe
        lens: { x: 0, y: 0 },           // geglättete Lupe
        lensOn: 0,                       // Ziel-Stärke 0..1
        lensAmt: 0,                      // geglättete Stärke
        lensSize: 2,
        offset: { x: 0, y: 0 },          // Verschiebung des Rasters
        velocity: { x: 0, y: 0 },
        dragging: false,
        moved: 0,
        theme: 'dark',
        hoverCell: null,
        hoverSince: 0,
        shownCell: null,
        speed: 0,                        // geglättete Bewegung (px/s)
        lensScale: 1,                    // 1 = volle Lupe, kleiner bei schneller Bewegung
        prev: { mx: 0, my: 0, ox: 0, oy: 0 },
        detailCell: null                 // geöffnetes Projekt (Klick)
    };

    try {
        const saved = localStorage.getItem('theme');
        if (saved === 'light' || saved === 'dark') state.theme = saved;
        const size = Number(localStorage.getItem('lensSize'));
        if (size >= 1 && size <= 3) state.lensSize = size;
    } catch (e) { /* ohne Speicher weiter */ }
    root.dataset.theme = state.theme;
    document.getElementById('btn-lens').dataset.size = state.lensSize;

    // ---------- Hash: gleiche Formel wie im Shader ----------
    function hash(x, y) {
        let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        return (h ^ (h >>> 16)) >>> 0;
    }
    function projectAt(cx, cy) {
        return projects[hash(cx, cy) % projects.length];
    }

    // ---------- WebGL ----------
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl || !projects.length) {
        document.body.insertAdjacentHTML('beforeend',
            '<p class="noscript">Dein Browser unterstützt WebGL2 leider nicht.</p>');
        return;
    }

    const vertSrc = `#version 300 es
    in vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const fragSrc = `#version 300 es
    precision highp float;
    precision highp int;
    uniform vec2 uRes;
    uniform vec2 uLens;
    uniform float uAmt;
    uniform float uSigma;
    uniform float uMag;
    uniform vec2 uPitch;
    uniform vec2 uOffset;
    uniform float uGap;
    uniform float uGapLens;
    uniform float uPow;
    uniform int uCount;
    uniform vec2 uGrid;
    uniform vec3 uBg;
    uniform float uDim;
    uniform sampler2D uAtlas;
    out vec4 outColor;

    uint hash(ivec2 c) {
        uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u;
        h = (h ^ (h >> 13u)) * 1274126177u;
        return h ^ (h >> 16u);
    }

    float roundBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    void main() {
        vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
        vec2 d = p - uLens;
        float r2 = dot(d, d) / (uSigma * uSigma);
        float fall = exp(-pow(r2, uPow));
        float a = uAmt * (1.0 - 1.0 / uMag);
        // Fischauge: in der Mitte vergrössert, aussen ein leicht gestauchter Ring
        vec2 q = uLens + d * (1.0 - a * fall);
        vec2 g = (q + uOffset) / uPitch;
        vec2 cell = floor(g);
        vec2 f = g - cell;

        vec2 local = (f - 0.5) * uPitch;
        float gap = mix(uGap, uGapLens, uAmt * fall);
        vec2 half_ = 0.5 * uPitch * (1.0 - gap);
        float radius = min(half_.x, half_.y) * 0.42;
        float sd = roundBox(local, half_, radius);
        vec2 fw = fwidth(g) * uPitch;
        float aa = max(length(fw) * 0.6, 1e-4);
        float mask = 1.0 - smoothstep(-aa, aa, sd);

        uint idx = hash(ivec2(cell)) % uint(uCount);
        float cols = uGrid.x;
        vec2 slot = vec2(float(idx % uint(cols)), float(idx / uint(cols)));
        vec2 luv = clamp(local / (2.0 * half_) + 0.5, 0.0, 1.0);
        const float pad = 0.004;
        vec2 uv = (slot + pad + luv * (1.0 - 2.0 * pad)) / uGrid;
        vec2 scale = (1.0 - 2.0 * pad) / (uGrid * (1.0 - gap));
        vec3 tex = textureGrad(uAtlas, uv, dFdx(g) * scale, dFdy(g) * scale).rgb;

        float light = mix(uDim, 1.0, clamp(uAmt * exp(-r2 * 0.7), 0.0, 1.0));
        vec3 col = mix(uBg, tex, light * mask);
        outColor = vec4(col, 1.0);
    }`;

    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    ['uRes', 'uLens', 'uAmt', 'uSigma', 'uMag', 'uPitch', 'uOffset', 'uGap', 'uGapLens', 'uPow', 'uCount',
        'uGrid', 'uBg', 'uDim', 'uAtlas'].forEach(n => (U[n] = gl.getUniformLocation(prog, n)));

    // ---------- Bilder in ein Atlas-Bild packen ----------
    function loadImage(src) {
        return new Promise(resolve => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 40, 40, 255]));
    let grid = [1, 1];

    async function buildAtlas() {
        const images = await Promise.all(projects.map(p => loadImage(p.src)));
        const n = projects.length;
        const maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 8192);
        const aspect = PITCH_Y / PITCH_X;
        let cols = Math.ceil(Math.sqrt(n * aspect));
        let rows = Math.ceil(n / cols);
        let slotW = Math.min(420, Math.floor(maxTex / cols), Math.floor(maxTex / (rows * aspect)));
        let slotH = Math.round(slotW * aspect);

        const c = document.createElement('canvas');
        c.width = cols * slotW;
        c.height = rows * slotH;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#282828';
        ctx.fillRect(0, 0, c.width, c.height);
        images.forEach((img, i) => {
            if (!img) return;
            const x = (i % cols) * slotW;
            const y = Math.floor(i / cols) * slotH;
            // wie object-fit: cover
            const s = Math.max(slotW / img.width, slotH / img.height);
            const sw = slotW / s;
            const sh = slotH / s;
            ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, slotW, slotH);
        });

        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const ext = gl.getExtension('EXT_texture_filter_anisotropic');
        if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
        grid = [cols, rows];
    }

    // ---------- Grösse ----------
    function resize() {
        state.dpr = Math.min(window.devicePixelRatio || 1, 2);
        state.w = window.innerWidth;
        state.h = window.innerHeight;
        canvas.width = Math.round(state.w * state.dpr);
        canvas.height = Math.round(state.h * state.dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    state.mouse.x = state.lens.x = state.w * 0.45;
    state.mouse.y = state.lens.y = state.h * 0.55;
    state.offset.x = Math.random() * 10000;
    state.offset.y = Math.random() * 10000;

    function sigma() {
        return Math.min(Math.max(Math.min(state.w, state.h) * 0.42, 180), 420) * LENS_SIZES[state.lensSize] * state.lensScale;
    }

    // effektive Stärke der Lupe (inkl. Geschwindigkeit)
    function amount() {
        return state.lensAmt * (0.3 + 0.7 * state.lensScale);
    }

    // halbe Grösse der vergrösserten Kachel in der Mitte (CSS-Pixel)
    function centerTileHalf() {
        const a = amount() * (1 - 1 / MAGNIFY);
        const mag = 1 / Math.max(1 - a, 1 / MAGNIFY);
        return [0.45 * PITCH_X * mag * (1 - GAP_LENS), 0.45 * PITCH_Y * mag * (1 - GAP_LENS)];
    }

    function onCenterTile(x, y) {
        const [hw, hh] = centerTileHalf();
        return amount() > 0.5 && Math.abs(x - state.lens.x) < hw && Math.abs(y - state.lens.y) < hh;
    }

    // ---------- Projekt-Info ----------
    function currentCell() {
        const gx = (state.lens.x + state.offset.x) / PITCH_X;
        const gy = (state.lens.y + state.offset.y) / PITCH_Y;
        return [Math.floor(gx), Math.floor(gy)];
    }

    function showInfo(cell) {
        const p = projectAt(cell[0], cell[1]);
        hudText.textContent = p.text || '';
        hudTitle.textContent = p.title || '';
        hudYear.textContent = p.year ? `(${p.year})` : '';
        hudTags.innerHTML = '';
        (p.tags || []).forEach(t => {
            const li = document.createElement('li');
            li.textContent = t;
            hudTags.appendChild(li);
        });
        hud.classList.add('visible');
        state.shownCell = cell;
        placeInfo();
    }

    function hideInfo() {
        hud.classList.remove('visible');
        state.shownCell = null;
    }

    function placeInfo() {
        if (!state.shownCell) return;
        const s = sigma();
        const w = hud.offsetWidth;
        const h = hud.offsetHeight;
        const m = 20;
        let left = state.lens.x - s * 0.8;
        let top = state.lens.y - s * 0.95;
        if (state.w < 640) {
            left = m;
            top = state.lens.y > state.h / 2 ? m + 40 : state.h - h - m;
        } else if (top < m + 30) {
            top = state.lens.y + s * 0.8;
        }
        left = Math.min(Math.max(left, m), state.w - w - m);
        top = Math.min(Math.max(top, m), state.h - h - m);
        hud.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    }

    function openDetail() {
        const cell = currentCell();
        const p = projectAt(cell[0], cell[1]);
        state.detailCell = cell;
        if (!state.shownCell) showInfo(cell);
        detailTitle.textContent = p.title || '';
        detailText.textContent = p.description || p.text || '';
        if (p.link) {
            detailLink.href = p.link;
            detailLink.hidden = false;
        } else {
            detailLink.hidden = true;
        }
        detail.hidden = false;
        placeDetail();
        requestAnimationFrame(() => detail.classList.add('visible'));
    }

    function closeDetail() {
        if (!state.detailCell) return;
        state.detailCell = null;
        detail.classList.remove('visible');
        setTimeout(() => {
            if (!state.detailCell) detail.hidden = true;
        }, 250);
    }

    function placeDetail() {
        if (!state.detailCell) return;
        const m = 20;
        const w = detail.offsetWidth;
        const h = detail.offsetHeight;
        let left;
        let top;
        if (state.w < 640) {
            left = (state.w - w) / 2;
            top = state.h - h - m;
        } else {
            const [hw] = centerTileHalf();
            left = state.lens.x + hw + 36;
            if (left + w > state.w - m) left = state.lens.x - hw - 36 - w;
            top = state.lens.y - h / 2;
        }
        left = Math.min(Math.max(left, m), state.w - w - m);
        top = Math.min(Math.max(top, m), state.h - h - m);
        detail.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    }

    function updateHover(now) {
        if (state.detailCell) return;
        if (amount() < 0.6 || state.dragging) {
            state.hoverCell = null;
            if (state.shownCell) hideInfo();
            return;
        }
        const cell = currentCell();
        const same = state.hoverCell && state.hoverCell[0] === cell[0] && state.hoverCell[1] === cell[1];
        if (!same) {
            state.hoverCell = cell;
            state.hoverSince = now;
            if (state.shownCell) hideInfo();
        } else if (!state.shownCell && now - state.hoverSince > HOVER_DELAY) {
            showInfo(cell);
        }
    }

    // ---------- Zeichnen ----------
    const BG = { dark: [0.04, 0.04, 0.04], light: [0.937, 0.933, 0.918] };
    let last = performance.now();

    function frame(now) {
        const realDt = Math.max((now - last) / 1000, 1e-3);
        const dt = Math.min(realDt, 0.1);
        last = now;
        const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * LENS_FOLLOW);
        const easeAmt = reducedMotion ? 1 : 1 - Math.exp(-dt * 6);

        // Geschwindigkeit von Maus und Raster messen
        const pv = state.prev;
        const moved = Math.hypot(state.mouse.x - pv.mx, state.mouse.y - pv.my) +
            Math.hypot(state.offset.x - pv.ox, state.offset.y - pv.oy);
        pv.mx = state.mouse.x; pv.my = state.mouse.y; pv.ox = state.offset.x; pv.oy = state.offset.y;
        const v = moved / realDt;
        state.speed += (v - state.speed) * (1 - Math.exp(-dt * (v > state.speed ? 12 : 5)));

        // schnell = kleine Lupe; langsam = Lupe wächst wieder (etwas gemächlicher)
        const targetScale = state.detailCell ? 1 :
            Math.max(LENS_MIN, 1 - (1 - LENS_MIN) * Math.min(state.speed / SPEED_SHRINK, 1));
        const scaleRate = targetScale < state.lensScale ? 10 : 2.5;
        state.lensScale += (targetScale - state.lensScale) * (reducedMotion ? 1 : 1 - Math.exp(-dt * scaleRate));

        // Lupe gleitet zur Mitte der Kachel unter dem Mauszeiger (steht still, solange ein Projekt offen ist)
        if (!state.detailCell) {
            const tx = (Math.floor((state.mouse.x + state.offset.x) / PITCH_X) + 0.5) * PITCH_X - state.offset.x;
            const ty = (Math.floor((state.mouse.y + state.offset.y) / PITCH_Y) + 0.5) * PITCH_Y - state.offset.y;
            state.lens.x += (tx - state.lens.x) * ease;
            state.lens.y += (ty - state.lens.y) * ease;
        }
        state.lensAmt += ((state.detailCell ? 1 : state.lensOn) - state.lensAmt) * easeAmt;

        if (!state.dragging && (Math.abs(state.velocity.x) > 0.01 || Math.abs(state.velocity.y) > 0.01)) {
            state.offset.x += state.velocity.x * dt;
            state.offset.y += state.velocity.y * dt;
            const decay = Math.exp(-dt * 4);
            state.velocity.x *= decay;
            state.velocity.y *= decay;
        }

        const dpr = state.dpr;
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform2f(U.uLens, state.lens.x * dpr, state.lens.y * dpr);
        gl.uniform1f(U.uAmt, amount());
        gl.uniform1f(U.uSigma, sigma() * dpr);
        gl.uniform1f(U.uMag, MAGNIFY);
        gl.uniform2f(U.uPitch, PITCH_X * dpr, PITCH_Y * dpr);
        gl.uniform2f(U.uOffset, state.offset.x * dpr, state.offset.y * dpr);
        gl.uniform1f(U.uGap, GAP);
        gl.uniform1f(U.uGapLens, GAP_LENS);
        gl.uniform1f(U.uPow, LENS_POW);
        gl.uniform1i(U.uCount, projects.length);
        gl.uniform2f(U.uGrid, grid[0], grid[1]);
        gl.uniform3fv(U.uBg, BG[state.theme]);
        gl.uniform1f(U.uDim, state.theme === 'dark' ? 0.32 : 0.45);
        gl.uniform1i(U.uAtlas, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        updateHover(now);
        placeInfo();
        placeDetail();
        requestAnimationFrame(frame);
    }

    // ---------- Eingabe ----------
    let dragStart = null;

    canvas.addEventListener('pointerdown', e => {
        canvas.setPointerCapture(e.pointerId);
        dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
        state.dragging = true;
        state.moved = 0;
        state.velocity.x = state.velocity.y = 0;
        state.downOnTile = onCenterTile(e.clientX, e.clientY);
        if (e.pointerType !== 'mouse' && !state.downOnTile && !state.detailCell) state.lensOn = 0;
    });

    canvas.addEventListener('pointermove', e => {
        if (state.dragging && dragStart) {
            if (state.moved > 6) {
                document.body.classList.add('dragging');
                closeDetail();
            }
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            const t = performance.now();
            const dtm = Math.max(t - dragStart.t, 1) / 1000;
            state.offset.x -= dx;
            state.offset.y -= dy;
            state.velocity.x = -dx / dtm;
            state.velocity.y = -dy / dtm;
            state.moved += Math.abs(dx) + Math.abs(dy);
            dragStart = { x: e.clientX, y: e.clientY, t };
        }
        if (e.pointerType === 'mouse') {
            state.mouse.x = e.clientX;
            state.mouse.y = e.clientY;
            state.lensOn = 1;
        }
    });

    function endDrag(e) {
        if (!state.dragging) return;
        state.dragging = false;
        document.body.classList.remove('dragging');
        if (performance.now() - (dragStart ? dragStart.t : 0) > 80) {
            state.velocity.x = state.velocity.y = 0;
        }
        dragStart = null;
        if (state.moved >= 8) return;
        state.velocity.x = state.velocity.y = 0;

        // Klick auf die Kachel in der Lupe: Projekttext öffnen; daneben: schliessen
        const onTile = state.downOnTile && onCenterTile(e.clientX, e.clientY);
        if (state.detailCell) {
            if (!onTile) closeDetail();
            if (e.pointerType === 'mouse' || onTile) return;
        } else if (onTile) {
            openDetail();
            return;
        }
        // Antippen auf Touch: Lupe an dieser Stelle öffnen
        if (e.pointerType !== 'mouse') {
            state.velocity.x = state.velocity.y = 0;
            state.mouse.x = e.clientX;
            state.mouse.y = e.clientY;
            if (state.lensAmt < 0.1) {
                state.lens.x = e.clientX;
                state.lens.y = e.clientY;
            }
            state.lensOn = 1;
        }
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    document.addEventListener('pointerleave', e => {
        if (e.pointerType === 'mouse') state.lensOn = 0;
    });
    document.documentElement.addEventListener('mouseleave', () => (state.lensOn = 0));

    window.addEventListener('wheel', e => {
        if (!document.getElementById('about').hidden) return;
        e.preventDefault();
        closeDetail();
        const k = e.deltaMode === 1 ? 16 : 1;
        state.offset.x += (e.shiftKey ? e.deltaY : e.deltaX) * k;
        state.offset.y += (e.shiftKey ? 0 : e.deltaY) * k;
    }, { passive: false });

    document.getElementById('detail-close').addEventListener('click', closeDetail);

    window.addEventListener('keydown', e => {
        const step = 60;
        if (e.key.startsWith('Arrow')) closeDetail();
        if (e.key === 'ArrowLeft') state.offset.x -= step;
        else if (e.key === 'ArrowRight') state.offset.x += step;
        else if (e.key === 'ArrowUp') state.offset.y -= step;
        else if (e.key === 'ArrowDown') state.offset.y += step;
        else if (e.key === 'Escape') {
            closeDetail();
            closeAbout();
        }
    });

    // ---------- Buttons ----------
    const about = document.getElementById('about');
    function closeAbout() {
        about.hidden = true;
    }
    document.getElementById('btn-info').addEventListener('click', () => {
        about.hidden = false;
        document.getElementById('about-close').focus();
    });
    document.getElementById('about-close').addEventListener('click', closeAbout);
    about.addEventListener('click', e => {
        if (e.target === about) closeAbout();
    });

    document.getElementById('btn-theme').addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        root.dataset.theme = state.theme;
        try { localStorage.setItem('theme', state.theme); } catch (e) { /* egal */ }
    });

    document.getElementById('btn-lens').addEventListener('click', e => {
        state.lensSize = state.lensSize % 3 + 1;
        e.currentTarget.dataset.size = state.lensSize;
        try { localStorage.setItem('lensSize', state.lensSize); } catch (err) { /* egal */ }
    });

    buildAtlas().then(() => requestAnimationFrame(t => {
        last = t;
        frame(t);
    }));
})();
