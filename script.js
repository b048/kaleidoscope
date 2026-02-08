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

// Physics Parameters
let gravityScale = 1;
let airFriction = 0.05;
let wallRestitution = 0.6;
let gemRestitution = 0.6;

let globalScale = 1.0;

// UI Listeners for Physics
document.getElementById('gravityControl').addEventListener('input', (e) => {
    gravityScale = parseFloat(e.target.value);
    document.getElementById('val-gravity').textContent = gravityScale;
});
document.getElementById('frictionControl').addEventListener('input', (e) => {
    airFriction = parseFloat(e.target.value);
    document.getElementById('val-friction').textContent = airFriction;
    Composite.allBodies(engine.world).forEach(body => {
        if (!body.isStatic) body.frictionAir = airFriction;
    });
});
document.getElementById('restitutionControl').addEventListener('input', (e) => {
    wallRestitution = parseFloat(e.target.value);
    document.getElementById('val-restitution').textContent = wallRestitution;
    Composite.allBodies(engine.world).forEach(body => {
        if (body.label === 'wall') {
            body.restitution = wallRestitution;
        }
    });
});
document.getElementById('gemRestitutionControl').addEventListener('input', (e) => {
    gemRestitution = parseFloat(e.target.value);
    document.getElementById('val-gem-restitution').textContent = gemRestitution;
    Composite.allBodies(engine.world).forEach(body => {
        if (!body.isStatic && body.label !== 'gem_supply') {
            body.restitution = gemRestitution;
        }
    });
});

document.getElementById('scaleControl').addEventListener('input', (e) => {
    const newScale = parseFloat(e.target.value);
    document.getElementById('val-scale').textContent = newScale;
    const ratio = newScale / globalScale;
    globalScale = newScale;

    // Rescale all dynamic bodies
    Composite.allBodies(engine.world).forEach(body => {
        if (!body.isStatic && body.label !== 'gem_supply') {
            Body.scale(body, ratio, ratio);
        }
    });
});
// --- Fractal Mode Settings ---
document.getElementById('zoomSpeedControl').addEventListener('input', (e) => {
    fractalZoomSpeed = parseFloat(e.target.value);
    document.getElementById('val-zoom-speed').textContent = fractalZoomSpeed;
});
document.getElementById('qualityControl').addEventListener('input', (e) => {
    fractalQuality = parseFloat(e.target.value);
    document.getElementById('val-quality').textContent = fractalQuality;
});
document.getElementById('fractalTypeControl').addEventListener('change', (e) => {
    fractalType = e.target.value;
    // Reset zoom if switching back to Mandelbrot
    if (fractalType === 'mandelbrot') mandelbrotState.scale = 1.0;
});

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
// Reduced margin as requested - essentially just enough for the box
const safeBottomMargin = 0;
const slotBaseY = renderHeight - CONFIG.supplyBoxHeight + 20; // Slight offset
const slotWidth = renderWidth / CONFIG.slotCountCols;
const slotRowHeight = CONFIG.supplyBoxHeight / CONFIG.slotRows;

for (let row = 0; row < CONFIG.slotRows; row++) {
    for (let col = 0; col < CONFIG.slotCountCols; col++) {
        supplySlots.push({ x: (col + 0.5) * slotWidth, y: slotBaseY + (row * slotRowHeight), occupiedBy: null });
    }
}

