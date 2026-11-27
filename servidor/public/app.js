'use strict';

// ============================================================
// UTILIDADES DE RUTAS, MODO DEMO STANDALONE Y SEGURIDAD
// ============================================================
const AVATAR_WEBP = window.__DEMO_AVATAR__ || '/catalogo/artista_avatar.webp';

function stemDeRuta(u) {
    const clean = String(u || '').split('?')[0];
    const base = clean.substring(clean.lastIndexOf('/') + 1);
    return base.replace(/\.[^.]+$/, '');
}

function toThumbUrl(u) {
    if (window.__DEMO_IMGS__) {
        const key = stemDeRuta(u);
        if (window.__DEMO_IMGS__[key]) return window.__DEMO_IMGS__[key];
    }
    return String(u || '')
        .replace(/\/catalogo\/(?:imagenes|thumbs|hd)\//, '/catalogo/thumbs/')
        .replace(/\.[^.\/]+$/, '.webp');
}

function toHdUrl(u) {
    if (window.__DEMO_IMGS__) {
        const key = stemDeRuta(u);
        if (window.__DEMO_IMGS__[key]) return window.__DEMO_IMGS__[key];
    }
    return String(u || '')
        .replace(/\/catalogo\/(?:imagenes|thumbs|hd)\//, '/catalogo/hd/')
        .replace(/\.[^.\/]+$/, '.webp');
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function grupoEstilo(estilo) {
    const e = String(estilo || '').trim();
    if (e === 'Blackwork') return 'Blackwork';
    if (e === 'Anime y Manga') return 'Anime y Manga';
    if (e === 'Realismo' || e === 'Microrealismo') return 'Realismo & Microrealismo';
    if (e === 'Neotradicional') return 'Neotradicional';
    return 'Ilustrativo & Linework';
}

// Estado global para pausar animaciones ambientales (WebGL + cinta) al abrir visor o modal
let visorEstaAbierto = false;
let glassModalAbierto = false;
let actualizarEstadoWebGL = () => {};
let actualizarEstadoMarquee = () => {};

window.addEventListener('preto:modal-state', (e) => {
    glassModalAbierto = !!(e.detail && e.detail.open);
    actualizarEstadoWebGL();
    actualizarEstadoMarquee();
});

// ============================================================
// 1. MOTOR WEBGL DE TINTA FLUIDA (PAUSA INTELIGENTE Y RESIZE)
// ============================================================
(function iniciarTintaWebGL() {
    const canvas = document.getElementById('ink-webgl');
    const stage = document.getElementById('ink-stage');
    const fallbackImg = document.getElementById('ink-fallback');
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
    let webglFallido = false;
    let rafId = null;

    function activarFallbackImagen() {
        webglFallido = true;
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        canvas.style.display = 'none';
        if (fallbackImg) {
            if (window.__DEMO_INK__) fallbackImg.src = window.__DEMO_INK__;
            fallbackImg.style.display = 'block';
        }
    }

    if (!gl) {
        activarFallbackImagen();
        return;
    }

    const highpFmt = gl.getShaderPrecisionFormat ? gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT) : null;
    if (highpFmt && highpFmt.precision === 0) {
        activarFallbackImagen();
        return;
    }

    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        activarFallbackImagen();
    });

    const vsSource = `
        attribute vec2 a_pos;
        attribute vec2 a_uv;
        varying vec2 v_uv;
        void main() {
            v_uv = a_uv;
            gl_Position = vec4(a_pos, 0.0, 1.0);
        }
    `;

    const fsSource = `
        precision highp float;
        uniform sampler2D u_tex;
        uniform float u_time;
        uniform vec2 u_mouse;
        uniform float u_hover;
        varying vec2 v_uv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                u.y
            );
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p = p * 2.04 + vec2(1.7, 9.2);
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = v_uv;
            float peso = smoothstep(0.0, 0.65, uv.y);

            float t = u_time * 0.32;
            float n1 = fbm(uv * 3.2 + vec2(0.0, -t * 0.75)) - 0.5;
            float n2 = fbm(uv * 5.8 + vec2(t * 0.45, -t * 0.4)) - 0.5;
            float breathe = sin(u_time * 0.9) * 0.008 * peso;

            vec2 offset = vec2(
                (n1 * 0.032 + n2 * 0.014) * peso,
                (n2 * 0.022 + breathe) * peso
            );

            vec2 toMouse = uv - u_mouse;
            float dist = length(toMouse);
            float ripple = exp(-dist * 7.5) * u_hover * 0.018 * peso;
            offset += normalize(toMouse + 0.0001) * ripple;

            vec2 displaced = uv + offset;
            if (displaced.x < 0.0 || displaced.x > 1.0 || displaced.y < 0.0 || displaced.y > 1.0) {
                discard;
            }

            vec4 col = texture2D(u_tex, displaced);
            float highlight = smoothstep(0.18, 0.42, n1 + 0.25) * 0.045 * col.a;
            col.rgb += vec3(highlight);

            gl_FragColor = col;
        }
    `;

    function compileShader(type, src) {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) {
        activarFallbackImagen();
        return;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        activarFallbackImagen();
        return;
    }
    gl.useProgram(prog);

    const verts = new Float32Array([
        -1,  1,  0, 0,
        -1, -1,  0, 1,
         1,  1,  1, 0,
         1, -1,  1, 1,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const aUv = gl.getAttribLocation(prog, 'a_uv');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uHover = gl.getUniformLocation(prog, 'u_hover');

    let mouseX = 0.5, mouseY = 0.5, hoverTarget = 0, hoverVal = 0;
    function actualizarPosicionStage(clientX, clientY) {
        const r = stage.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        mouseX = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
        mouseY = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
        hoverTarget = 1;
    }
    stage.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        actualizarPosicionStage(e.clientX, e.clientY);
    });
    stage.addEventListener('pointerleave', (e) => {
        if (e.pointerType !== 'mouse') return;
        hoverTarget = 0;
    });
    stage.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        actualizarPosicionStage(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    stage.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        actualizarPosicionStage(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    stage.addEventListener('touchend', () => { hoverTarget = 0; }, { passive: true });
    stage.addEventListener('touchcancel', () => { hoverTarget = 0; }, { passive: true });

    let heroVisible = true;
    let texturaLista = false;
    let tiempoAcumulado = 0;
    let ultimoTick = null;

    function ajustarTamanoCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(stage.clientWidth * dpr));
        const h = Math.max(1, Math.round(stage.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
    }

    function dibujarFrame(now) {
        if (ultimoTick !== null) {
            const dt = Math.min((now - ultimoTick) * 0.001, 0.1);
            tiempoAcumulado = (tiempoAcumulado + dt) % 628.3185;
        }
        ultimoTick = now;
        hoverVal += (hoverTarget - hoverVal) * 0.08;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uTime, tiempoAcumulado);
        gl.uniform2f(uMouse, mouseX, mouseY);
        gl.uniform1f(uHover, hoverVal);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function loop(now) {
        dibujarFrame(now);
        rafId = requestAnimationFrame(loop);
    }

    function sincronizarAnimacion() {
        if (!texturaLista || webglFallido) return;
        const debeCorrer = heroVisible && !document.hidden && !visorEstaAbierto && !glassModalAbierto && !prefersReduced;
        if (debeCorrer && rafId === null) {
            ultimoTick = null;
            rafId = requestAnimationFrame(loop);
        } else if (!debeCorrer && rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
            ultimoTick = null;
        }
    }
    actualizarEstadoWebGL = sincronizarAnimacion;

    if ('IntersectionObserver' in window) {
        const ioHero = new IntersectionObserver((entries) => {
            heroVisible = entries[0].isIntersecting;
            sincronizarAnimacion();
        }, { threshold: 0.02 });
        ioHero.observe(stage);
    }

    document.addEventListener('visibilitychange', sincronizarAnimacion);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (webglFallido) return;
            ajustarTamanoCanvas();
            if (texturaLista && rafId === null) dibujarFrame(performance.now());
        }, 120);
    });

    const img = new Image();
    img.onerror = () => {
        if (!img.dataset.fallback && !window.__DEMO_INK__) {
            img.dataset.fallback = '1';
            img.src = '/ink_hero_transparent.png';
        } else {
            activarFallbackImagen();
        }
    };
    img.onload = () => {
        if (webglFallido) return;
        try {
            ajustarTamanoCanvas();
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            texturaLista = true;
            dibujarFrame(performance.now());
            if (fallbackImg) fallbackImg.style.display = 'none';
            sincronizarAnimacion();
        } catch (err) {
            activarFallbackImagen();
        }
    };
    img.src = window.__DEMO_INK__ || '/ink_hero_transparent.webp';
})();

