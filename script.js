// Matter.js aliases
const Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Events = Matter.Events,
    Vector = Matter.Vector,
    Common = Matter.Common,
    MouseConstraint = Matter.MouseConstraint,
    Mouse = Matter.Mouse,
    Body = Matter.Body;

// Configuration
const CONFIG = {
    initialBeadCount: 15,
    wallThickness: 100,
    gemColors: [
        'rgba(255, 0, 0, 0.7)',    // Red
        'rgba(0, 255, 0, 0.7)',    // Green
        'rgba(0, 0, 255, 0.7)',    // Blue
        'rgba(255, 255, 0, 0.7)',  // Yellow
        'rgba(0, 255, 255, 0.7)',  // Cyan
        'rgba(255, 0, 255, 0.7)',  // Magenta
    ],
    supplyBoxHeight: 180,
    slotCountCols: 6,
    slotRows: 2,
    particleCount: 50
};

// --- Global State & Modes ---
let currentMode = 'physics'; // 'physics', 'audio', 'fractal'
let isSensorActive = false;
let isAutoRotating = true;
let autoRotateAngle = 0;

// --- Ends Global State ---

// --- Particles System ---
const particles = [];
function spawnParticle(x, y, color) {
    if (particles.length > CONFIG.particleCount) particles.shift();
    particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 1.0,
        color: color,
        isRising: false // Default
    });
}
function spawnRisingParticle(x, y, color) {
    if (particles.length > CONFIG.particleCount * 2) particles.shift(); // Allow more for super
    particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 2,
        vy: -(Math.random() * 3 + 2), // Upward
        life: 1.0,
        color: color,
        isRising: true
    });
}

function updateDrawParticles(ctx) {
    ctx.globalCompositeOperation = 'screen';
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.isRising) {
            p.vy -= 0.1; // Accelerate up
            p.x += (Math.random() - 0.5) * 2; // Jitter
            p.life -= 0.05; // Fade faster
        } else {
            p.life -= 0.03;
        }

        if (p.life <= 0) {
            particles.splice(i, 1);
        } else {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.life * 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
}

// --- Helper: Complementary Color ---
function getComplementaryColor(rgbaStr) {
    const parts = rgbaStr.match(/[\d.]+/g);
    if (!parts || parts.length < 3) return 'rgba(255,255,255,1)';
    const r = 255 - parseInt(parts[0]);
    const g = 255 - parseInt(parts[1]);
    const b = 255 - parseInt(parts[2]);
    return `rgba(${r}, ${g}, ${b}, 1)`;
}

// Setup Canvas and Engine
const canvas = document.getElementById('kaleidoscope-canvas');
const engine = Engine.create();
let renderWidth = window.innerWidth;
let renderHeight = window.innerHeight;

// --- FIX: Create proper Render Controller ---
const renderController = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
        width: renderWidth,
        height: renderHeight,
        wireframes: false,
        background: 'transparent',
        showAngleIndicator: false
    }
});
// --------------------------------------------

// Physics Parameters
let gravityScale = 1;
let airFriction = 0.05;
let wallRestitution = 0.6;
let gemRestitution = 0.6;

let globalScale = 1.0;

// UI Listeners for Physics
const bindSlider = (id, targetVar, displayId, callback) => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (displayId) document.getElementById(displayId).textContent = val;
            if (callback) callback(val);
        });
    }
};

bindSlider('gravityControl', null, 'val-gravity', (v) => gravityScale = v);
bindSlider('scaleControl', null, 'val-scale', (v) => {
    const ratio = v / globalScale;
    globalScale = v;
    Composite.allBodies(engine.world).forEach(body => {
        if (!body.isStatic && body.label !== 'gem_supply') Body.scale(body, ratio, ratio);
    });
});
bindSlider('frictionControl', null, 'val-friction', (v) => {
    airFriction = v;
    Composite.allBodies(engine.world).forEach(body => { if (!body.isStatic) body.frictionAir = airFriction; });
});
bindSlider('restitutionControl', null, 'val-restitution', (v) => {
    wallRestitution = v;
    Composite.allBodies(engine.world).forEach(body => { if (body.label === 'wall') body.restitution = wallRestitution; });
});
bindSlider('gemRestitutionControl', null, 'val-gem-restitution', (v) => {
    gemRestitution = v;
    Composite.allBodies(engine.world).forEach(body => { if (!body.isStatic && body.label !== 'gem_supply') body.restitution = gemRestitution; });
});


// --- Fractal Mode Settings ---
let fractalZoomSpeed = 1.02;
let fractalQuality = 0.25;
let fractalType = 'mandelbrot';