// Generate Gemstones
function createGem(x, y, isStaticInBox = false) {
    const baseSize = 15 + Math.random() * 10; // 15-25
    let size = baseSize * (isStaticInBox ? 1.0 : globalScale);

    const sides = Math.floor(3 + Math.random() * 5); // 3-7
    let color = CONFIG.gemColors[Math.floor(Math.random() * CONFIG.gemColors.length)];

    // Strict Probabilities (User Request)
    // Both (Super Rare): 0.025% (0.00025)
    // Eye: 0.5% (0.005)
    // Glowing: 5.0% (0.05)

    const rand = Math.random();

    // Strict buckets
    const isSuperRare = rand < 0.00025;
    const isEyeOnly = rand >= 0.00025 && rand < 0.00525;
    const isGlowingOnly = rand >= 0.00525 && rand < 0.05525;

    const isGlowing = isSuperRare || isGlowingOnly;
    const isEye = isSuperRare || isEyeOnly;

    // Size Multiplier for Super Rare
    if (isSuperRare) {
        // We need to recalculate size or just multiply basic size?
        // Let's multiply the final size variable if possible, but 'const size' is already defined.
        // Since 'size' is const, we might need to change it to let or multiply in the Bodies.polygon call.
        // Better to change 'const size' to 'let size' or apply multiplier.
    }
    // Actually, 'size' is defined at the top of the function. I should insert this check earlier or adjust how bodies are created.
    // Let's maintain the strict structure. 

    // REDEFINITION FIX:
    // I will change 'const size' to 'let size' in the next block, but wait, I can just use a multiplier variable.
    let finalSize = size;
    if (isSuperRare) finalSize *= 2;

    // Eye colors
    if (isEyeOnly) {
        color = CONFIG.gemColors[Math.floor(Math.random() * CONFIG.gemColors.length)];
    }
    // REMOVED: Super Rare Gold Override. Now uses random color + gold aura.

    const plug = {};
    plug.color = color;
    plug.complementary = getComplementaryColor(color);

    if (isGlowing) {
        plug.type = 'glowing';
    }

    if (isEye) {
        if (!plug.type) plug.type = 'eye';
        if (isSuperRare) plug.type = 'super_eye';

        plug.eyeOffset = Math.random() * 1000;
        plug.blinkTimer = 0;
        plug.noiseOffset = Math.random() * 1000;

        // Personality
        const personalities = ['curious', 'shy', 'aggressive', 'lazy', 'hyper'];
        // Weights could be added, but equal chance is fine for now
        plug.personality = Common.choose(personalities);

        // State
        plug.emotion = 'normal';
        plug.stuckCounter = 0;
        plug.sleepCounter = 0;
        plug.emotionTimer = 0;

        // Fascination State
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
        Body.setDensity(body, body.density * 5); // Heavy (Glowing OR Eye)
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
        // Expanded supply zone check
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
                        // Apply global scale when leaving box
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

// Collision Event for Eating
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
            // Eat!
            // Grow Eater: 1/10th of eaten area
            const areaEaten = eaten.area;
            const areaEater = eater.area;
            const growthFactor = Math.sqrt(1 + (areaEaten * 0.1) / areaEater);

            // Limit max size
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
        if (event.alpha !== null) {
            debugInfo.textContent = `a:${event.alpha.toFixed(1)} b:${event.beta.toFixed(1)} g:${event.gamma.toFixed(1)}`;
        }
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

// Permission Request (iOS 13+)
const startButton = document.getElementById('startButton');
startButton.addEventListener('click', async () => {
    // Check for Secure Context
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        alert("Warning: Sensors might require HTTPS.");
    }

    // Fullscreen
    if (!document.fullscreenElement) {
        try {
            await document.documentElement.requestFullscreen();
        } catch (e) { console.log("Fullscreen denied", e); }
    }

    // iOS Permission
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
        // Non-iOS
        window.addEventListener('deviceorientation', handleOrientation);
        document.getElementById('instruction-overlay').classList.add('hidden');
    }
});


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
    // Scared when grabbed
    if (event.body.plugin) {
        event.body.plugin.emotion = 'scared';
    }
});
Events.on(mouseConstraint, 'enddrag', (event) => {
    // Return to normal if released
    if (event.body.plugin) {
        event.body.plugin.emotion = 'normal';
    }
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
        // Note: Do NOT connect to destination (speakers) to avoid feedback loop!

        isAudioInitialized = true;
        console.log("Audio Initialized");
    } catch (err) {
        console.error("Audio Setup Failed", err);
        alert("Microphone access needed for Audio Mode");
    }
}

// ----------------------------------------------------------------------
// --- RENDER MODES ---
// ----------------------------------------------------------------------