// ============================================================
// 1b. PAUSA AUTOMÁTICA DE LA CINTA FUERA DE PANTALLA
// ============================================================
(function iniciarPausaMarquee() {
    const marquee = document.querySelector('.marquee-wrap');
    if (!marquee) return;
    let marqueeVisible = true;

    function syncMarquee() {
        const pausar = !marqueeVisible || document.hidden || visorEstaAbierto || glassModalAbierto;
        marquee.classList.toggle('pausado', pausar);
    }
    actualizarEstadoMarquee = syncMarquee;

    if ('IntersectionObserver' in window) {
        const ioM = new IntersectionObserver((entries) => {
            marqueeVisible = entries[0].isIntersecting;
            syncMarquee();
        }, { threshold: 0.01 });
        ioM.observe(marquee);
    }

    document.addEventListener('visibilitychange', syncMarquee);
})();

// ============================================================
// 2. VISOR MODAL GALERÍA DE FOTOS RELACIONADAS
// ============================================================
const esDispositivoTactil = window.matchMedia('(hover: none), (pointer: coarse)').matches;

const visorModal = document.getElementById('visor-modal');
const visorStage = document.getElementById('visor-stage');
const fotoGrande = document.getElementById('foto-grande');
const visorSpinner = document.getElementById('visor-spinner');
const visorTitulo = document.getElementById('visor-titulo');
const visorContador = document.getElementById('visor-contador');
const visorIgLink = document.getElementById('visor-ig-link');
const visorTiraWrap = document.getElementById('visor-tira-wrap');
const visorTira = document.getElementById('visor-tira');
const btnCerrar = document.getElementById('btn-cerrar');
const btnAnterior = document.getElementById('btn-anterior');
const btnSiguiente = document.getElementById('btn-siguiente');