bindSlider('zoomSpeedControl', null, 'val-zoom-speed', (v) => fractalZoomSpeed = v);
bindSlider('qualityControl', null, 'val-quality', (v) => fractalQuality = v);

const fracTypeEl = document.getElementById('fractalTypeControl');
if (fracTypeEl) {
    fracTypeEl.addEventListener('change', (e) => {
        fractalType = e.target.value;
        if (fractalType === 'mandelbrot') mandelbrotState.scale = 1.0;
    });
}

const autoRotateCheckbox = document.getElementById('autoRotateControl');
if (autoRotateCheckbox) {
    autoRotateCheckbox.addEventListener('change', (e) => {
        isAutoRotating = e.target.checked;
        isSensorActive = !isAutoRotating;
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo) debugInfo.style.display = isAutoRotating ? 'none' : 'block';
    });
}


// Resize
function resize() {
    renderWidth = window.innerWidth;
    renderHeight = window.innerHeight;
    canvas.width = renderWidth;
    canvas.height = renderHeight;

    // Update render controller options
    renderController.options.width = renderWidth;
    renderController.options.height = renderHeight;

    if (canvas) {
        // Also ensure canvas attributes align
        canvas.setAttribute('width', renderWidth);
        canvas.setAttribute('height', renderHeight);
    }
}
window.addEventListener('resize', resize);
resize();

// Boundaries
const boundaryRadius = Math.min(renderWidth, renderHeight) * 0.4;
const boundaryCenter = { x: renderWidth / 2, y: renderHeight * 0.4 };

function createWalls() {
    const walls = [];
    const wallCount = 32;
    const wallThickness = 50;

    for (let i = 0; i < wallCount; i++) {
        const angle = (i / wallCount) * Math.PI * 2;
        const segmentWidth = (2 * Math.PI * boundaryRadius) / wallCount;
        const x = boundaryCenter.x + Math.cos(angle) * (boundaryRadius + wallThickness / 2);
        const y = boundaryCenter.y + Math.sin(angle) * (boundaryRadius + wallThickness / 2);

        walls.push(Bodies.rectangle(x, y, segmentWidth * 1.2, wallThickness, {
            isStatic: true,
            angle: angle + Math.PI / 2,
            render: { visible: false },
            label: 'wall',
            friction: 0.5,
            restitution: wallRestitution
        }));
    }
    return walls;
}
Composite.add(engine.world, createWalls());

// Supply Slots
const supplySlots = [];
const slotBaseY = renderHeight - CONFIG.supplyBoxHeight + 20;
const slotWidth = renderWidth / CONFIG.slotCountCols;
const slotRowHeight = CONFIG.supplyBoxHeight / CONFIG.slotRows;

for (let row = 0; row < CONFIG.slotRows; row++) {
    for (let col = 0; col < CONFIG.slotCountCols; col++) {
        supplySlots.push({ x: (col + 0.5) * slotWidth, y: slotBaseY + (row * slotRowHeight), occupiedBy: null });
    }
}

// Generate Gemstones
function createGem(x, y, isStaticInBox = false) {
    const baseSize = 15 + Math.random() * 10;
    let size = baseSize * (isStaticInBox ? 1.0 : globalScale);

    const sides = Math.floor(3 + Math.random() * 5);
    let color = CONFIG.gemColors[Math.floor(Math.random() * CONFIG.gemColors.length)];

    const rand = Math.random();
    const isSuperRare = rand < 0.00025;
    const isEyeOnly = rand >= 0.00025 && rand < 0.00525;
    const isGlowingOnly = rand >= 0.00525 && rand < 0.05525;

    const isGlowing = isSuperRare || isGlowingOnly;
    const isEye = isSuperRare || isEyeOnly;

    let finalSize = size;
    if (isSuperRare) finalSize *= 2;

    if (isEyeOnly) {
        color = CONFIG.gemColors[Math.floor(Math.random() * CONFIG.gemColors.length)];
    }

    const plug = {};
    plug.color = color;
    plug.complementary = getComplementaryColor(color);

    if (isGlowing) plug.type = 'glowing';

    if (isEye) {
        if (!plug.type) plug.type = 'eye';
        if (isSuperRare) plug.type = 'super_eye';
        plug.eyeOffset = Math.random() * 1000;
        plug.blinkTimer = 0;
        plug.noiseOffset = Math.random() * 1000;
        const personalities = ['curious', 'shy', 'aggressive', 'lazy', 'hyper'];
        plug.personality = Common.choose(personalities);
        plug.emotion = 'normal';
        plug.stuckCounter = 0;
        plug.sleepCounter = 0;
        plug.emotionTimer = 0;
        plug.fascinatedTimer = 0;
        plug.cooldownTimer = 0;
        plug.isFascinated = false;
        plug.fascinatedTarget = null;
    } else if (!isGlowing) {
        plug.type = 'normal';
    }

    const bodyOptions = {
        friction: 0.005,
        restitution: gemRestitution,
        frictionAir: airFriction,
        render: {
            fillStyle: color,
            strokeStyle: 'white',
            lineWidth: isGlowing ? 4 : 2
        },
        label: 'gem',
        plugin: plug
    };

    const body = Bodies.polygon(x, y, sides, finalSize, bodyOptions);

    if (isGlowing || isEye) {
        Body.setDensity(body, body.density * 5);
    }

    if (isStaticInBox) {
        body.isStatic = true;
        body.label = 'gem_supply';
    }

    return body;
}