function drawPhysicsMode(timestamp, ctx) {
    // 0. Supply Logic
    checkSupplyAndCleanup();

    // Auto Rotation Logic
    if (isAutoRotating) {
        const speedVar = Math.sin(timestamp * 0.001) * 0.005 + 0.01;
        autoRotateAngle += speedVar;
        const pulse = 1.0 + Math.sin(timestamp * 0.002) * 0.5;
        engine.world.gravity.x = Math.sin(autoRotateAngle) * gravityScale * pulse;
        engine.world.gravity.y = Math.cos(autoRotateAngle) * gravityScale * pulse;

        // Turbulence (Gated by Gravity Scale)
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

    // Update Logic & AI Behavior
    const bodies = Composite.allBodies(engine.world);

    bodies.forEach(b => {
        if (b.label === 'gem' || b.label === 'gem_transition') b.frictionAir = airFriction;

        // --- Eye Logic (Emotions & AI) ---
        if (b.plugin && (b.plugin.type === 'eye' || b.plugin.type === 'super_eye') && !b.isStatic && b.label !== 'gem_supply') {

            // Fix undefined checks
            if (typeof b.plugin.stuckCounter === 'undefined') b.plugin.stuckCounter = 0;
            if (typeof b.plugin.fascinatedTimer === 'undefined') b.plugin.fascinatedTimer = 0;
            if (typeof b.plugin.cooldownTimer === 'undefined') b.plugin.cooldownTimer = 0;

            // --- Personality Parameters ---
            let scanRangeMult = 1.0;
            if (b.plugin.personality === 'curious') scanRangeMult = 1.5;
            if (b.plugin.personality === 'shy') scanRangeMult = 0.8;
            if (b.plugin.personality === 'hyper') scanRangeMult = 1.2;

            // --- 1. AI: Scan Neighbors ---
            const scanRange = 250 * globalScale * scanRangeMult;
            let nearestGlowing = null;
            let nearestDist = Infinity;
            let nearestOther = null; // For Shy/Aggressive logic
            let nearestOtherDist = Infinity;

            bodies.forEach(other => {
                if (b === other || other.isStatic || other.label === 'gem_supply') return;

                const dVector = Vector.sub(other.position, b.position);
                const dist = Vector.magnitude(dVector);

                if (dist < scanRange && other.plugin) {
                    // Track nearest non-glowing for social logic
                    if (dist < nearestOtherDist) {
                        nearestOther = other;
                        nearestOtherDist = dist;
                    }

                    // Check for Fascination (Must be glowing type)
                    if ((other.plugin.type === 'glowing' || other.plugin.type === 'super_eye') && dist < nearestDist) {
                        nearestGlowing = other;
                        nearestDist = dist;
                    }

                    const dir = Vector.normalise(dVector);

                    // Social Forces based on Personality

                    // SHY: Avoid everyone
                    if (b.plugin.personality === 'shy' && dist < 120 * globalScale) {
                        const force = Vector.mult(dir, -0.0005 * b.mass); // Flee
                        Body.applyForce(b, b.position, force);
                    }

                    // AGGRESSIVE: Chase DIFFERENT color
                    else if (b.plugin.personality === 'aggressive' && other.plugin.color !== b.plugin.color) {
                        const force = Vector.mult(dir, 0.0005 * b.mass); // Chase
                        Body.applyForce(b, b.position, force);
                    }

                    // Standard behaviors (if not overridden by strong personality traits)
                    if (b.plugin.personality !== 'shy') {
                        // 1. Same Color -> Attract to Eat (Weak attraction)
                        if (other.plugin.color === b.plugin.color) {
                            const force = Vector.mult(dir, 0.0003 * b.mass);
                            Body.applyForce(b, b.position, force);
                        }
                        // 2. Complementary Color -> Place around self (Spring-like)
                        else if (other.plugin.color === b.plugin.complementary) {
                            const idealDist = 90 * globalScale;
                            const delta = dist - idealDist;
                            const forceMag = delta * 0.00005 * b.mass;
                            const force = Vector.mult(dir, forceMag);
                            Body.applyForce(other, other.position, Vector.neg(force));
                            Body.applyForce(b, b.position, Vector.mult(force, 0.1));
                        }
                    }
                }
            });

            // --- Fascination Logic & Boredom ---

            // Cooldown handling
            if (b.plugin.cooldownTimer > 0) {
                b.plugin.cooldownTimer--;
                b.plugin.isFascinated = false;
                b.plugin.fascinatedTarget = null;
            } else {
                // Check if we SHOULD get fascinated - ALL personalities can be fascinated now
                let canBeFascinated = true;

                if (nearestGlowing && canBeFascinated) {
                    b.plugin.isFascinated = true;
                    b.plugin.fascinatedTarget = nearestGlowing;
                    b.plugin.fascinatedTimer++; // Increment timer

                    // Boredom Threshold based on Personality
                    let boredomThreshold = 600; // Default 10s
                    if (b.plugin.personality === 'curious') boredomThreshold = 900; // 15s
                    if (b.plugin.personality === 'shy') boredomThreshold = 180; // 3s
                    if (b.plugin.personality === 'aggressive') boredomThreshold = 120; // 2s
                    if (b.plugin.personality === 'lazy') boredomThreshold = 300; // 5s
                    if (b.plugin.personality === 'hyper') boredomThreshold = 180; // 3s

                    if (b.plugin.fascinatedTimer > boredomThreshold) {
                        b.plugin.isFascinated = false;
                        b.plugin.fascinatedTarget = null;
                        b.plugin.cooldownTimer = 900; // 15s cooldown
                        b.plugin.fascinatedTimer = 0;

                        // Action on bored: Move away or switch action
                        b.plugin.emotion = 'tired';
                        b.plugin.emotionTimer = 60;
                        Body.applyForce(b, b.position, {
                            x: (Math.random() - 0.5) * 0.05 * b.mass,
                            y: (Math.random() - 0.5) * 0.05 * b.mass
                        });
                    }
                } else {
                    b.plugin.isFascinated = false;
                    b.plugin.fascinatedTarget = null;
                    b.plugin.fascinatedTimer = Math.max(0, b.plugin.fascinatedTimer - 1); // Decay
                }
            }


            // 1. Stuck Check -> Angular
            const speed = b.speed;
            if (speed < 0.5) {
                b.plugin.stuckCounter++;
            } else {
                b.plugin.stuckCounter = Math.max(0, b.plugin.stuckCounter - 1);
            }

            // Trigger Angry
            if (b.plugin.emotion !== 'angry' && b.plugin.emotion !== 'tired' && b.plugin.emotion !== 'scared' && b.plugin.stuckCounter > 1000) {
                b.plugin.emotion = 'angry';
                b.plugin.emotionTimer = 180; // 3s
            }

            // State Counters
            if (b.plugin.emotion === 'angry') {
                b.plugin.emotionTimer--;
                if (b.plugin.emotionTimer <= 0) {
                    b.plugin.emotion = 'tired';
                    b.plugin.emotionTimer = 120; // 2s
                }
            } else if (b.plugin.emotion === 'tired') {
                b.plugin.emotionTimer--;
                if (b.plugin.emotionTimer <= 0) {
                    b.plugin.emotion = 'normal';
                    b.plugin.stuckCounter = 0;
                }
            } else if (b.plugin.emotion === 'scared') {
                Body.applyForce(b, b.position, {
                    x: (Math.random() - 0.5) * 0.01 * b.mass,
                    y: (Math.random() - 0.5) * 0.01 * b.mass
                });
            }

            // 2. Sleep Logic
            // Lazy sleeps more
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

            // Action based on emotion
            if (b.plugin.emotion === 'angry') {
                if (Math.random() < 0.1) {
                    if (Math.random() < 0.3) spawnParticle(b.position.x, b.position.y, 'rgba(255,255,255,0.5)');
                    Composite.allBodies(engine.world).forEach(other => {
                        if (other !== b && !other.isStatic) {
                            const d = Vector.sub(other.position, b.position);
                            const dist = Vector.magnitude(d);
                            if (dist < 150) {
                                let force = Vector.normalise(d);
                                force = Vector.mult(force, 0.015);
                                Body.applyForce(other, other.position, force);
                            }
                        }
                    });
                    Body.applyForce(b, b.position, { x: (Math.random() - 0.5) * 0.02, y: (Math.random() - 0.5) * 0.02 });
                }
            } else if (b.plugin.emotion === 'sleep') {
                // Drift
            } else {
                // --- Organic Swim Logic ---
                let targetAngle = 0;

                // Fascination Override
                if (b.plugin.isFascinated && b.plugin.fascinatedTarget) {
                    const d = Vector.sub(b.plugin.fascinatedTarget.position, b.position);
                    const angleToTarget = Math.atan2(d.y, d.x);
                    targetAngle = angleToTarget;

                    // Stop if close
                    if (Vector.magnitude(d) > 80 * globalScale) {
                        const swimForce = 0.0005 * b.mass;
                        Body.applyForce(b, b.position, {
                            x: Math.cos(targetAngle) * swimForce,
                            y: Math.sin(targetAngle) * swimForce
                        });
                    }
                } else {
                    // Normal Swim
                    const noiseVal = noise(timestamp * 0.001 + b.plugin.noiseOffset);
                    targetAngle = noiseVal * Math.PI * 2;
                }

                const diff = targetAngle - b.angle;
                // Normalize angle diff
                // while (diff < -Math.PI) diff += Math.PI * 2;
                // while (diff > Math.PI) diff -= Math.PI * 2;

                b.torque = diff * 0.0005 * b.mass * (b.plugin.type === 'super_eye' ? 5 : 1);

                const swimCycle = Math.sin(timestamp * 0.005 + b.plugin.noiseOffset);
                if (swimCycle > 0) {
                    let kickStrength = 0.0003 * b.mass * (globalScale ** 1.5);

                    // Personality Speed Multipliers
                    if (b.plugin.personality === 'lazy') kickStrength *= 0.5;
                    if (b.plugin.personality === 'hyper') kickStrength *= 1.5;

                    Body.applyForce(b, b.position, {
                        x: Math.cos(b.angle) * kickStrength,
                        y: Math.sin(b.angle) * kickStrength
                    });
                }
            }

            // Drawing Eye
            // We use Matter.Render normally, but we can overlay extra details if needed.
            // Actually, for simplicity, we rely on standard renderer + color changes.
        }
    });

    // Render Logic
    Engine.update(engine, 1000 / 60);

    const renderOptions = {
        width: renderWidth,
        height: renderHeight,
        background: 'transparent',
        wireframes: false,
        showAngleIndicator: false
    };

    Render.bodies(engine, bodies, ctx);

    // Overlay Effects
    bodies.forEach(b => {
        if (!b.render.visible) return;

        // Glowing Aura
        if (b.plugin && (b.plugin.type === 'glowing' || b.plugin.type === 'super_eye')) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = b.render.fillStyle;
            ctx.beginPath();
            // Approximating polygon for glow
            ctx.arc(b.position.x, b.position.y, 20 * globalScale, 0, Math.PI * 2);
            ctx.fillStyle = b.render.fillStyle;
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;

            // Simple Sparkles
            if (Math.random() < 0.1) {
                spawnParticle(b.position.x + (Math.random() - 0.5) * 20, b.position.y + (Math.random() - 0.5) * 20, 'white');
            }

            // Super Eye: Rainbow Particles
            if (b.plugin.type === 'super_eye' && Math.random() < 0.3) {
                spawnRisingParticle(b.position.x, b.position.y, `hsl(${timestamp * 0.1 % 360}, 100%, 80%)`);
            }
        }

        // Eye Details
        if (b.plugin && (b.plugin.type === 'eye' || b.plugin.type === 'super_eye')) {
            ctx.save();
            ctx.translate(b.position.x, b.position.y);
            ctx.rotate(b.angle);

            // Eye White
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(10 * globalScale, 0, 8 * globalScale, 0, Math.PI * 2);
            ctx.arc(-10 * globalScale, 0, 8 * globalScale, 0, Math.PI * 2);
            ctx.fill();

            // Pupil
            ctx.fillStyle = 'black';

            let pupilX = 0;
            let pupilScale = 1.0;

            // Blink Logic
            if (b.plugin.emotion === 'sleep') {
                pupilScale = 0.1; // Closed
            } else {
                b.plugin.blinkTimer--;
                if (b.plugin.blinkTimer <= 0) {
                    b.plugin.blinkTimer = Math.random() * 200 + 100;
                }
                if (b.plugin.blinkTimer < 10) {
                    pupilScale = 0.1; // Blink
                }
            }

            if (b.plugin.emotion === 'angry') {
                ctx.fillStyle = 'red';
                pupilScale *= 0.8;
            }
            if (b.plugin.emotion === 'scared') {
                pupilScale *= 0.5;
                pupilX = (Math.random() - 0.5) * 5; // Shaking pupils
            }
            if (b.plugin.isFascinated) {
                pupilScale *= 1.3; // Dilated
                // ctx.fillStyle = '#FFD700'; // Gold pupils
            }

            ctx.beginPath();
            ctx.arc(10 * globalScale + pupilX, 0, 4 * globalScale * pupilScale, 0, Math.PI * 2);
            ctx.arc(-10 * globalScale + pupilX, 0, 4 * globalScale * pupilScale, 0, Math.PI * 2);
            ctx.fill();

            // Zzz for sleep
            if (b.plugin.emotion === 'sleep') {
                ctx.fillStyle = 'white';
                ctx.font = '16px monospace';
                ctx.fillText('Zzz', 0, -20);
            }
            // ! for Fascination
            if (b.plugin.isFascinated) {
                ctx.fillStyle = 'yellow';
                ctx.font = 'bold 20px monospace';
                ctx.fillText('!', 0, -25);
            }
            // ? for Curious
            if (b.plugin.personality === 'curious' && Math.random() < 0.01) {
                ctx.fillStyle = 'cyan';
                ctx.font = 'bold 16px monospace';
                ctx.fillText('?', 0, -25);
            }

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

    // 1. Bass Pulse in Center
    const bass = dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const pulse = bass / 255; // 0.0 - 1.0

    // Draw Bars
    const radiusStart = 60 * globalScale + (pulse * 20);

    const hueBase = (timestamp * 0.05) % 360;

    ctx.lineWidth = 4 * globalScale;
    ctx.lineCap = 'round';

    for (let i = 0; i < barCount; i++) {
        // Map bar index to frequency index
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

    // 2. Inner Circle (Bass)
    const centerRadius = (pulse * 50 * globalScale) + 10;
    ctx.fillStyle = `hsl(${hueBase}, 70%, 80%)`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Shockwave rings
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 - pulse * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius + 20 + pulse * 50, 0, Math.PI * 2);
    ctx.stroke();

    // Particles (Treble)
    const treble = dataArray.slice(150, 250).reduce((a, b) => a + b, 0) / 100;
    if (treble > 100 && Math.random() < 0.4) {
        spawnParticle(centerX + (Math.random() - 0.5) * 200, centerY + (Math.random() - 0.5) * 200, `hsl(${Math.random() * 360}, 100%, 80%)`);
    }
    updateDrawParticles(ctx);
}

// --- MANDELBROT / JULIA ZOOM MODE ---
let mandelbrotState = {
    // Deep Spiral Point (Scepter Valley)
    cx: -0.743643887037151,
    cy: 0.131825904205330,
    scale: 1.0,
    baseMaxIter: 64 // Reduced base for performance
};

// Julia Set Coords (Animated)
let juliaState = {
    cx: -0.7,
    cy: 0.27015,
    angle: 0
};

// Fractal Settings
let fractalZoomSpeed = 1.02;
let fractalQuality = 0.2; // Reduced default quality for safety
let fractalType = 'mandelbrot'; // 'mandelbrot' or 'julia'

// Offscreen buffer for performance
let fracCanvas = document.createElement('canvas');
let fracCtx = fracCanvas.getContext('2d');
let fracWidth = 0;
let fracHeight = 0;

function drawFractal(timestamp, ctx) {
    // 1. Settings from UI
    const quality = fractalQuality || 0.2; // Fallback
    const w = Math.floor(renderWidth * quality);
    const h = Math.floor(renderHeight * quality);

    if (w < 1 || h < 1) return; // Prevention

    if (fracWidth !== w || fracHeight !== h) {
        fracCanvas.width = w;
        fracCanvas.height = h;
        fracWidth = w;
        fracHeight = h;
    }

    // 2. Zoom Logic
    if (fractalType === 'mandelbrot') {
        mandelbrotState.scale *= fractalZoomSpeed;
        if (mandelbrotState.scale > 1e14) mandelbrotState.scale = 1.0; // Loop
    } else {
        // Julia doesn't zoom deep, it animates shape
        juliaState.angle += (fractalZoomSpeed - 1.0) * 0.5; // Rotate based on speed diff
        juliaState.cx = 0.7885 * Math.cos(juliaState.angle);
        juliaState.cy = 0.7885 * Math.sin(juliaState.angle);
    }

    // 3. Render Setup
    const scale = (fractalType === 'mandelbrot') ? (3.0 / mandelbrotState.scale) : 3.0;
    const centerX = (fractalType === 'mandelbrot') ? mandelbrotState.cx : 0;
    const centerY = (fractalType === 'mandelbrot') ? mandelbrotState.cy : 0;

    // Dynamic Iteration for Deep Zoom (Performance Capped)
    let maxIter = mandelbrotState.baseMaxIter;
    if (fractalType === 'mandelbrot') {
        const zoomLevel = Math.log10(mandelbrotState.scale);
        // Gentler curve: 64 + 20 * zoomLevel. Max ~350, not 800+
        maxIter = Math.min(300, Math.floor(64 + 20 * zoomLevel));
    } else {
        maxIter = 128; // Fixed for Julia
    }

    // 4. Pixel Loop
    const imgData = fracCtx.createImageData(w, h);
    const data = imgData.data;

    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            // Map pixel to complex plane
            const x0 = centerX + (px - w / 2) * scale / h;
            const y0 = centerY + (py - h / 2) * scale / h;

            let x = (fractalType === 'mandelbrot') ? 0 : x0;
            let y = (fractalType === 'mandelbrot') ? 0 : y0;

            // Julia constant C
            const jcx = juliaState.cx;
            const jcy = juliaState.cy;

            // Mandelbrot constant C is position (x0, y0)
            const mcx = x0;
            const mcy = y0;

            let iter = 0;
            while (x * x + y * y <= 4 && iter < maxIter) {
                const xtemp = x * x - y * y + ((fractalType === 'mandelbrot') ? mcx : jcx);
                y = 2 * x * y + ((fractalType === 'mandelbrot') ? mcy : jcy);
                x = xtemp;
                iter++;
            }

            // Color
            const pixelIndex = (py * w + px) * 4;
            if (iter === maxIter) {
                data[pixelIndex] = 0;
                data[pixelIndex + 1] = 0;
                data[pixelIndex + 2] = 0;
                data[pixelIndex + 3] = 255;
            } else {
                const colorShift = timestamp * 0.05;
                // Smooth coloring (optional, keep simple for speed first)
                data[pixelIndex] = Math.sin(iter * 0.2 + colorShift) * 127 + 128; // R
                data[pixelIndex + 1] = Math.sin(iter * 0.2 + 2 + colorShift) * 127 + 128; // G
                data[pixelIndex + 2] = Math.sin(iter * 0.2 + 4 + colorShift) * 127 + 128; // B
                data[pixelIndex + 3] = 255;
            }
        }
    }

    fracCtx.putImageData(imgData, 0, 0);

    // Upscale draw
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fracCanvas, 0, 0, renderWidth, renderHeight);

    // Info Overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '16px monospace';
    if (fractalType === 'mandelbrot') {
        ctx.fillText(`Zoom: ${mandelbrotState.scale.toExponential(2)} Iter: ${maxIter}`, 20, renderHeight - 40);
    } else {
        ctx.fillText(`Julia: ${juliaState.cx.toFixed(3)} + ${juliaState.cy.toFixed(3)}i`, 20, renderHeight - 40);
    }
}