let obraActual = null;
let fotosHdActual = [];
let fotosThumbActual = [];
let indiceActual = 0;
let visorLoadToken = 0;
let elementoDisparador = null;

function precargarVecinas(idx) {
    if (fotosHdActual.length <= 1 || window.__DEMO_IMGS__) return;
    const sig = (idx + 1) % fotosHdActual.length;
    const ant = (idx - 1 + fotosHdActual.length) % fotosHdActual.length;
    [sig, ant].forEach(i => {
        const preload = new Image();
        preload.src = fotosHdActual[i];
    });
}

function actualizarTiraActiva() {
    const thumbs = visorTira.querySelectorAll('.visor-thumb');
    thumbs.forEach((btn, i) => {
        const esActiva = i === indiceActual;
        btn.classList.toggle('activa', esActiva);
        btn.setAttribute('aria-selected', esActiva ? 'true' : 'false');
        if (esActiva && visorTira.scrollWidth > visorTira.clientWidth) {
            const tiraRect = visorTira.getBoundingClientRect();
            const btnRect = btn.getBoundingClientRect();
            const targetLeft = visorTira.scrollLeft + (btnRect.left - tiraRect.left) - (tiraRect.width / 2) + (btnRect.width / 2);
            visorTira.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
        }
    });
}

function mostrarFoto(indice) {
    if (!fotosHdActual.length) return;
    indiceActual = ((indice % fotosHdActual.length) + fotosHdActual.length) % fotosHdActual.length;
    const token = ++visorLoadToken;

    const total = fotosHdActual.length;
    const prefijoEstilo = obraActual?.estilo ? `${obraActual.estilo.toUpperCase()} · ` : '';
    visorContador.textContent = total > 1
        ? `${prefijoEstilo}FOTO ${indiceActual + 1} DE ${total} · GALERÍA DE ESTA OBRA`
        : `${prefijoEstilo}FOTO ÚNICA`;

    const hayVarias = total > 1;
    btnAnterior.style.display = hayVarias ? 'inline-flex' : 'none';
    btnSiguiente.style.display = hayVarias ? 'inline-flex' : 'none';
    actualizarTiraActiva();

    fotoGrande.classList.remove('lista');
    visorSpinner.classList.add('visible');

    const urlHd = fotosHdActual[indiceActual];
    const urlFallback = fotosThumbActual[indiceActual] || '';

    const loader = new Image();
    loader.onload = () => {
        if (token !== visorLoadToken) return;
        fotoGrande.src = loader.src;
        fotoGrande.alt = `${obraActual?.titulo || 'Tatuaje'} — foto ${indiceActual + 1} de ${total}`;
        visorSpinner.classList.remove('visible');
        requestAnimationFrame(() => fotoGrande.classList.add('lista'));
        precargarVecinas(indiceActual);
    };
    loader.onerror = () => {
        if (token !== visorLoadToken) return;
        if (urlFallback && !loader.dataset.thumbTried) {
            loader.dataset.thumbTried = '1';
            loader.src = urlFallback;
        } else {
            visorSpinner.classList.remove('visible');
        }
    };
    loader.src = urlHd;
}