// Check Supply and Cleanup
function checkSupplyAndCleanup() {
    Composite.allBodies(engine.world).forEach(body => {
        if (body.isStatic) return;
        const distFromCenter = Vector.magnitude(Vector.sub(body.position, boundaryCenter));
        const isInSupplyZone = body.position.y > renderHeight - CONFIG.supplyBoxHeight - 50;
        if (distFromCenter > boundaryRadius * 1.5 && !isInSupplyZone) {
            if (body.position.x < -100 || body.position.x > renderWidth + 100 ||
                body.position.y < -100 || body.position.y > renderHeight + 100) {
                Composite.remove(engine.world, body);
            }
        }
    });

    supplySlots.forEach(slot => {
        if (slot.occupiedBy) {
            const body = slot.occupiedBy;
            const dist = Vector.magnitude(Vector.sub(body.position, { x: slot.x, y: slot.y }));
            if (dist > 40 || !body.isStatic) {
                if (body.label === 'gem_supply') {
                    if (!body.isStatic) {
                        body.label = 'gem';
                        Body.scale(body, globalScale, globalScale);
                    }
                }
                if (dist > 50) slot.occupiedBy = null;
            }
        }
        if (!slot.occupiedBy) {
            const newGem = createGem(slot.x, slot.y, true);
            Composite.add(engine.world, newGem);
            slot.occupiedBy = newGem;
        }
    });
}

// Collision Event
Events.on(engine, 'collisionStart', (event) => {
    const pairs = event.pairs;
    for (let i = 0; i < pairs.length; i++) {
        const bodyA = pairs[i].bodyA;
        const bodyB = pairs[i].bodyB;
        if (bodyA.isStatic || bodyB.isStatic) continue;
        if (bodyA.label === 'wall' || bodyB.label === 'wall') continue;

        const typeA = bodyA.plugin && (bodyA.plugin.type === 'eye' || bodyA.plugin.type === 'super_eye');
        const typeB = bodyB.plugin && (bodyB.plugin.type === 'eye' || bodyB.plugin.type === 'super_eye');
        if (!typeA && !typeB) continue;

        let eater = null;
        let eaten = null;
        if (typeA && !typeB && bodyA.plugin.color === bodyB.plugin.color) {
            eater = bodyA; eaten = bodyB;
        } else if (typeB && !typeA && bodyB.plugin.color === bodyA.plugin.color) {
            eater = bodyB; eaten = bodyA;
        }

        if (eater && eaten) {
            const areaEaten = eaten.area;
            const areaEater = eater.area;
            const growthFactor = Math.sqrt(1 + (areaEaten * 0.1) / areaEater);
            if (eater.area < 30000) {
                Body.scale(eater, growthFactor, growthFactor);
                eater.mass *= growthFactor;
            }
            spawnParticle(eaten.position.x, eaten.position.y, eaten.plugin.color);
            spawnParticle(eaten.position.x, eaten.position.y, 'white');
            Composite.remove(engine.world, eaten);
        }
    }
});

// Initial Objects
for (let i = 0; i < CONFIG.initialBeadCount; i++) {
    const gem = createGem(boundaryCenter.x + Common.random(-50, 50), boundaryCenter.y + Common.random(-50, 50), false);
    Composite.add(engine.world, gem);
}

// Gravity & Permission
const debugInfo = document.getElementById('debug-info');
function handleOrientation(event) {
    if (isAutoRotating) return;
    if (debugInfo) {
        if (event.alpha !== null) debugInfo.textContent = `a:${event.alpha.toFixed(1)} b:${event.beta.toFixed(1)} g:${event.gamma.toFixed(1)}`;
        debugInfo.style.display = 'block';
    }
    if (event.gamma === null || event.beta === null) return;
    isSensorActive = true;
    const rad = Math.PI / 180;
    const x = Math.sin(event.gamma * rad);
    const y = Math.sin(event.beta * rad);
    engine.world.gravity.x = x * gravityScale;
    engine.world.gravity.y = y * gravityScale;
}

