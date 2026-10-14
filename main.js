const HOVER_DELAY = 700;   // ms, bis Titel und Text erscheinen
const SPEED = 30;          // px pro Sekunde
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const container = document.getElementById('container');
const middle = document.getElementById('middle');
const info = document.getElementById('info');
const caption = document.getElementById('caption');
const captionCategory = document.getElementById('caption-category');
const captionTitle = document.getElementById('caption-title');
const captionText = document.getElementById('caption-text');

const NAME = middle.textContent;

// ---------- Info-Bereich ----------

middle.addEventListener('click', () => {
    const open = container.classList.toggle('open');
    middle.textContent = open ? 'X' : NAME;
    middle.setAttribute('aria-expanded', open);
    info.setAttribute('aria-hidden', !open);
});

// ---------- Spalten aufbauen ----------

function createItem(project) {
    const figure = document.createElement('figure');
    figure.className = 'item';
    const img = document.createElement('img');
    img.src = project.src;
    img.alt = project.title;
    img.decoding = 'async';
    figure.appendChild(img);
    figure.project = project;
    return figure;
}

function waitForImages(root) {
    return Promise.all(Array.from(root.querySelectorAll('img')).map(img =>
        img.complete ? null : new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        })
    ));
}

const columns = Array.from(document.querySelectorAll('.column')).map((el, index) => {
    // Zweite Spalte startet versetzt, damit nicht beide Spalten dasselbe zeigen
    const shift = Math.floor(PROJECTS.length / 2) * index;
    const list = PROJECTS.map((_, i) => PROJECTS[(i + shift) % PROJECTS.length]);
    return {
        el,
        track: el.querySelector('.track'),
        list,
        direction: Number(el.dataset.direction) || 1,
        offset: 0,
        speed: SPEED * (index === 0 ? 1 : 0.8),
        current: 0,
        setHeight: 0,
        hovered: false
    };
});

async function build(column) {
    const { el, track, list } = column;
    track.innerHTML = '';
    list.forEach(p => track.appendChild(createItem(p)));
    await waitForImages(track);

    if (reducedMotion) return;

    // Set so oft wiederholen, bis es höher als die Spalte ist
    let guard = 0;
    while (track.scrollHeight < el.clientHeight + 200 && guard++ < 20) {
        list.forEach(p => track.appendChild(createItem(p)));
    }
    await waitForImages(track);

    // Ganzes Set einmal klonen für nahtloses Endlos-Scrollen
    const originals = Array.from(track.children);
    originals.forEach(node => {
        const clone = node.cloneNode(true);
        clone.project = node.project;
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
    });
    column.setHeight = track.children[originals.length].offsetTop - track.children[0].offsetTop;
}

function buildAll() {
    return Promise.all(columns.map(build));
}

// ---------- Animation ----------

let last = performance.now();
function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    columns.forEach(c => {
        const target = c.hovered ? 0 : c.speed;
        c.current += (target - c.current) * Math.min(dt * 4, 1);
        if (!c.setHeight) return;
        c.offset += c.current * dt;
        const h = c.setHeight;
        const pos = (((c.offset * c.direction) % h) + h) % h;
        c.track.style.transform = `translate3d(0, ${-pos}px, 0)`;
    });
    requestAnimationFrame(tick);
}

// ---------- Hover-Beschriftung ----------

let hoverTimer = null;
let activeItem = null;
let mouseX = 0;
let mouseY = 0;

function positionCaption(x, y) {
    const pad = 16;
    const w = caption.offsetWidth;
    const h = caption.offsetHeight;
    let left = x + pad;
    let top = y + pad;
    if (left + w > window.innerWidth - pad) left = x - w - pad;
    if (top + h > window.innerHeight - pad) top = y - h - pad;
    left = Math.max(pad, left);
    top = Math.max(pad, top);
    caption.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

function showCaption(item) {
    const p = item.project;
    captionCategory.textContent = p.category || '';
    captionTitle.textContent = p.title || '';
    captionText.textContent = p.text || '';
    positionCaption(mouseX, mouseY);
    caption.classList.add('visible');
}

function hideCaption() {
    clearTimeout(hoverTimer);
    caption.classList.remove('visible');
    if (activeItem) activeItem.classList.remove('active');
    activeItem = null;
    columns.forEach(c => c.el.classList.remove('hovering'));
}

function setActive(item, column) {
    if (activeItem === item) return;
    hideCaption();
    activeItem = item;
    item.classList.add('active');
    hoverTimer = setTimeout(() => {
        column.el.classList.add('hovering');
        showCaption(item);
    }, HOVER_DELAY);
}

columns.forEach(column => {
    const { el } = column;

    el.addEventListener('pointerenter', e => {
        if (e.pointerType === 'mouse') column.hovered = true;
    });
    el.addEventListener('pointerleave', e => {
        if (e.pointerType !== 'mouse') return;
        column.hovered = false;
        hideCaption();
    });
    el.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        mouseX = e.clientX;
        mouseY = e.clientY;
        const item = e.target.closest('.item');
        if (item) setActive(item, column);
        if (caption.classList.contains('visible')) positionCaption(mouseX, mouseY);
    });

    // Touch: Antippen zeigt die Beschriftung, nochmal tippen schliesst sie
    el.addEventListener('click', e => {
        if (window.matchMedia('(hover: hover)').matches) return;
        const item = e.target.closest('.item');
        if (!item) return;
        if (activeItem === item) {
            hideCaption();
            column.hovered = false;
            return;
        }
        hideCaption();
        columns.forEach(c => (c.hovered = false));
        column.hovered = true;
        activeItem = item;
        item.classList.add('active');
        column.el.classList.add('hovering');
        mouseX = e.clientX;
        mouseY = e.clientY;
        showCaption(item);
    });
});

document.addEventListener('click', e => {
    if (window.matchMedia('(hover: hover)').matches) return;
    if (!e.target.closest('.column')) {
        hideCaption();
        columns.forEach(c => (c.hovered = false));
    }
});

// ---------- Start ----------

let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        hideCaption();
        buildAll();
    }, 250);
});

// Nach dem Öffnen/Schliessen der Info ändert sich die Spaltenbreite
container.addEventListener('transitionend', e => {
    if (e.target === info && e.propertyName === 'flex-basis') buildAll();
});

buildAll().then(() => {
    if (!reducedMotion) requestAnimationFrame(t => { last = t; tick(t); });
});