function abrirVisor(obra, indiceInicial = 0, disparador = null) {
    if (window.PretoModales && window.PretoModales.activeModal) {
        window.PretoModales.close(true);
    }

    obraActual = obra;
    elementoDisparador = disparador;
    const fuentes = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes : [obra.imagen_url];
    fotosHdActual = fuentes.map(toHdUrl);
    fotosThumbActual = fuentes.map(toThumbUrl);

    visorTitulo.textContent = obra.titulo || 'Obra';
    if (obra.instagram_url) {
        visorIgLink.href = obra.instagram_url;
        visorIgLink.style.display = '';
    } else {
        visorIgLink.style.display = 'none';
    }

    visorTira.innerHTML = '';
    if (fotosHdActual.length > 1) {
        const frag = document.createDocumentFragment();
        fotosThumbActual.forEach((thumbUrl, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'visor-thumb';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-label', `Ver foto ${idx + 1} de ${fotosHdActual.length}`);
            const img = document.createElement('img');
            img.src = thumbUrl;
            img.alt = '';
            img.loading = 'lazy';
            btn.appendChild(img);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                mostrarFoto(idx);
            });
            frag.appendChild(btn);
        });
        visorTira.appendChild(frag);
        visorTiraWrap.classList.remove('oculto');
    } else {
        visorTiraWrap.classList.add('oculto');
    }

    visorEstaAbierto = true;
    document.documentElement.classList.add('visor-abierto');
    document.body.classList.add('visor-abierto');
    visorModal.classList.add('abierto');
    visorModal.setAttribute('aria-hidden', 'false');
    actualizarEstadoWebGL();
    actualizarEstadoMarquee();

    mostrarFoto(indiceInicial);
    if (esDispositivoTactil) {
        visorModal.focus({ preventScroll: true });
    } else {
        btnCerrar.focus({ preventScroll: true });
    }
}

function cerrarVisor() {
    if (!visorEstaAbierto) return;
    visorEstaAbierto = false;
    visorLoadToken++;
    visorModal.classList.remove('abierto');
    visorModal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('visor-abierto');
    document.body.classList.remove('visor-abierto');
    visorSpinner.classList.remove('visible');
    fotoGrande.classList.remove('lista');
    actualizarEstadoWebGL();
    actualizarEstadoMarquee();

    if (!esDispositivoTactil && elementoDisparador && typeof elementoDisparador.focus === 'function') {
        elementoDisparador.focus({ preventScroll: true });
    }
}

window.PretoCerrarVisor = cerrarVisor;