const startButton = document.getElementById('startButton');
if (startButton) {
    startButton.addEventListener('click', async () => {
        if (!document.fullscreenElement) {
            try { await document.documentElement.requestFullscreen(); } catch (e) { }
        }
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                    document.getElementById('instruction-overlay').classList.add('hidden');
                } else {
                    alert('Permission denied (iOS).');
                }
            } catch (e) {
                console.error(e);
                alert('Error: ' + e);
            }
        } else {
            window.addEventListener('deviceorientation', handleOrientation);
            document.getElementById('instruction-overlay').classList.add('hidden');
        }
    });
}

// Mouse Gravity
if (!('ontouchstart' in window)) {
    document.addEventListener('mousemove', (e) => {
        if (e.buttons === 0 && !isAutoRotating && currentMode === 'physics') {
            engine.world.gravity.x = ((e.clientX - renderWidth / 2) / (renderWidth / 2)) * gravityScale;
            engine.world.gravity.y = ((e.clientY - renderHeight / 2) / (renderHeight / 2)) * gravityScale;
        }
    });
}

// Dragging
const mouse = Mouse.create(canvas);
const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: { stiffness: 0.2, render: { visible: false } }
});
Events.on(mouseConstraint, 'startdrag', (event) => {
    if (event.body.label === 'gem_supply') {
        Matter.Body.setStatic(event.body, false);
        event.body.label = 'gem_transition';
    }
    if (event.body.plugin) event.body.plugin.emotion = 'scared';
});
Events.on(mouseConstraint, 'enddrag', (event) => {
    if (event.body.plugin) event.body.plugin.emotion = 'normal';
});
Composite.add(engine.world, mouseConstraint);


// Noise function
function noise(t) {
    return Math.sin(t) + Math.sin(2.2 * t + 5.5) * 0.5 + Math.sin(1.2 * t + 3.0) * 0.2;
}

// ----------------------------------------------------------------------
// --- AUDIO ENGINE ---
// ----------------------------------------------------------------------
let audioContext = null;
let analyser = null;
let dataArray = null;
let isAudioInitialized = false;

async function setupAudio() {
    if (isAudioInitialized) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        isAudioInitialized = true;
    } catch (err) {
        console.error("Audio Setup Failed", err);
        alert("Microphone access needed for Audio Mode");
    }
}

// ----------------------------------------------------------------------
// --- RENDER MODES ---
// ----------------------------------------------------------------------

