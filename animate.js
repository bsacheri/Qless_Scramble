// ==================== ANIMATE.JS ====================
// Animation sequences, debug controls, and sound engine for Q-Less Scramble
// This script runs after index.html's inline script, sharing its global scope.

// ==================== STATE ====================
let animCurrentIndex = -1;   // which animation just played (-1 = none)
let animLastTileSnapshot = null; // snapshot of tile positions before last animation
let debugRowVisible = false;

const ANIM_COUNT = 8;

// ==================== SOUND ENGINE ====================
// All sounds synthesized with Web Audio API — no external files needed.
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

function playTone(freq, type, duration, vol, startTime, ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
}

// Explosion/scatter sound: noise burst + descending tone
function soundScatterLaunch() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        // White noise burst
        const bufSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        source.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        source.start(now);
        // Descending sweep
        playTone(400, 'sawtooth', 0.4, 0.3, now, ctx);
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(300, now);
        osc2.frequency.exponentialRampToValueAtTime(60, now + 0.5);
        g2.gain.setValueAtTime(0.3, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc2.start(now); osc2.stop(now + 0.6);
    } catch(e) {}
}

// Short whoosh for individual tile departure
function soundWhoosh() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now); osc.stop(now + 0.3);
    } catch(e) {}
}

// Satisfying "all gone" completion chime
function soundComplete() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        [523, 659, 784].forEach((freq, i) => {
            playTone(freq, 'sine', 0.4, 0.2, now + i * 0.12, ctx);
        });
    } catch(e) {}
}

// Flash/pop for Load button
function soundPop() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        playTone(880, 'square', 0.08, 0.15, now, ctx);
    } catch(e) {}
}

// ==================== VIBRATION ====================
function vibrateOnce(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch(e) {}
}

// ==================== LONG PRESS ON TIMER ====================
(function setupLongPress() {
    const timerEl = document.getElementById('timer');
    let pressTimer = null;
    let pressing = false;
    const HOLD_MS = 800;

    function startPress(e) {
        pressing = true;
        timerEl.style.transition = 'transform 0.1s, color 0.1s';
        pressTimer = setTimeout(() => {
            if (!pressing) return;
            // Feedback: pop flash
            timerEl.style.color = '#ff4444';
            timerEl.style.transform = 'scale(1.25)';
            setTimeout(() => {
                timerEl.style.transform = 'scale(1)';
                timerEl.style.color = '#f1c40f';
            }, 200);
            vibrateOnce(60);
            showDebugRow();
        }, HOLD_MS);
    }

    function endPress() {
        pressing = false;
        clearTimeout(pressTimer);
        timerEl.style.transform = 'scale(1)';
    }

    // Scale down slightly while holding
    timerEl.addEventListener('mousedown', (e) => { timerEl.style.transform = 'scale(0.9)'; startPress(e); });
    timerEl.addEventListener('touchstart', (e) => { timerEl.style.transform = 'scale(0.9)'; startPress(e); e.preventDefault(); }, { passive: false });
    timerEl.addEventListener('mouseup', endPress);
    timerEl.addEventListener('mouseleave', endPress);
    timerEl.addEventListener('touchend', endPress);
    timerEl.addEventListener('touchcancel', endPress);
    timerEl.style.cursor = 'pointer';
    timerEl.style.userSelect = 'none';
})();

function showDebugRow() {
    const row = document.getElementById('debug-btn-row');
    if (row) {
        row.style.display = 'block';
        debugRowVisible = true;
    }
}

// Hide debug row when tab changes (hook into showTab)
const _origShowTab = window.showTab;
window.showTab = function(t) {
    _origShowTab(t);
    if (t !== 'play') {
        const row = document.getElementById('debug-btn-row');
        if (row) row.style.display = 'none';
        debugRowVisible = false;
    }
};

// Play a random animation when the Finish dialog closes under perfect conditions:
//   • game was finished (isGameLocked), not just a mid-game Check Words
//   • tile bank is empty (all 12 tiles placed)
//   • no invalid words and no disconnected-group warning
const _origCloseModal = window.closeModal;
window.closeModal = function() {
    _origCloseModal();

    // Only trigger on a completed (locked) game
    if (!window.isGameLocked) return;

    // All tiles must be on the board (bank empty)
    const bankTiles = document.getElementById('dice-bank').querySelectorAll('.die');
    if (bankTiles.length > 0) return;

    // lastResults must exist with no warnings and no invalid words
    if (!window.lastResults || !window.lastResults.words || !window.lastResults.words.length) return;
    if (window.lastResults.hasUnconnected) return;
    if (window.lastResults.words.some(w => !w.ok)) return;

    // Pick a random animation index, avoiding the one that just played
    let idx;
    do { idx = Math.floor(Math.random() * ANIM_COUNT); } while (ANIM_COUNT > 1 && idx === animCurrentIndex);
    animCurrentIndex = idx;
    runAnimation(idx);
};