btnCerrar.addEventListener('click', cerrarVisor);
visorModal.addEventListener('click', (e) => {
    if (e.target === visorModal || e.target === visorStage || e.target.classList.contains('visor-foto-wrap')) {
        cerrarVisor();
    }
});
visorModal.addEventListener('touchmove', (e) => {
    if (!visorEstaAbierto) return;
    if (e.touches.length === 1 && !e.target.closest('#visor-tira')) {
        if (e.cancelable) e.preventDefault();
    }
}, { passive: false });
btnSiguiente.addEventListener('click', (e) => {
    e.stopPropagation();
    mostrarFoto(indiceActual + 1);
});
btnAnterior.addEventListener('click', (e) => {
    e.stopPropagation();
    mostrarFoto(indiceActual - 1);
});

document.addEventListener('keydown', (e) => {
    if (!visorEstaAbierto) return;
    if (e.key === 'Escape') cerrarVisor();
    if (e.key === 'ArrowRight' && fotosHdActual.length > 1) mostrarFoto(indiceActual + 1);
    if (e.key === 'ArrowLeft' && fotosHdActual.length > 1) mostrarFoto(indiceActual - 1);
    if (e.key === 'Home' && fotosHdActual.length > 1) mostrarFoto(0);
    if (e.key === 'End' && fotosHdActual.length > 1) mostrarFoto(fotosHdActual.length - 1);
});

let touchStartX = 0;
let touchStartY = 0;
let swipeValido = false;
visorStage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('button')) {
        swipeValido = false;
        return;
    }
    swipeValido = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

visorStage.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) swipeValido = false;
}, { passive: true });

visorStage.addEventListener('touchcancel', () => {
    swipeValido = false;
}, { passive: true });

visorStage.addEventListener('touchend', (e) => {
    const valido = swipeValido;
    swipeValido = false;
    if (!valido || !visorEstaAbierto || fotosHdActual.length <= 1 || e.touches.length !== 0 || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        mostrarFoto(dx < 0 ? indiceActual + 1 : indiceActual - 1);
    }
}, { passive: true });

// ============================================================
// 3. FILTROS POR ESTILO + CARGA INCREMENTAL DEL CATÁLOGO
// ============================================================
const BATCH_SIZE = 16;
const GRUPOS_ORDEN = [
    'Todos',
    'Blackwork',
    'Anime y Manga',
    'Realismo & Microrealismo',
    'Neotradicional',
    'Ilustrativo & Linework'
];

const contenedor = document.getElementById('catalogo');
const estadoEl = document.getElementById('catalogo-estado');
const filtrosEl = document.getElementById('filtros-estilo');

let todasLasObras = [];
let obrasFiltradas = [];
let filtroActivo = 'Todos';
let renderizadas = 0;
let observerCatalogo = null;
let touchMiniObserver = null;

if (esDispositivoTactil && 'IntersectionObserver' in window) {
    touchMiniObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (typeof entry.target._hidratar === 'function') {
                    entry.target._hidratar();
                }
                touchMiniObserver.unobserve(entry.target);
            }
        });
    }, { rootMargin: '200px 0px' });
}