function drawPhysicsMode(timestamp, ctx) {
    checkSupplyAndCleanup();

    if (isAutoRotating) {
        const speedVar = Math.sin(timestamp * 0.001) * 0.005 + 0.01;
        autoRotateAngle += speedVar;
        const pulse = 1.0 + Math.sin(timestamp * 0.002) * 0.5;
        engine.world.gravity.x = Math.sin(autoRotateAngle) * gravityScale * pulse;
        engine.world.gravity.y = Math.cos(autoRotateAngle) * gravityScale * pulse;

        if (gravityScale > 0.1 && Math.random() < 0.05) {
            Composite.allBodies(engine.world).forEach(b => {
                if (!b.isStatic && Math.random() < 0.3) {
                    Body.applyForce(b, b.position, {
                        x: (Math.random() - 0.5) * 0.01 * b.mass * gravityScale,
                        y: (Math.random() - 0.5) * 0.01 * b.mass * gravityScale
                    });
                }
            });
        }
    }

    Engine.update(engine, 1000 / 60);

    const bodies = Composite.allBodies(engine.world);

    // AI Logic Loop
    bodies.forEach(b => {
        if (b.label === 'gem' || b.label === 'gem_transition') b.frictionAir = airFriction;

        // Skip AI if not Eye/SuperEye or if static
        if (!b.plugin || (b.plugin.type !== 'eye' && b.plugin.type !== 'super_eye') || b.isStatic || b.label === 'gem_supply') return;

        // Initialize missing props
        if (typeof b.plugin.stuckCounter === 'undefined') b.plugin.stuckCounter = 0;
        if (typeof b.plugin.fascinatedTimer === 'undefined') b.plugin.fascinatedTimer = 0;
        if (typeof b.plugin.cooldownTimer === 'undefined') b.plugin.cooldownTimer = 0;

        // Personality Multiplier
        let scanRangeMult = 1.0;
        if (b.plugin.personality === 'curious') scanRangeMult = 1.5;
        if (b.plugin.personality === 'shy') scanRangeMult = 0.8;
        if (b.plugin.personality === 'hyper') scanRangeMult = 1.2;

        const scanRange = 250 * globalScale * scanRangeMult;
        let nearestGlowing = null;
        let nearestDist = Infinity;
        let nearestOther = null;
        let nearestOtherDist = Infinity;

        // Neighbor Scan
        bodies.forEach(other => {
            if (b === other || other.isStatic || other.label === 'gem_supply') return;
            const dVector = Vector.sub(other.position, b.position);
            const dist = Vector.magnitude(dVector);
            if (dist < scanRange && other.plugin) {
                if (dist < nearestOtherDist) {
                    nearestOther = other;
                    nearestOtherDist = dist;
                }
                if ((other.plugin.type === 'glowing' || other.plugin.type === 'super_eye') && dist < nearestDist) {
                    nearestGlowing = other;
                    nearestDist = dist;
                }
                const dir = Vector.normalise(dVector);

                if (b.plugin.personality === 'shy' && dist < 120 * globalScale) {
                    Body.applyForce(b, b.position, Vector.mult(dir, -0.0005 * b.mass));
                } else if (b.plugin.personality === 'aggressive' && other.plugin.color !== b.plugin.color) {
                    Body.applyForce(b, b.position, Vector.mult(dir, 0.0005 * b.mass));
                }
                if (b.plugin.personality !== 'shy') {
                    if (other.plugin.color === b.plugin.color) {
                        Body.applyForce(b, b.position, Vector.mult(dir, 0.0003 * b.mass));
                    } else if (other.plugin.color === b.plugin.complementary) {
                        const forceMag = (dist - 90 * globalScale) * 0.00005 * b.mass;
                        const force = Vector.mult(dir, forceMag);
                        Body.applyForce(other, other.position, Vector.neg(force));
                        Body.applyForce(b, b.position, Vector.mult(force, 0.1));
                    }
                }
            }
        });

        // Fascination
        if (b.plugin.cooldownTimer > 0) {
            b.plugin.cooldownTimer--;
            b.plugin.isFascinated = false;
            b.plugin.fascinatedTarget = null;
        } else {
            let canBeFascinated = true;
            if (nearestGlowing && canBeFascinated) {
                b.plugin.isFascinated = true;
                b.plugin.fascinatedTarget = nearestGlowing;
                b.plugin.fascinatedTimer++;

                let boredomThreshold = 600;
                if (b.plugin.personality === 'curious') boredomThreshold = 900;
                if (b.plugin.personality === 'shy') boredomThreshold = 180;
                if (b.plugin.personality === 'aggressive') boredomThreshold = 120;
                if (b.plugin.personality === 'lazy') boredomThreshold = 300;
                if (b.plugin.personality === 'hyper') boredomThreshold = 180;

                if (b.plugin.fascinatedTimer > boredomThreshold) {
                    b.plugin.isFascinated = false;
                    b.plugin.fascinatedTarget = null;
                    b.plugin.cooldownTimer = 900;
                    b.plugin.fascinatedTimer = 0;
                    b.plugin.emotion = 'tired';
                    b.plugin.emotionTimer = 60;
                    Body.applyForce(b, b.position, { x: (Math.random() - 0.5) * 0.05 * b.mass, y: (Math.random() - 0.5) * 0.05 * b.mass });
                }
            } else {
                b.plugin.isFascinated = false;
                b.plugin.fascinatedTarget = null;
                b.plugin.fascinatedTimer = Math.max(0, b.plugin.fascinatedTimer - 1);
            }
        }

        // Stuck Check
        if (b.speed < 0.5) b.plugin.stuckCounter++;
        else b.plugin.stuckCounter = Math.max(0, b.plugin.stuckCounter - 1);

        if (b.plugin.emotion !== 'angry' && b.plugin.emotion !== 'tired' && b.plugin.emotion !== 'scared' && b.plugin.stuckCounter > 1000) {
            b.plugin.emotion = 'angry';
            b.plugin.emotionTimer = 180;
        }

        // Emotion Timer
        if (b.plugin.emotion === 'angry') {
            b.plugin.emotionTimer--;
            if (b.plugin.emotionTimer <= 0) { b.plugin.emotion = 'tired'; b.plugin.emotionTimer = 120; }
        } else if (b.plugin.emotion === 'tired') {
            b.plugin.emotionTimer--;
            if (b.plugin.emotionTimer <= 0) { b.plugin.emotion = 'normal'; b.plugin.stuckCounter = 0; }
        } else if (b.plugin.emotion === 'scared') {
            Body.applyForce(b, b.position, { x: (Math.random() - 0.5) * 0.01 * b.mass, y: (Math.random() - 0.5) * 0.01 * b.mass });
        }

        // Sleep
        let sleepChance = 0.0001;
        if (b.plugin.personality === 'lazy') sleepChance = 0.0005;
        if (b.plugin.personality === 'hyper') sleepChance = 0.00001;
        if (b.plugin.emotion === 'normal' && !b.plugin.isFascinated && Math.random() < sleepChance) {
            b.plugin.emotion = 'sleep';
            b.plugin.sleepCounter = 600;
        }
        if (b.plugin.emotion === 'sleep') {
            b.plugin.sleepCounter--;
            if (b.plugin.sleepCounter <= 0) b.plugin.emotion = 'normal';
        }

        // Action
        if (b.plugin.emotion === 'angry') {
            if (Math.random() < 0.1) {
                if (Math.random() < 0.3) spawnParticle(b.position.x, b.position.y, 'rgba(255,255,255,0.5)');
                Body.applyForce(b, b.position, { x: (Math.random() - 0.5) * 0.02, y: (Math.random() - 0.5) * 0.02 });
            }
        } else if (b.plugin.emotion === 'sleep') {
            // Do nothing
        } else {
            // Swim
            let targetAngle = 0;
            if (b.plugin.isFascinated && b.plugin.fascinatedTarget) {
                const d = Vector.sub(b.plugin.fascinatedTarget.position, b.position);
                const angleToTarget = Math.atan2(d.y, d.x);
                targetAngle = angleToTarget;
                if (Vector.magnitude(d) > 80 * globalScale) {
                    Body.applyForce(b, b.position, { x: Math.cos(targetAngle) * 0.0005 * b.mass, y: Math.sin(targetAngle) * 0.0005 * b.mass });
                }
            } else {
                targetAngle = noise(timestamp * 0.001 + b.plugin.noiseOffset) * Math.PI * 2;
            }

            const diff = targetAngle - b.angle;
            b.torque = diff * 0.0005 * b.mass * (b.plugin.type === 'super_eye' ? 5 : 1);

            const swimCycle = Math.sin(timestamp * 0.005 + b.plugin.noiseOffset);
            if (swimCycle > 0) {
                let kickStrength = 0.0003 * b.mass * (globalScale ** 1.5);
                if (b.plugin.personality === 'lazy') kickStrength *= 0.5;
                if (b.plugin.personality === 'hyper') kickStrength *= 1.5;
                Body.applyForce(b, b.position, { x: Math.cos(b.angle) * kickStrength, y: Math.sin(b.angle) * kickStrength });
            }
        }
    });

    // --- FIX: Use Render Controller ---
    Render.bodies(renderController, bodies, ctx);
    // ---------------------------------

    // Overlay
    bodies.forEach(b => {
        if (!b.render.visible) return;
        if (b.plugin && (b.plugin.type === 'glowing' || b.plugin.type === 'super_eye')) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = b.render.fillStyle;
            ctx.beginPath();
            ctx.arc(b.position.x, b.position.y, 20 * globalScale, 0, Math.PI * 2);
            ctx.fillStyle = b.render.fillStyle;
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
            if (Math.random() < 0.1) spawnParticle(b.position.x + (Math.random() - 0.5) * 20, b.position.y + (Math.random() - 0.5) * 20, 'white');
            if (b.plugin.type === 'super_eye' && Math.random() < 0.3) spawnRisingParticle(b.position.x, b.position.y, `hsl(${timestamp * 0.1 % 360}, 100%, 80%)`);
        }
        if (b.plugin && (b.plugin.type === 'eye' || b.plugin.type === 'super_eye')) {
            ctx.save();
            ctx.translate(b.position.x, b.position.y);
            ctx.rotate(b.angle);
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(10 * globalScale, 0, 8 * globalScale, 0, Math.PI * 2);
            ctx.arc(-10 * globalScale, 0, 8 * globalScale, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'black';
            let pupilX = 0;
            let pupilScale = 1.0;
            if (b.plugin.emotion === 'sleep') { pupilScale = 0.1; }
            else {
                b.plugin.blinkTimer--;
                if (b.plugin.blinkTimer <= 0) b.plugin.blinkTimer = Math.random() * 200 + 100;
                if (b.plugin.blinkTimer < 10) pupilScale = 0.1;
            }
            if (b.plugin.emotion === 'angry') { ctx.fillStyle = 'red'; pupilScale *= 0.8; }
            if (b.plugin.emotion === 'scared') { pupilScale *= 0.5; pupilX = (Math.random() - 0.5) * 5; }
            if (b.plugin.isFascinated) pupilScale *= 1.3;

            ctx.beginPath();
            ctx.arc(10 * globalScale + pupilX, 0, 4 * globalScale * pupilScale, 0, Math.PI * 2);
            ctx.arc(-10 * globalScale + pupilX, 0, 4 * globalScale * pupilScale, 0, Math.PI * 2);
            ctx.fill();
            if (b.plugin.emotion === 'sleep') { ctx.fillStyle = 'white'; ctx.font = '16px monospace'; ctx.fillText('Zzz', 0, -20); }
            if (b.plugin.isFascinated) { ctx.fillStyle = 'yellow'; ctx.font = 'bold 20px monospace'; ctx.fillText('!', 0, -25); }
            if (b.plugin.personality === 'curious' && Math.random() < 0.01) { ctx.fillStyle = 'cyan'; ctx.font = 'bold 16px monospace'; ctx.fillText('?', 0, -25); }
            ctx.restore();
        }
    });
    updateDrawParticles(ctx);
}