// ==================== SNAPSHOT HELPERS ====================

// Get all tiles currently on the grid with their positions
function getGridTiles() {
    const tiles = [];
    document.querySelectorAll('.cell').forEach(cell => {
        const die = cell.querySelector('.die');
        if (die) {
            tiles.push({ cell, die, letter: cell.dataset.letter });
        }
    });
    return tiles;
}

// Check if grid is empty
function isBoardEmpty() {
    return getGridTiles().length === 0;
}

// Flash the Load button 3 times
function flashLoadButton() {
    const btn = document.getElementById('debug-load-btn');
    if (!btn) return;
    let count = 0;
    const interval = setInterval(() => {
        btn.style.background = count % 2 === 0 ? '#ff4444' : '#5d4e6d';
        count++;
        if (count >= 6) {
            clearInterval(interval);
            btn.style.background = '#5d4e6d';
        }
    }, 180);
    soundPop();
}

// After animation completes: clear the board and return tiles to bank
function clearBoardAfterAnimation() {
    clearGrid();
}

// Get bounding rect of the grid element for clipping animations
function getGridRect() {
    return document.getElementById('grid').getBoundingClientRect();
}

// ==================== DEBUG BUTTONS ====================

// LOAD: place all 12 tiles on the board in a simple crossword-like pattern
function animDebugLoad() {
    soundPop();
    clearGrid();

    const allDice = Array.from(document.getElementById('dice-bank').querySelectorAll('.die'));
    if (allDice.length === 0) { showToast('No tiles to load'); return; }

    const numWords = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
    const occupied = {}; // "r-c" -> true
    const placements = []; // unique cells in order placed
    const words = [];

    function isOccupied(r, c) {
        return r >= 0 && r < ROWS && c >= 0 && c < COLS && !!occupied[`${r}-${c}`];
    }
    function placeCell(r, c) {
        if (!occupied[`${r}-${c}`]) { occupied[`${r}-${c}`] = true; placements.push({ r, c }); }
    }

    // Word 1: horizontal, centered
    const midRow = Math.floor(ROWS / 2);
    const w1len = 4 + Math.floor(Math.random() * 3); // 4-6
    const w1startC = Math.max(1, Math.floor((COLS - w1len) / 2));
    const word1 = [];
    for (let c = w1startC; c < w1startC + w1len && c < COLS - 1; c++) {
        word1.push({ r: midRow, c });
        placeCell(midRow, c);
    }
    words.push({ cells: word1, dir: 'H' });

    // Grow each subsequent word perpendicular to a prior word, crossing at a shared cell
    function addCrossingWord(srcWord) {
        const newDir = srcWord.dir === 'H' ? 'V' : 'H';
        for (let attempt = 0; attempt < 30; attempt++) {
            const cross = srcWord.cells[Math.floor(Math.random() * srcWord.cells.length)];
            const cr = cross.r, cc = cross.c;
            const wlen = 3 + Math.floor(Math.random() * 3); // 3-5
            const crossPos = 1 + Math.floor(Math.random() * (wlen - 2)); // intersection not at ends
            const startR = newDir === 'V' ? cr - crossPos : cr;
            const startC = newDir === 'H' ? cc - crossPos : cc;

            let valid = true;
            const cells = [];
            for (let i = 0; i < wlen; i++) {
                const nr = newDir === 'V' ? startR + i : cr;
                const nc = newDir === 'H' ? startC + i : cc;
                if (nr < 1 || nr >= ROWS - 1 || nc < 1 || nc >= COLS - 1) { valid = false; break; }
                const isIntersection = (nr === cr && nc === cc);
                if (!isIntersection && isOccupied(nr, nc)) { valid = false; break; }
                cells.push({ r: nr, c: nc });
            }
            if (!valid) continue;

            const newTiles = cells.filter(cell => !occupied[`${cell.r}-${cell.c}`]).length;
            if (placements.length + newTiles > allDice.length) continue;

            cells.forEach(cell => placeCell(cell.r, cell.c));
            return { cells, dir: newDir };
        }
        return null;
    }

    for (let w = 1; w < numWords; w++) {
        // Try crossing from newest word, fall back to earlier ones
        let newWord = null;
        for (let i = words.length - 1; i >= 0 && !newWord; i--) {
            newWord = addCrossingWord(words[i]);
        }
        if (newWord) words.push(newWord);
        if (placements.length >= allDice.length) break;
    }

    // Place dice onto the calculated cell positions
    placements.forEach(({ r, c }, i) => {
        if (i >= allDice.length) return;
        const cell = document.getElementById(`c-${r}-${c}`);
        if (cell) { cell.appendChild(allDice[i]); cell.dataset.letter = allDice[i].dataset.letter; }
    });

    showToast(`Loaded — ${words.length} word${words.length > 1 ? 's' : ''}!`);
}