function crearTarjetaObra(obra, esPrioritaria) {
    const item = document.createElement('article');
    item.className = 'obra-card';

    const origImgs = (obra.imagenes && obra.imagenes.length > 0) ? obra.imagenes : [obra.imagen_url];
    const thumbImgs = origImgs.map(toThumbUrl);
    const totalFotos = origImgs.length;
    const esGaleria = totalFotos > 1;
    const portadaThumb = thumbImgs[0];
    const tituloSafe = escapeHtml(obra.titulo);
    const artistaSafe = escapeHtml(obra.artista);

    let tagsHtml = '';
    if (obra.hashtags && obra.hashtags.length > 0) {
        tagsHtml = `<div class="obra-tags">${obra.hashtags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
    }

    let descHtml = '';
    if (obra.descripcion) {
        descHtml = `<div class="obra-desc">${escapeHtml(obra.descripcion)}</div>`;
    }

    const badgeHtml = esGaleria
        ? `<span class="badge-galeria" aria-label="${totalFotos} fotos relacionadas">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="2" y="4.5" width="9" height="9.5" rx="1"></rect>
                    <path d="M5.5 4.5V2.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2"></path>
                </svg>
                ${totalFotos} fotos
           </span>`
        : '';

    let miniTiraHtml = '';
    if (esGaleria) {
        const maxVisibles = 4;
        const thumbsHtml = thumbImgs.slice(0, maxVisibles).map((u, idx) => `
            <button type="button" class="mini-thumb-btn${idx === 0 ? ' activa' : ''}" data-idx="${idx}" aria-label="Previsualizar foto ${idx + 1} de ${tituloSafe}">
                <img data-src="${escapeHtml(u)}" alt="" decoding="async">
            </button>
        `).join('');
        const extraHtml = totalFotos > maxVisibles
            ? `<span class="mini-mas">+${totalFotos - maxVisibles}</span>`
            : '';
        miniTiraHtml = `
            <div class="mini-relacionadas">
                ${thumbsHtml}
                ${extraHtml}
                <span class="hint-ampliar">ver galería ↗</span>
            </div>
        `;
    } else {
        miniTiraHtml = `
            <div class="mini-relacionadas">
                <span class="hint-ampliar">ampliar ↗</span>
            </div>
        `;
    }

    item.innerHTML = `
        <div class="obra-media${esGaleria ? ' es-galeria' : ''}" tabindex="0" role="button" aria-label="Abrir galería de ${tituloSafe} (${totalFotos} ${esGaleria ? 'fotos' : 'foto'})">
            <div class="obra-frame">
                <img
                    src="${escapeHtml(portadaThumb)}"
                    alt="${tituloSafe}"
                    class="foto-obra-click"
                    ${esPrioritaria ? 'fetchpriority="high"' : 'loading="lazy"'}
                    decoding="async"
                >
                ${badgeHtml}
                ${miniTiraHtml}
            </div>
        </div>
        <div class="obra-meta">
            <div>
                <a href="${escapeHtml(obra.artista_instagram)}" target="_blank" rel="noopener noreferrer" title="Instagram de ${artistaSafe}">
                    <img class="avatar" src="${AVATAR_WEBP}" alt="${artistaSafe}" width="56" height="56" loading="lazy" decoding="async">
                </a>
                <h3>${tituloSafe}</h3>
                ${descHtml}
                ${tagsHtml}
            </div>
            <div class="obra-acciones">
                <button type="button" class="obra-btn-detalles">
                    <span>Ver detalles</span><span>↗</span>
                </button>
            </div>
        </div>
    `;

    const mediaBox = item.querySelector('.obra-media');
    const imgPrincipal = item.querySelector('.foto-obra-click');
    const btnDetalles = item.querySelector('.obra-btn-detalles');

    let miniHidratadas = false;
    function hidratarMiniaturas() {
        if (miniHidratadas || !esGaleria) return;
        miniHidratadas = true;
        item.querySelectorAll('.mini-thumb-btn img[data-src]').forEach(img => {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        });
    }

    let indicePreview = 0;

    if (esGaleria) {
        mediaBox.addEventListener('mouseenter', hidratarMiniaturas);
        mediaBox.addEventListener('focusin', hidratarMiniaturas);

        if (touchMiniObserver) {
            mediaBox._hidratar = hidratarMiniaturas;
            touchMiniObserver.observe(mediaBox);
        }

        const miniBtns = item.querySelectorAll('.mini-thumb-btn');
        miniBtns.forEach((btn) => {
            const idx = Number(btn.dataset.idx);
            if (!esDispositivoTactil) {
                btn.addEventListener('mouseenter', () => {
                    hidratarMiniaturas();
                    indicePreview = idx;
                    imgPrincipal.src = thumbImgs[idx];
                    miniBtns.forEach(b => b.classList.toggle('activa', Number(b.dataset.idx) === idx));
                });
            }
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirVisor(obra, idx, mediaBox);
            });
        });

        if (!esDispositivoTactil) {
            mediaBox.addEventListener('mouseleave', () => {
                if (indicePreview !== 0) {
                    indicePreview = 0;
                    imgPrincipal.src = portadaThumb;
                    miniBtns.forEach(b => b.classList.toggle('activa', Number(b.dataset.idx) === 0));
                }
            });
        }
    }

    btnDetalles.addEventListener('click', () => abrirVisor(obra, 0, btnDetalles));
    mediaBox.addEventListener('click', () => abrirVisor(obra, indicePreview, mediaBox));
    mediaBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            abrirVisor(obra, indicePreview, mediaBox);
        }
    });

    return item;
}

function renderizarSiguienteLote() {
    if (renderizadas >= obrasFiltradas.length) {
        if (observerCatalogo) observerCatalogo.disconnect();
        const sufijo = filtroActivo === 'Todos' ? '' : ` (${filtroActivo})`;
        estadoEl.textContent = `${obrasFiltradas.length} obras en el archivo${sufijo} · Preto Leone`;
        return;
    }

    const fin = Math.min(renderizadas + BATCH_SIZE, obrasFiltradas.length);
    const frag = document.createDocumentFragment();
    for (let i = renderizadas; i < fin; i++) {
        frag.appendChild(crearTarjetaObra(obrasFiltradas[i], i < 4));
    }
    contenedor.appendChild(frag);
    renderizadas = fin;

    if (renderizadas < obrasFiltradas.length) {
        estadoEl.textContent = `Mostrando ${renderizadas} de ${obrasFiltradas.length} obras...`;
    } else {
        if (observerCatalogo) observerCatalogo.disconnect();
        const sufijo = filtroActivo === 'Todos' ? '' : ` (${filtroActivo})`;
        estadoEl.textContent = `${obrasFiltradas.length} obras en el archivo${sufijo} · Preto Leone`;
    }
}

function iniciarObserverCatalogo() {
    if (observerCatalogo) observerCatalogo.disconnect();
    if ('IntersectionObserver' in window && renderizadas < obrasFiltradas.length) {
        observerCatalogo = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                renderizarSiguienteLote();
            }
        }, { rootMargin: '600px 0px' });
        observerCatalogo.observe(estadoEl);
    } else {
        while (renderizadas < obrasFiltradas.length) {
            renderizarSiguienteLote();
        }
    }
}

function aplicarFiltro(nombre, opts = {}) {
    filtroActivo = nombre;
    obrasFiltradas = nombre === 'Todos'
        ? todasLasObras
        : todasLasObras.filter(o => grupoEstilo(o.estilo) === nombre);

    let btnActivo = null;
    filtrosEl.querySelectorAll('.filtro-btn').forEach(btn => {
        const esActivo = btn.dataset.filtro === nombre;
        btn.classList.toggle('activo', esActivo);
        btn.setAttribute('aria-selected', esActivo ? 'true' : 'false');
        if (esActivo) btnActivo = btn;
    });

    if (opts.centrarChip && btnActivo && filtrosEl.scrollWidth > filtrosEl.clientWidth) {
        const contRect = filtrosEl.getBoundingClientRect();
        const btnRect = btnActivo.getBoundingClientRect();
        const targetLeft = filtrosEl.scrollLeft + (btnRect.left - contRect.left) - (contRect.width / 2) + (btnRect.width / 2);
        filtrosEl.scrollTo({ left: Math.max(0, targetLeft), behavior: opts.smooth === false ? 'auto' : 'smooth' });
    }

    renderizadas = 0;
    contenedor.innerHTML = '';
    renderizarSiguienteLote();
    iniciarObserverCatalogo();
}

function construirFiltros() {
    if (!filtrosEl) return;
    const conteo = { Todos: todasLasObras.length };
    todasLasObras.forEach(o => {
        const g = grupoEstilo(o.estilo);
        conteo[g] = (conteo[g] || 0) + 1;
    });

    filtrosEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    GRUPOS_ORDEN.forEach(grupo => {
        const total = conteo[grupo] || 0;
        if (grupo !== 'Todos' && total === 0) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filtro-btn' + (grupo === filtroActivo ? ' activo' : '');
        btn.dataset.filtro = grupo;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', grupo === filtroActivo ? 'true' : 'false');
        btn.textContent = grupo;
        btn.addEventListener('click', () => aplicarFiltro(grupo, { centrarChip: true, smooth: true }));
        frag.appendChild(btn);
    });
    filtrosEl.appendChild(frag);
}

async function cargar() {
    estadoEl.textContent = 'Cargando obras...';
    try {
        if (Array.isArray(window.__DEMO_CATALOGO__)) {
            todasLasObras = window.__DEMO_CATALOGO__;
        } else {
            const res = await fetch('/catalogo/catalogo.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            todasLasObras = await res.json();
        }

        construirFiltros();
        aplicarFiltro('Todos');
    } catch (err) {
        estadoEl.innerHTML = `
            <div>No se pudo cargar el catálogo (${escapeHtml(err.message)}).</div>
            <button type="button" class="btn-reintentar" id="btn-reintentar-cat">Reintentar</button>
        `;
        const btnR = document.getElementById('btn-reintentar-cat');
        if (btnR) btnR.addEventListener('click', cargar);
    }
}

// ============================================================
// 4. SECCIÓN DISPONIBLES/CURADOS Y PRE-COTIZADOR WHATSAPP
// ============================================================
(function iniciarSeccionesConversion() {
    document.querySelectorAll('.spotlight-img').forEach(img => {
        const srcActual = img.getAttribute('src');
        if (window.__DEMO_IMGS__ && srcActual) {
            img.src = toThumbUrl(srcActual);
        }
        img.addEventListener('error', () => {
            if (!img.dataset.err && srcActual && !window.__DEMO_IMGS__) {
                img.dataset.err = '1';
                img.src = toHdUrl(srcActual);
            }
        });
    });

    const btnFlashHd = document.getElementById('btn-flash-hd');
    if (btnFlashHd) {
        btnFlashHd.addEventListener('click', () => {
            abrirVisor({
                titulo: 'Diseños Disponibles · Flash',
                estilo: 'Flash Disponible',
                imagen_url: '/catalogo/hd/Df-HVtgJeWA_2.webp',
                imagenes: ['/catalogo/hd/Df-HVtgJeWA_2.webp'],
                instagram_url: 'https://www.instagram.com/p/Df-HVtgJeWA/'
            }, 0, btnFlashHd);
        });
    }

    const btnFiltrarBw = document.getElementById('btn-filtrar-blackwork');
    if (btnFiltrarBw) {
        btnFiltrarBw.addEventListener('click', () => {
            aplicarFiltro('Blackwork', { centrarChip: true, smooth: false });
            const target = document.getElementById('filtros-estilo') || document.getElementById('catalogo');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    const formCotizar = document.getElementById('form-cotizar');
    const feedback = document.getElementById('cot-feedback');
    if (formCotizar && feedback) {
        formCotizar.addEventListener('submit', (e) => {
            e.preventDefault();
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            const nombre = document.getElementById('cot-nombre').value.trim();
            const estilo = document.getElementById('cot-estilo').value;
            const zona = document.getElementById('cot-zona').value.trim();
            const tamano = document.getElementById('cot-tamano').value.trim();
            const idea = document.getElementById('cot-idea').value.trim();

            const lineas = [
                'Hola Preto Leone, quiero cotizar un tatuaje:',
                `Nombre: ${nombre}`,
                `Estilo: ${estilo}`,
                `Zona del cuerpo: ${zona}`,
                `Tamaño aproximado: ${tamano}`,
                `Idea / referencia: ${idea || 'Por definir con el artista'}`
            ];
            const urlWa = `https://wa.me/18492506008?text=${encodeURIComponent(lineas.join('\n'))}`;

            window.open(urlWa, '_blank', 'noopener,noreferrer');
            feedback.innerHTML = `
                Cotización lista para WhatsApp.<br>
                <a href="${escapeHtml(urlWa)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp manualmente ↗</a>
            `;
        });
    }
})();

cargar();