function drawAudioVisualizer(timestamp, ctx) {
    if (!isAudioInitialized) {
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = '20px monospace';
        ctx.fillText("Click 'Audio' to Initialize Microphone", renderWidth / 2, renderHeight / 2);
        return;
    }
    analyser.getByteFrequencyData(dataArray);
    const centerX = renderWidth / 2;
    const centerY = renderHeight / 2;
    const maxRadius = Math.min(renderWidth, renderHeight) * 0.4;
    const barCount = 100;
    const angleStep = (Math.PI * 2) / barCount;
    const bass = dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const pulse = bass / 255;
    const radiusStart = 60 * globalScale + (pulse * 20);
    const hueBase = (timestamp * 0.05) % 360;
    ctx.lineWidth = 4 * globalScale;
    ctx.lineCap = 'round';
    for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * (dataArray.length * 0.8));
        const value = dataArray[dataIndex];
        const barHeight = (value / 255) * (maxRadius - radiusStart) * globalScale;
        const angle = i * angleStep + (timestamp * 0.0005);
        ctx.strokeStyle = `hsl(${(hueBase + i) % 360}, 80%, 60%)`;
        const x1 = centerX + Math.cos(angle) * radiusStart;
        const y1 = centerY + Math.sin(angle) * radiusStart;
        const x2 = centerX + Math.cos(angle) * (radiusStart + barHeight);
        const y2 = centerY + Math.sin(angle) * (radiusStart + barHeight);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    const centerRadius = (pulse * 50 * globalScale) + 10;
    ctx.fillStyle = `hsl(${hueBase}, 70%, 80%)`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 - pulse * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius + 20 + pulse * 50, 0, Math.PI * 2);
    ctx.stroke();
    const treble = dataArray.slice(150, 250).reduce((a, b) => a + b, 0) / 100;
    if (treble > 100 && Math.random() < 0.4) {
        spawnParticle(centerX + (Math.random() - 0.5) * 200, centerY + (Math.random() - 0.5) * 200, `hsl(${Math.random() * 360}, 100%, 80%)`);
    }
    updateDrawParticles(ctx);
}