function render() {
    const timestamp = Date.now();

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    try {
        if (currentMode === 'physics') {
            drawPhysicsMode(timestamp, ctx);
        } else if (currentMode === 'audio') {
            drawAudioVisualizer(timestamp, ctx);
        } else if (currentMode === 'fractal') {
            drawFractal(timestamp, ctx);
        }
    } catch (e) {
        console.error(e);
        ctx.fillStyle = 'red';
        ctx.font = '20px monospace';
        ctx.fillText(`Error: ${e.message}`, 50, 50);
        return; // Stop loop on error to prevent freeze
    }

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(render);
}

render();

// --- EXPORT FOR HTML BUTTONS ---
window.setMode = function (mode) {
    if (mode === currentMode) return; // Do nothing if same mode

    currentMode = mode;
    // Reset text if leaving mode
    const fracBtn = document.getElementById('btn-fractal');
    if (fracBtn) fracBtn.textContent = 'Frac';


    // Manage Engine State
    if (mode === 'physics') {
        // Resume physics if needed
    } else if (mode === 'audio') {
        setupAudio(); // Try initializing if not already
    }

    // Update Button Styles
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-' + mode).classList.add('active');

    // Toggle Settings Panels
    const physSet = document.getElementById('physics-settings');
    const fracSet = document.getElementById('fractal-settings');

    if (mode === 'physics') {
        if (physSet) physSet.style.display = 'block';
        if (fracSet) fracSet.style.display = 'none';
    } else if (mode === 'fractal') {
        if (physSet) physSet.style.display = 'none';
        if (fracSet) fracSet.style.display = 'block';
    } else {
        // Audio mode default (hide physics for now, could have audio settings later)
        if (physSet) physSet.style.display = 'none';
        if (fracSet) fracSet.style.display = 'none';
    }

    // Update button text immediately
    if (currentMode === 'fractal') {
        const fracBtn = document.getElementById('btn-fractal');
        if (fracBtn) fracBtn.textContent = 'Fractal';
    }
};

window.toggleAudio = function () {
    setupAudio();
};

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    if (e.key === '1') window.setMode('physics');
    if (e.key === '2') window.setMode('audio');
    if (e.key === '3') window.setMode('fractal');
});