// NEXT: play the next animation in sequence
function animDebugNext() {
    if (isBoardEmpty()) { flashLoadButton(); return; }
    animCurrentIndex = (animCurrentIndex + 1) % ANIM_COUNT;
    runAnimation(animCurrentIndex);
}

// REPLAY: replay the last animation on current tile layout
function animDebugReplay() {
    if (isBoardEmpty()) { flashLoadButton(); return; }
    const idx = animCurrentIndex < 0 ? 0 : animCurrentIndex;
    runAnimation(idx);
}

// Dispatch to the right animation by index
function runAnimation(idx) {
    switch(idx) {
        case 0: animScatterExplosion(); break;
        case 1: animGravityDrop(); break;
        case 2: animVortexCollapse(); break;
        case 3: animCardFlipWave(); break;
        case 4: animMeltDrip(); break;
        case 5: animTypewriterDelete(); break;
        case 6: animStackDrop(); break;
        case 7: animSniperMode(); break;
        default: animScatterExplosion(); break;
    }
}

// ==================== ANIMATION 1: SCATTER EXPLOSION ====================
// Tiles launch in random directions from the grid, flying across the full screen.
// Sound: explosion burst on launch. Vibration: single pulse at start.
// Duration: ~1.5s

function animScatterExplosion() {
    const tiles = getGridTiles();
    if (tiles.length === 0) return;

    vibrateOnce(80);
    soundScatterLaunch();

    // Create a full-screen overlay for this animation
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9990;overflow:hidden;';
    document.body.appendChild(overlay);

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    tiles.forEach((tile, i) => {
        const rect = tile.die.getBoundingClientRect();

        // Clone the tile for animation
        const clone = tile.die.cloneNode(true);
        clone.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            margin: 0;
            pointer-events: none;
            z-index: 9991;
            transition: none;
        `;
        overlay.appendChild(clone);

        // Hide the original
        tile.die.style.visibility = 'hidden';

        // Random direction — bias toward edges of screen
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 0.7; // multiplier
        const targetDx = Math.cos(angle) * (vw * speed);
        const targetDy = Math.sin(angle) * (vh * speed);
        const delay = i * 30; // stagger slightly

        setTimeout(() => {
            soundWhoosh();
            clone.style.transition = 'transform 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 1.2s ease-in';
            clone.style.transform = `translate(${targetDx}px, ${targetDy}px) rotate(${(Math.random()-0.5)*720}deg) scale(0.3)`;
            clone.style.opacity = '0';
        }, delay);
    });

    // After all tiles have flown away, clean up and reset board
    const totalDuration = tiles.length * 30 + 1300;
    setTimeout(() => {
        soundComplete();
        overlay.remove();
        // Restore visibility before clearing (clearGrid moves them to bank)
        tiles.forEach(t => { if (t.die) t.die.style.visibility = ''; });
        clearBoardAfterAnimation();
    }, totalDuration);
}

// ==================== ANIMATION HELPERS ====================

// Create a fixed overlay div positioned over the grid
function createGridOverlay(overflow) {
    const ov = overflow || 'hidden';
    const gridRect = document.getElementById('grid').getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:' + gridRect.left + 'px;top:' + gridRect.top + 'px;width:' + gridRect.width + 'px;height:' + gridRect.height + 'px;overflow:' + ov + ';pointer-events:none;z-index:9990;';
    document.body.appendChild(overlay);
    return { overlay: overlay, gridRect: gridRect };
}

// Clone a tile into the overlay, positioned relative to the overlay origin
function cloneTileToOverlay(die, overlay, gridRect) {
    const rect = die.getBoundingClientRect();
    const clone = die.cloneNode(true);
    clone.style.cssText = 'position:absolute;left:' + (rect.left - gridRect.left) + 'px;top:' + (rect.top - gridRect.top) + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;margin:0;pointer-events:none;box-shadow:0 2px 0 #bdc3c7;';
    overlay.appendChild(clone);
    return clone;
}

// ==================== ADDITIONAL SOUNDS ====================

function soundGravityWind() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.35);
        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now); osc.stop(now + 0.5);
    } catch(e) {}
}

function soundToiletFlush() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const dur = 3.2;

        // === Rushing water: filtered white noise ===
        const bufSize = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        // Band-pass filter sweeps downward — water draining away
        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.frequency.setValueAtTime(1800, now);
        bpf.frequency.exponentialRampToValueAtTime(280, now + dur);
        bpf.Q.setValueAtTime(1.2, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0, now);
        noiseGain.gain.linearRampToValueAtTime(0.55, now + 0.25);  // rush in
        noiseGain.gain.setValueAtTime(0.55, now + dur - 0.8);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur); // fade out

        noise.connect(bpf); bpf.connect(noiseGain); noiseGain.connect(ctx.destination);
        noise.start(now);

        // === Gurgle: low oscillator with vibrato that descends ===
        const gurgle = ctx.createOscillator();
        const gurgleLFO = ctx.createOscillator();
        const gurgleLFOGain = ctx.createGain();
        const gurgleGain = ctx.createGain();

        gurgle.type = 'sine';
        gurgle.frequency.setValueAtTime(220, now);
        gurgle.frequency.exponentialRampToValueAtTime(55, now + dur);

        gurgleLFO.type = 'sine';
        gurgleLFO.frequency.setValueAtTime(7, now);
        gurgleLFO.frequency.linearRampToValueAtTime(18, now + dur * 0.7);
        gurgleLFO.frequency.linearRampToValueAtTime(4, now + dur);
        gurgleLFOGain.gain.setValueAtTime(55, now);

        gurgleGain.gain.setValueAtTime(0.0, now);
        gurgleGain.gain.linearRampToValueAtTime(0.18, now + 0.3);
        gurgleGain.gain.setValueAtTime(0.18, now + dur - 0.5);
        gurgleGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        gurgleLFO.connect(gurgleLFOGain); gurgleLFOGain.connect(gurgle.frequency);
        gurgle.connect(gurgleGain); gurgleGain.connect(ctx.destination);
        gurgle.start(now); gurgle.stop(now + dur);
        gurgleLFO.start(now); gurgleLFO.stop(now + dur);

        // === Final drain gurgle: quick descending pitch at the end ===
        const drain = ctx.createOscillator();
        const drainGain = ctx.createGain();
        drain.type = 'sine';
        drain.frequency.setValueAtTime(140, now + dur - 0.5);
        drain.frequency.exponentialRampToValueAtTime(20, now + dur);
        drainGain.gain.setValueAtTime(0.22, now + dur - 0.5);
        drainGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        drain.connect(drainGain); drainGain.connect(ctx.destination);
        drain.start(now + dur - 0.5); drain.stop(now + dur + 0.1);
    } catch(e) {}
}

function soundFlipThwip() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        playTone(600, 'square', 0.12, 0.1, now, ctx);
        playTone(300, 'sine',   0.10, 0.08, now + 0.06, ctx);
    } catch(e) {}
}

function soundMeltWobble() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(55, now + 1.3);
        lfo.frequency.setValueAtTime(6, now);
        lfoGain.gain.setValueAtTime(40, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        osc.start(now); osc.stop(now + 1.55);
        lfo.start(now); lfo.stop(now + 1.55);
    } catch(e) {}
}

function soundTypeClick() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        playTone(1100, 'square', 0.04, 0.12, now, ctx);
    } catch(e) {}
}

function soundSlideCollect() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.linearRampToValueAtTime(180, now + 0.55);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now); osc.stop(now + 0.65);
    } catch(e) {}
}

function soundThud() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        playTone(80, 'sine', 0.20, 0.25, now, ctx);
        playTone(55, 'sine', 0.15, 0.20, now + 0.02, ctx);
    } catch(e) {}
}

function soundTargetLock() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        playTone(880,  'square', 0.06, 0.12, now,       ctx);
        playTone(1320, 'square', 0.06, 0.12, now + 0.1, ctx);
    } catch(e) {}
}

function soundRicochet() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        // Classic descending ricochet: fast pitch sweep down with harmonics
        const freqs = [3200, 1800, 900, 480];
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = i % 2 === 0 ? 'sawtooth' : 'sine';
            const t0 = now + i * 0.04;
            osc.frequency.setValueAtTime(f, t0);
            osc.frequency.exponentialRampToValueAtTime(f * 0.12, t0 + 0.55);
            gain.gain.setValueAtTime(0.18, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
            osc.start(t0); osc.stop(t0 + 0.65);
        });
        // Metallic ping at the start
        const ping = ctx.createOscillator();
        const pingGain = ctx.createGain();
        ping.connect(pingGain); pingGain.connect(ctx.destination);
        ping.type = 'sine';
        ping.frequency.setValueAtTime(4200, now);
        pingGain.gain.setValueAtTime(0.22, now);
        pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        ping.start(now); ping.stop(now + 0.4);
    } catch(e) {}
}

function soundRicochet() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        // Classic descending ricochet: fast pitch sweep down with harmonics
        const freqs = [3200, 1800, 900, 480];
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = i % 2 === 0 ? 'sawtooth' : 'sine';
            const t0 = now + i * 0.04;
            osc.frequency.setValueAtTime(f, t0);
            osc.frequency.exponentialRampToValueAtTime(f * 0.12, t0 + 0.55);
            gain.gain.setValueAtTime(0.18, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
            osc.start(t0); osc.stop(t0 + 0.65);
        });
        // Metallic ping at the start
        const ping = ctx.createOscillator();
        const pingGain = ctx.createGain();
        ping.connect(pingGain); pingGain.connect(ctx.destination);
        ping.type = 'sine';
        ping.frequency.setValueAtTime(4200, now);
        pingGain.gain.setValueAtTime(0.22, now);
        pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        ping.start(now); ping.stop(now + 0.4);
    } catch(e) {}
}

function soundMiniExplosion() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const bufSize = Math.floor(ctx.sampleRate * 0.15);
        const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        source.connect(noiseGain); noiseGain.connect(ctx.destination);
        source.start(now);
        playTone(200, 'sawtooth', 0.2, 0.2, now, ctx);
    } catch(e) {}
}

// ==================== ANIMATION 2: GRAVITY DROP ====================
// Tiles fall straight down with random drift and rotation, clipped to grid.
// Sound: wind-up on launch, per-tile whoosh. Vibration: start.

function animGravityDrop() {
    const tiles = getGridTiles();
    if (!tiles.length) return;

    vibrateOnce(60);
    soundGravityWind();

    const { overlay, gridRect } = createGridOverlay('hidden');

    // Pre-capture rects and create clones before hiding originals
    const tileData = tiles.map(tile => {
        const rect = tile.die.getBoundingClientRect();
        const clone = cloneTileToOverlay(tile.die, overlay, gridRect);
        tile.die.style.visibility = 'hidden';
        const localTop = rect.top - gridRect.top;
        const fallDist = gridRect.height - localTop + 30;
        return { tile, clone, fallDist };
    });

    tileData.forEach((td, i) => {
        const delay = 40 + Math.random() * 380;
        const driftX = (Math.random() - 0.5) * 50;
        const rot = (Math.random() - 0.5) * 200;
        setTimeout(() => {
            soundWhoosh();
            td.clone.style.transition = 'transform 0.9s cubic-bezier(0.55, 0, 1, 0.45), opacity 0.4s ease-in 0.55s';
            td.clone.style.transform = 'translate(' + driftX + 'px, ' + td.fallDist + 'px) rotate(' + rot + 'deg)';
            td.clone.style.opacity = '0';
        }, delay);
    });

    setTimeout(() => {
        soundComplete();
        overlay.remove();
        tiles.forEach(t => { if (t.die) t.die.style.visibility = ''; });
        clearBoardAfterAnimation();
    }, 450 + 1050);
}

// ==================== ANIMATION 3: VORTEX COLLAPSE (TOILET FLUSH) ====================
// Tiles orbit the grid center in a clockwise spiral, shrinking as they drain away.
// Sound: toilet flush. No vibration.

function animVortexCollapse() {
    const tiles = getGridTiles();
    if (!tiles.length) return;

    soundToiletFlush();

    const { overlay, gridRect } = createGridOverlay('hidden');
    const centerX = gridRect.width / 2;
    const centerY = gridRect.height / 2;
    const DURATION = 3000; // ms — matches flush sound
    const startTime = performance.now();

    // Build per-tile state: starting polar coords relative to center
    const tileStates = tiles.map(tile => {
        const rect = tile.die.getBoundingClientRect();
        const tileCX = rect.left - gridRect.left + rect.width / 2;
        const tileCY = rect.top - gridRect.top + rect.height / 2;
        const dx = tileCX - centerX;
        const dy = tileCY - centerY;
        const radius = Math.sqrt(dx * dx + dy * dy) || 1;
        const angle = Math.atan2(dy, dx); // starting angle in radians
        const clone = cloneTileToOverlay(tile.die, overlay, gridRect);
        // Offset clone so its center is at the tile center
        clone.style.transformOrigin = 'center center';
        tile.die.style.visibility = 'hidden';
        // Spread tiles' drain-start times slightly so they don't all enter at once
        const startDelay = Math.random() * 0.2; // 0..0.2 fraction of duration
        return { clone, radius, angle, startDelay };
    });

    function tick(now) {
        const elapsed = now - startTime;
        let allDone = true;

        tileStates.forEach(ts => {
            // Normalised progress [0..1], delayed per tile
            const raw = (elapsed / DURATION - ts.startDelay) / (1 - ts.startDelay);
            const t = Math.max(0, Math.min(1, raw));

            if (t < 1) allDone = false;

            // Radius shrinks with easeIn cube — slow start, fast drain at the end
            const r = ts.radius * Math.pow(1 - t, 1.8);

            // Angular speed increases as radius shrinks (conservation-of-momentum feel)
            // Total orbits: ~2 full rotations
            const totalAngleSweep = Math.PI * 4; // 2 full CW rotations
            const angleT = 1 - Math.pow(1 - t, 2.2); // easeIn quad
            const a = ts.angle + totalAngleSweep * angleT;

            const x = centerX + Math.cos(a) * r - ts.clone.offsetWidth / 2;
            const y = centerY + Math.sin(a) * r - ts.clone.offsetHeight / 2;
            const scale = Math.max(0.02, 1 - t * 0.98);
            const opacity = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;

            ts.clone.style.transform = 'none'; // clear any prior CSS transition
            ts.clone.style.left = x + 'px';
            ts.clone.style.top  = y + 'px';
            ts.clone.style.transform = 'scale(' + scale + ')';
            ts.clone.style.opacity = opacity;
        });

        if (!allDone) {
            requestAnimationFrame(tick);
        } else {
            overlay.remove();
            tiles.forEach(t => { if (t.die) t.die.style.visibility = ''; });
            clearBoardAfterAnimation();
        }
    }

    requestAnimationFrame(tick);
}

// ==================== ANIMATION 4: CARD FLIP WAVE ====================
// A wave sweeps left-to-right: each column flips on the Y axis and vanishes.
// Sound: thwip per column. Vibration: at start.

function animCardFlipWave() {
    const tiles = getGridTiles();
    if (!tiles.length) return;

    vibrateOnce(50);

    const { overlay, gridRect } = createGridOverlay('hidden');

    // Group by column
    const byCol = {};
    tiles.forEach(tile => {
        const col = parseInt(tile.cell.id.split('-')[2]);
        if (!byCol[col]) byCol[col] = [];
        byCol[col].push(tile);
    });

    const cols = Object.keys(byCol).map(Number).sort((a, b) => a - b);

    cols.forEach((col, colIdx) => {
        const delay = colIdx * 200;
        byCol[col].forEach(tile => {
            const clone = cloneTileToOverlay(tile.die, overlay, gridRect);
            clone.style.transformOrigin = 'center center';
            tile.die.style.visibility = 'hidden';
            setTimeout(() => {
                soundFlipThwip();
                clone.style.transition = 'transform 0.3s ease-in, opacity 0.06s ease-in 0.26s';
                clone.style.transform = 'perspective(600px) rotateY(90deg) scaleX(0.4)';
                clone.style.opacity = '0';
            }, delay);
        });
    });

    const totalDuration = cols.length * 200 + 400;
    setTimeout(() => {
        soundComplete();
        overlay.remove();
        tiles.forEach(t => { if (t.die) t.die.style.visibility = ''; });
        clearBoardAfterAnimation();
    }, totalDuration);
}

// ==================== ANIMATION 5: MELT & DRIP ====================
// Tiles wobble and squish, then stretch tall and drip off the bottom of the grid.
// Sound: gooey low wobble. Vibration: brief pulse when the last tile drips away.

function animMeltDrip() {
    const tiles = getGridTiles();
    if (!tiles.length) return;

    soundMeltWobble();

    const { overlay, gridRect } = createGridOverlay('hidden');

    const tileData = tiles.map(tile => {
        const rect = tile.die.getBoundingClientRect();
        const clone = cloneTileToOverlay(tile.die, overlay, gridRect);
        tile.die.style.visibility = 'hidden';
        clone.style.transformOrigin = 'bottom center';
        const localTop = rect.top - gridRect.top;
        const fallDist = (gridRect.height - localTop + 20) / 2.5; // adjusted for scaleY
        return { tile, clone, fallDist };
    });

    // Phase 1: squish sideways (100–500ms), slight stagger per tile
    tileData.forEach((td, i) => {
        setTimeout(() => {
            td.clone.style.transition = 'transform 0.4s ease-in-out';
            td.clone.style.transform = 'scaleX(0.62) scaleY(1.4)';
        }, 100 + i * 25);
    });

    // Phase 2: stretch tall and drip off bottom (550ms+)
    tileData.forEach((td, i) => {
        setTimeout(() => {
            td.clone.style.transition = 'transform 0.95s cubic-bezier(0.4, 0, 1, 1), opacity 0.3s ease-in 0.65s';
            td.clone.style.transform = 'scaleX(0.28) scaleY(2.6) translateY(' + td.fallDist + 'px)';
            td.clone.style.opacity = '0';
        }, 560 + i * 35);
    });

    const totalDuration = 560 + tiles.length * 35 + 1000;
    setTimeout(() => {
        vibrateOnce(40);
        soundComplete();
        overlay.remove();
        tiles.forEach(t => { if (t.die) t.die.style.visibility = ''; });
        clearBoardAfterAnimation();
    }, totalDuration);
}

// ==================== ANIMATION 6: TYPEWRITER DELETE ====================
// Tiles pop out one-by-one in reading order (left→right, top→bottom).
// A green cursor flash highlights each tile just before it vanishes.
// Sound: keyboard click per tile.

function animTypewriterDelete() {
    const tiles = getGridTiles();
    if (!tiles.length) return;

    // Sort in reading order: row first, then column
    tiles.sort((a, b) => {
        const [, ar, ac] = a.cell.id.split('-').map(Number);
        const [, br, bc] = b.cell.id.split('-').map(Number);
        return ar !== br ? ar - br : ac - bc;
    });

    const { overlay, gridRect } = createGridOverlay('hidden');

    tiles.forEach((tile, i) => {
        const rect = tile.die.getBoundingClientRect();
        const clone = cloneTileToOverlay(tile.die, overlay, gridRect);
        clone.style.transformOrigin = 'center center';
        tile.die.style.visibility = 'hidden';
        const localX = rect.left - gridRect.left;
        const localY = rect.top - gridRect.top;
        const delay = i * 155;

        // Green cursor highlight just before pop
        const cursor = document.createElement('div');
        cursor.style.cssText = 'position:absolute;left:' + localX + 'px;top:' + localY + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;border:3px solid #4ecca3;border-radius:4px;pointer-events:none;box-sizing:border-box;opacity:0;';
        overlay.appendChild(cursor);

        setTimeout(() => { cursor.style.transition = 'opacity 0.08s'; cursor.style.opacity = '1'; }, Math.max(0, delay - 70));
        setTimeout(() => {
            soundTypeClick();
            cursor.style.opacity = '0';
            clone.style.transition = 'transform 0.16s ease-out, opacity 0.16s ease-out';
            clone.style.transform = 'scale(0)';
            clone.style.opacity = '0';
        }, delay);
    });

    const totalDuration = tiles.length * 155 + 300;
    setTimeout(() => {
        soundComplete();
        overlay.remove();
        tiles.forEach(t => { if (t.die) t.die.style.visibility = ''; });
        clearBoardAfterAnimation();
    }, totalDuration);
}

// ==================== ANIMATION 7: STACK & DROP ====================
// All tiles slide horizontally to a center column forming a stack,
// then the whole stack plummets off the bottom of the grid.
// Sound: slide → thud → whoosh. Vibration: at the thud.

function animStackDrop() {
    const tiles = getGridTiles();
    if (!tiles.length) return;

    soundSlideCollect();

    const { overlay, gridRect } = createGridOverlay('hidden');

    // Target x-position: column 4 cell left edge in overlay coords
    const targetCellEl = document.getElementById('c-0-4');
    const targetLocalX = targetCellEl
        ? targetCellEl.getBoundingClientRect().left - gridRect.left
        : gridRect.width / 2 - 17;

    const tileData = tiles.map(tile => {
        const rect = tile.die.getBoundingClientRect();
        const clone = cloneTileToOverlay(tile.die, overlay, gridRect);
        tile.die.style.visibility = 'hidden';
        const localX = rect.left - gridRect.left;
        const dx = targetLocalX - localX;
        return { tile, clone, dx };
    });

    // Phase 1: slide all tiles horizontally to the target column (0–620ms)
    tileData.forEach(td => {
        td.clone.style.transition = 'transform 0.58s cubic-bezier(0.4, 0, 0.2, 1)';
        td.clone.style.transform = 'translateX(' + td.dx + 'px)';
    });

    // Phase 2: stack plummets off the bottom (680ms+)
    setTimeout(() => {
        vibrateOnce(55);
        soundThud();
        const dropDist = gridRect.height + 80;
        setTimeout(() => soundWhoosh(), 120);
        tileData.forEach((td, i) => {
            setTimeout(() => {
                td.clone.style.transition = 'transform 0.68s cubic-bezier(0.55, 0, 1, 0.45), opacity 0.3s ease-in 0.38s';
                td.clone.style.transform = 'translateX(' + td.dx + 'px) translateY(' + dropDist + 'px)';
                td.clone.style.opacity = '0';
            }, i * 18);
        });
    }, 660);

    setTimeout(() => {
        soundComplete();
        overlay.remove();
        tiles.forEach(t => { if (t.die) t.die.style.visibility = ''; });
        clearBoardAfterAnimation();
    }, 660 + 800 + 200);
}

// ==================== ANIMATION 8: SNIPER MODE ====================
// A pulsing red crosshair appears on a random tile. Tap it to explode that tile.
// The target jumps to the next random tile until the board is empty.
// Sound: target-lock beep on each move, mini-explosion on each hit.
// Vibration: per hit.

let _sniperActive = false;
let _sniperTarget = null;
let _sniperOverlay = null;
let _sniperTiles = [];
let _sniperAllTiles = [];

function animSniperMode() {
    const tiles = getGridTiles();
    if (!tiles.length) return;

    _sniperActive = true;
    _sniperTiles = tiles.slice();
    _sniperAllTiles = tiles.slice();

    // Inject pulse keyframe once
    if (!document.getElementById('sniper-style')) {
        const style = document.createElement('style');
        style.id = 'sniper-style';
        style.textContent = '@keyframes sniperPulse { from { transform:scale(1); opacity:1; } to { transform:scale(1.18); opacity:0.65; } }';
        document.head.appendChild(style);
    }

    const { overlay } = createGridOverlay('hidden');
    overlay.style.pointerEvents = 'none';
    _sniperOverlay = overlay;

    sniperNextTarget();
}

function sniperNextTarget() {
    if (!_sniperTiles.length) {
        soundComplete();
        vibrateOnce(80);
        if (_sniperOverlay) { _sniperOverlay.remove(); _sniperOverlay = null; }
        _sniperActive = false;
        _sniperAllTiles.forEach(t => { if (t.die) t.die.style.visibility = ''; });
        _sniperAllTiles = [];
        clearBoardAfterAnimation();
        return;
    }

    const overlay = _sniperOverlay;
    const gridRect = document.getElementById('grid').getBoundingClientRect();

    // Remove previous target
    if (_sniperTarget) { _sniperTarget.remove(); _sniperTarget = null; }

    // Pick a random remaining tile
    const idx = Math.floor(Math.random() * _sniperTiles.length);
    const tile = _sniperTiles[idx];
    const rect = tile.die.getBoundingClientRect();
    const localX = rect.left - gridRect.left;
    const localY = rect.top - gridRect.top;

    soundTargetLock();

    // Build crosshair target div
    const w = rect.width, h = rect.height;
    const target = document.createElement('div');
    target.style.cssText = 'position:absolute;left:' + localX + 'px;top:' + localY + 'px;width:' + w + 'px;height:' + h + 'px;pointer-events:all;cursor:crosshair;z-index:9995;animation:sniperPulse 0.65s ease-in-out infinite alternate;';
    target.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 40 40" style="position:absolute;top:0;left:0;width:100%;height:100%;">' +
        '<circle cx="20" cy="20" r="18" fill="none" stroke="#ff2222" stroke-width="2.5"/>' +
        '<line x1="20" y1="1" x2="20" y2="13" stroke="#ff2222" stroke-width="2.5"/>' +
        '<line x1="20" y1="27" x2="20" y2="39" stroke="#ff2222" stroke-width="2.5"/>' +
        '<line x1="1" y1="20" x2="13" y2="20" stroke="#ff2222" stroke-width="2.5"/>' +
        '<line x1="27" y1="20" x2="39" y2="20" stroke="#ff2222" stroke-width="2.5"/>' +
        '<circle cx="20" cy="20" r="3.5" fill="#ff2222" opacity="0.8"/>' +
        '</svg>';

    overlay.appendChild(target);
    _sniperTarget = target;

    target.addEventListener('click', function onTargetClick() {
        const isLastTile = _sniperTiles.length === 1;
        vibrateOnce(55);
        soundMiniExplosion();
        if (isLastTile) soundRicochet();
        sniperBurst(rect, gridRect, overlay);
        tile.die.style.visibility = 'hidden';
        _sniperTiles.splice(idx, 1);
        setTimeout(sniperNextTarget, 380);
    }, { once: true });
}

function sniperBurst(rect, gridRect, overlay) {
    const cx = rect.left - gridRect.left + rect.width / 2;
    const cy = rect.top - gridRect.top + rect.height / 2;
    const colors = ['#ff4444', '#ff8800', '#ffcc00', '#ffffff', '#ff2266'];
    for (let p = 0; p < 12; p++) {
        const particle = document.createElement('div');
        const size = 3 + Math.random() * 6;
        particle.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + colors[Math.floor(Math.random() * colors.length)] + ';pointer-events:none;transform:translate(-50%,-50%);';
        overlay.appendChild(particle);
        const angle = Math.random() * Math.PI * 2;
        const dist = 15 + Math.random() * 35;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        setTimeout(() => {
            particle.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
            particle.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
            particle.style.opacity = '0';
        }, 10);
        setTimeout(() => particle.remove(), 480);
    }
}