// --- MANDELBROT / JULIA ZOOM MODE ---
let mandelbrotState = {
    cx: -0.743643887037151,
    cy: 0.131825904205330,
    scale: 1.0,
    baseMaxIter: 64
};
let juliaState = {
    cx: -0.7,
    cy: 0.27015,
    angle: 0
};
let fracCanvas = document.createElement('canvas'); // Safe?
let fracCtx = fracCanvas.getContext('2d'); // Safe?
let fracWidth = 0;
let fracHeight = 0;

function drawFractal(timestamp, ctx) {
    const quality = fractalQuality || 0.2;
    const w = Math.floor(renderWidth * quality);
    const h = Math.floor(renderHeight * quality);

    if (w < 1 || h < 1) return;

    if (fracWidth !== w || fracHeight !== h) {
        fracCanvas.width = w;
        fracCanvas.height = h;
        fracWidth = w;
        fracHeight = h;
    }

    if (fractalType === 'mandelbrot') {
        mandelbrotState.scale *= fractalZoomSpeed;
        if (mandelbrotState.scale > 1e14) mandelbrotState.scale = 1.0;
    } else {
        juliaState.angle += (fractalZoomSpeed - 1.0) * 0.5;
        juliaState.cx = 0.7885 * Math.cos(juliaState.angle);
        juliaState.cy = 0.7885 * Math.sin(juliaState.angle);
    }

    const scale = (fractalType === 'mandelbrot') ? (3.0 / mandelbrotState.scale) : 3.0;
    const centerX = (fractalType === 'mandelbrot') ? mandelbrotState.cx : 0;
    const centerY = (fractalType === 'mandelbrot') ? mandelbrotState.cy : 0;

    let maxIter = mandelbrotState.baseMaxIter;
    if (fractalType === 'mandelbrot') {
        const zoomLevel = Math.log10(mandelbrotState.scale);
        maxIter = Math.min(300, Math.floor(64 + 20 * zoomLevel));
    } else {
        maxIter = 128;
    }

    const imgData = fracCtx.createImageData(w, h);
    const data = imgData.data;

    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            const x0 = centerX + (px - w / 2) * scale / h;
            const y0 = centerY + (py - h / 2) * scale / h;
            let x = (fractalType === 'mandelbrot') ? 0 : x0;
            let y = (fractalType === 'mandelbrot') ? 0 : y0;
            const jcx = juliaState.cx;
            const jcy = juliaState.cy;
            const mcx = x0;
            const mcy = y0;
            let iter = 0;
            while (x * x + y * y <= 4 && iter < maxIter) {
                const xtemp = x * x - y * y + ((fractalType === 'mandelbrot') ? mcx : jcx);
                y = 2 * x * y + ((fractalType === 'mandelbrot') ? mcy : jcy);
                x = xtemp;
                iter++;
            }
            const pixelIndex = (py * w + px) * 4;
            if (iter === maxIter) {
                data[pixelIndex] = 0;
                data[pixelIndex + 1] = 0;
                data[pixelIndex + 2] = 0;
                data[pixelIndex + 3] = 255;
            } else {
                const colorShift = timestamp * 0.05;
                data[pixelIndex] = Math.sin(iter * 0.2 + colorShift) * 127 + 128; // R
                data[pixelIndex + 1] = Math.sin(iter * 0.2 + 2 + colorShift) * 127 + 128; // G
                data[pixelIndex + 2] = Math.sin(iter * 0.2 + 4 + colorShift) * 127 + 128; // B
                data[pixelIndex + 3] = 255;
            }
        }
    }
    fracCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fracCanvas, 0, 0, renderWidth, renderHeight);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '16px monospace';
    const txt = (fractalType === 'mandelbrot') ? `Zoom: ${mandelbrotState.scale.toExponential(2)}` : `Julia: ${juliaState.cx.toFixed(3)}`;
    ctx.fillText(txt, 20, renderHeight - 40);
}


function render() {
    const timestamp = Date.now();
    const ctx = canvas.getContext('2d');

    // Heartbeat: Small Green Square to prove render loop is alive
    ctx.fillStyle = 'lime';
    ctx.fillRect(0, 0, 5, 5);

    ctx.clearRect(0, 0, renderWidth, renderHeight);

    // Explicit error handling per mode
    if (currentMode === 'physics') {
        try {
            drawPhysicsMode(timestamp, ctx);
        } catch (e) {
            ctx.fillStyle = 'red';
            ctx.font = '16px monospace';
            ctx.fillText("Phys Crash: " + e.message, 20, 100);
            ctx.fillText(e.stack ? e.stack.substring(0, 50) : "No Stack", 20, 120);
            console.error(e);
        }
    } else if (currentMode === 'audio') {
        try {
            drawAudioVisualizer(timestamp, ctx);
        } catch (e) {
            ctx.fillStyle = 'red';
            ctx.font = '16px monospace';
            ctx.fillText("Audio Crash: " + e.message, 20, 100);
            console.error(e);
        }
    } else if (currentMode === 'fractal') {
        try {
            drawFractal(timestamp, ctx);
        } catch (e) {
            ctx.fillStyle = 'red';
            ctx.font = '16px monospace';
            ctx.fillText("Frac Crash: " + e.message, 20, 100);
            console.error(e);
        }
    }

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(render);
}

render();

// --- EXPORT FOR HTML BUTTONS ---
window.setMode = function (mode) {
    if (mode === currentMode) return;
    currentMode = mode;
    const fracBtn = document.getElementById('btn-fractal');
    if (fracBtn) fracBtn.textContent = 'Frac';

    if (mode === 'audio') setupAudio();

    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-' + mode).classList.add('active');

    const physSet = document.getElementById('physics-settings');
    const fracSet = document.getElementById('fractal-settings');

    if (mode === 'physics') {
        if (physSet) physSet.style.display = 'block';
        if (fracSet) fracSet.style.display = 'none';
    } else if (mode === 'fractal') {
        if (physSet) physSet.style.display = 'none';
        if (fracSet) fracSet.style.display = 'block';
    } else {
        if (physSet) physSet.style.display = 'none';
        if (fracSet) fracSet.style.display = 'none';
    }

    if (currentMode === 'fractal') {
        const fracBtn = document.getElementById('btn-fractal');
        if (fracBtn) fracBtn.textContent = 'Fractal';
    }
};

window.toggleAudio = function () {
    setupAudio();
};

window.addEventListener('keydown', (e) => {
    if (e.key === '1') window.setMode('physics');
    if (e.key === '2') window.setMode('audio');
    if (e.key === '3') window.setMode('fractal');
});
