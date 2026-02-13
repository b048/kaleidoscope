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
    initialBeadCount: 32,
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
// Kaleido Rotation State
const kaleidoState = {
    angle: 0,
    targetAngle: 0,
    isTurning: false,
    timer: 0,
    lastTime: 0
};

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
let rotationSpeedScale = 1.0;

let globalScale = 1.0;

// UI Listeners for Physics
const bindSlider = (id, targetVar, displayId, callback) => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (displayId) document.getElementById(displayId).textContent = val.toFixed(1);
            if (callback) callback(val);
        });
    }
};

bindSlider('gravityControl', null, 'val-gravity', (v) => gravityScale = v);
bindSlider('rotateSpeedControl', null, 'val-rotate-speed', (v) => rotationSpeedScale = v);
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
    // No render controller options update needed
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
            render: {
                visible: true, // Show collision detection (User Request)
                fillStyle: 'rgba(255, 255, 255, 0.1)',
                strokeStyle: 'rgba(255, 255, 255, 0.3)',
                lineWidth: 1
            },
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
    // Randomize size more (User Request) -> Reverted to smaller variation
    const baseSize = 15 + Math.random() * 10; // 15 to 25 range
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
            // Sleep check: Sleeping eyes cannot eat
            if (eater.plugin.emotion === 'sleep') return;

            // Eat!
            // Grow Eater: 50% of eaten area (User Request)
            const areaEaten = eaten.area;
            const areaEater = eater.area;
            const growthFactor = Math.sqrt(1 + (areaEaten * 0.5) / areaEater);

            // Limit max size
            if (eater.area < 50000) {
                Body.scale(eater, growthFactor, growthFactor);
                eater.mass *= growthFactor;
            }

            // Power-up: Eat Glowing -> Surprised + 1 min Glow
            if (eaten.plugin && eaten.plugin.type === 'glowing') {
                eater.plugin.emotion = 'surprised';
                eater.plugin.emotionTimer = 120; // 2 seconds surprise
                eater.plugin.glowTimer = 600; // 10 seconds glow
            }

            spawnParticle(eaten.position.x, eaten.position.y, eaten.plugin.color);
            spawnParticle(eaten.position.x, eaten.position.y, 'white');

            Composite.remove(engine.world, eaten);
        }
    }
});

// Physics Sub-modes
let physicsSubMode = 'gravity'; // 'gravity', 'float', 'eye'

function calculateInitialCount(densityScale = 0.5) {
    const cylinderArea = Math.PI * boundaryRadius * boundaryRadius;
    const avgGemRadius = 20;
    const avgGemArea = Math.PI * avgGemRadius * avgGemRadius;
    const targetCount = Math.floor((cylinderArea * densityScale) / avgGemArea);
    return Math.min(200, Math.max(5, targetCount)); // Clamp
}

function initPhysicsWorld() {
    // Clear existing non-static bodies (walls/supply box stay? No, walls stay, supply box slots need refresh)
    // Actually, simple way: remove all gems/eyes, keep walls.
    Composite.allBodies(engine.world).forEach(b => {
        if (b.label !== 'wall') Composite.remove(engine.world, b);
    });
    // Clear particles
    particles.length = 0;

    // Clear supply slots
    supplySlots.forEach(s => s.occupiedBy = null);

    // Settings based on Mode
    if (physicsSubMode === 'gravity') {
        gravityScale = 1.0;
        airFriction = 0.05;
        rotationSpeedScale = 1.0;
        wallRestitution = 0.6;
        gemRestitution = 0.6;
        isAutoRotating = true;
        CONFIG.initialBeadCount = calculateInitialCount(0.5); // Normal ~50%
    } else if (physicsSubMode === 'float') {
        gravityScale = 0;
        airFriction = 0; // Zero friction
        rotationSpeedScale = 0; // Stop rotation
        isAutoRotating = false; // Disable gravity rotation
        wallRestitution = 1.0;
        gemRestitution = 1.0;
        CONFIG.initialBeadCount = calculateInitialCount(0.125); // 1/8th of normal (User Request: "Halve again")
        CONFIG.initialBeadCount = calculateInitialCount(0.125); // 1/8th of normal (User Request: "Halve again")
    } else if (physicsSubMode === 'gyro') {
        gravityScale = 1.0;
        airFriction = 0.05;
        rotationSpeedScale = 1.0;
        wallRestitution = 0.6;
        gemRestitution = 0.6;
        isAutoRotating = false; // Manual Gravity (Gyro/Mouse)
        CONFIG.initialBeadCount = calculateInitialCount(0.5); // Standard/Medium count (Same as old Eye mode default?)
        // Let's use 0.5 (Half of Full) which is plenty.
    }

    // Update Sliders/Checkbox to match internal state
    const updateUI = (id, val, isCheckbox = false) => {
        const el = document.getElementById(id);
        if (el) {
            if (isCheckbox) {
                el.checked = val;
                el.dispatchEvent(new Event('change')); // Trigger listener
            } else {
                el.value = val;
                el.dispatchEvent(new Event('input')); // Trigger listener
            }
        }
    }

    updateUI('gravityControl', gravityScale);
    updateUI('frictionControl', airFriction);
    updateUI('restitutionControl', wallRestitution);
    updateUI('gemRestitutionControl', gemRestitution);
    updateUI('autoRotateControl', isAutoRotating, true);

    // Explicitly set global vars again just in case listeners are weird
    // (Listeners update globals, so dispatchEvent is enough, but purely being safe)
    // gravityScale, airFriction etc are updated by listeners.

    // Spawn Objects
    let eyeSpawned = false;
    for (let i = 0; i < CONFIG.initialBeadCount; i++) {
        const gem = createGem(boundaryCenter.x + Common.random(-50, 50), boundaryCenter.y + Common.random(-50, 50), false);

        // Eye Mode removed - No special enforcement needed for Gyro


        // Zero-G Specific Properties
        if (physicsSubMode === 'float') {
            gem.friction = 0;
            gem.frictionStatic = 0;
            gem.restitution = 1.0;
            Body.setVelocity(gem, {
                x: (Math.random() - 0.5) * 15,
                y: (Math.random() - 0.5) * 15
            });
        }

        Composite.add(engine.world, gem);
    }


}

// Global exposure
window.setPhysicsSubmode = function (mode) {
    physicsSubMode = mode;
    console.log("Switching to " + mode);
    initPhysicsWorld();

    // Update active button state
    document.querySelectorAll('.submode-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById('btn-mode-' + mode);
    if (btn) btn.classList.add('active');
};

// Initial Start
// initPhysicsWorld(); // Start logic calls this? Or just replace the loop.
// The code had a loop at line 412. I'll replace it with initPhysicsWorld() call.

initPhysicsWorld();

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
    const rawX = Math.sin(event.gamma * rad);
    const rawY = Math.sin(event.beta * rad);

    // Account for screen orientation
    const orientation = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
    const angle = orientation * rad;

    // Rotate vector by angle (screen rotation)
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Rotate (x, y) by angle
    const x = rawX * cos - rawY * sin;
    const y = rawX * sin + rawY * cos;

    // Move gravity assignment before debug update if needed, or just keep one.
    engine.world.gravity.x = x * gravityScale;
    engine.world.gravity.y = y * gravityScale;

    // Update Debug State
    debugState.alpha = (event.alpha || 0).toFixed(1);
    debugState.beta = (event.beta || 0).toFixed(1);
    debugState.gamma = (event.gamma || 0).toFixed(1);
}

// Debug State
const debugState = {
    visible: false,
    alpha: 0, beta: 0, gamma: 0,
    mouseX: 0, mouseY: 0
};

window.toggleDebug = function () {
    debugState.visible = !debugState.visible;
    const dbg = document.getElementById('debug-dashboard');
    if (dbg) {
        if (debugState.visible) dbg.classList.add('visible');
        else dbg.classList.remove('visible');
    }
};

// Sensor Initialization on First Interaction
const initSensors = async () => {
    if (!document.fullscreenElement) {
        try { await document.documentElement.requestFullscreen(); } catch (e) { }
    }

    // Orientation Permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
            }
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
    }

    // Motion Permission (Often same permission request covers both, but safe to check)
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const response = await DeviceMotionEvent.requestPermission();
            if (response === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
            }
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('devicemotion', handleMotion);
    }

    // Remove listeners after first successful triggering attempt
    window.removeEventListener('click', initSensors);
    window.removeEventListener('touchstart', initSensors);
};

// Shake Detection
let lastShakeTime = 0;
const SHAKE_THRESHOLD = 20; // m/s^2 (Gravity is ~9.8, so need strong shake)
const SHAKE_COOLDOWN = 300; // ms

function handleMotion(event) {
    if (!event.acceleration) return; // Need linear acceleration (without gravity preferably)

    // accelerationIncludingGravity is usually available. acceleration is sometimes null.
    // If acceleration is null, fallback to diff of includingGravity.
    // However, event.acceleration (without gravity) is best for shake.

    let acc = event.acceleration;
    if (!acc || acc.x === null) return; // Can't detect shake reliably without sensor

    const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);

    if (mag > SHAKE_THRESHOLD) {
        const now = Date.now();
        if (now - lastShakeTime > SHAKE_COOLDOWN) {
            lastShakeTime = now;
            applyShakeForce(acc.x, acc.y, acc.z);
        }
    }
}

function applyShakeForce(ax, ay, az) {
    if (currentMode !== 'physics') return;

    // Normalize shake vector to get direction
    const mag = Math.sqrt(ax * ax + ay * ay + az * az);
    if (mag === 0) return;

    const dirX = ax / mag;
    const dirY = ay / mag;
    // az is Z-axis (screen normal). We can use it to "pop" things?
    // Kaleid is 2D. We can just use X/Y or use Z to add randomness.

    const forceMagnitude = 0.05 * (mag / SHAKE_THRESHOLD); // Scale force by shake strength

    const bodies = Composite.allBodies(engine.world);
    for (let body of bodies) {
        if (!body.isStatic) {
            // Apply force in shake direction + random jitter
            // Matter.js Force application
            Body.applyForce(body, body.position, {
                x: (dirX + (Math.random() - 0.5)) * forceMagnitude * body.mass,
                y: (dirY + (Math.random() - 0.5)) * forceMagnitude * body.mass
            });
        }
    }
}

window.addEventListener('click', initSensors);
window.addEventListener('touchstart', initSensors);

// Track Mouse for Debug
document.addEventListener('mousemove', (e) => {
    debugState.mouseX = e.clientX;
    debugState.mouseY = e.clientY;
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

// Dragging & Eraser
const mouse = Mouse.create(canvas);
const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: { stiffness: 0.2, render: { visible: false } }
});

// Eraser State
let isEraserActive = false;
window.toggleEraser = function () {
    isEraserActive = !isEraserActive;
    const btn = document.getElementById('btn-eraser');
    if (btn) {
        if (isEraserActive) {
            btn.style.background = "cyan";
            btn.style.color = "black";
            btn.style.boxShadow = "0 0 15px cyan";
            btn.textContent = "Eraser Active";
        } else {
            btn.style.background = "rgba(0,0,0,0.3)";
            btn.style.color = "cyan";
            btn.style.boxShadow = "none";
            btn.textContent = "Eraser Mode";
        }
    }

    // Fix persistent scared state: Reset emotions when turning OFF
    if (!isEraserActive) {
        Composite.allBodies(engine.world).forEach(b => {
            if (b.plugin && b.plugin.emotion === 'scared') {
                b.plugin.emotion = 'normal';
            }
        });
    }
};

// Eraser Logic Function
// Eraser Logic Function
function handleEraser(x, y) {
    if (!isEraserActive) return;

    // Query bodies at cursor
    const bodies = Composite.allBodies(engine.world);
    const affected = Matter.Query.point(bodies, { x: x, y: y });

    affected.forEach(body => {
        // Allow erasing everything except walls
        if (body.label === 'wall') return;

        const isEye = body.plugin && (body.plugin.type === 'eye' || body.plugin.type === 'super_eye');

        // Check if it's in a supply slot (static)
        const slot = supplySlots.find(s => s.occupiedBy === body);

        // If it is in a supply slot -> ERASE IT (User Request: "Erase eyes in box")
        if (slot) {
            spawnParticle(body.position.x, body.position.y, body.render.fillStyle);
            Composite.remove(engine.world, body);
            slot.occupiedBy = null; // Respawn trigger
            return;
        }

        if (isEye) {
            // EYES (Active in field): Scared & Flee
            body.plugin.emotion = 'scared';
            body.plugin.emotionTimer = 60; // 1 sec scare

            // Flee Force
            const forceDir = Vector.sub(body.position, { x: x, y: y });
            const dist = Vector.magnitude(forceDir);
            if (dist > 0) {
                // Strong flee force
                const force = Vector.mult(Vector.normalise(forceDir), 0.05 * body.mass);
                Body.applyForce(body, body.position, force);
            }

        } else {
            // NORMAL GEMS: Delete
            spawnParticle(body.position.x, body.position.y, body.render.fillStyle);
            Composite.remove(engine.world, body);
        }
    });
}

// Intercept Mouse events for Eraser
Events.on(mouseConstraint, 'mousemove', (event) => {
    if (isEraserActive) {
        handleEraser(event.mouse.position.x, event.mouse.position.y);
    }
});

Events.on(mouseConstraint, 'startdrag', (event) => {
    if (isEraserActive) return; // Disable drag if eraser is on

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
    // 0. Supply Logic
    checkSupplyAndCleanup();

    // Zero-G Thermal Agitation (Keep things moving)
    if (physicsSubMode === 'float') {
        const bodies = Composite.allBodies(engine.world);
        bodies.forEach(body => {
            if (body.isStatic) return;
            // Prevent stalling
            if (body.speed < 1.0) {
                const force = 0.0005 * body.mass;
                Body.applyForce(body, body.position, {
                    x: (Math.random() - 0.5) * force,
                    y: (Math.random() - 0.5) * force
                });
            }
            // Ensure no friction/damping (in case it reset)
            body.friction = 0;
            body.frictionStatic = 0;
            body.frictionAir = 0;
            body.restitution = 1.0;
        });
    }

    // Auto Rotation Logic (Step-wise / "Kakukaku")
    if (isAutoRotating) {
        // Init time
        if (!kaleidoState.lastTime) kaleidoState.lastTime = timestamp;
        const dt = timestamp - kaleidoState.lastTime;
        kaleidoState.lastTime = timestamp;

        if (rotationSpeedScale > 0) {
            if (kaleidoState.isTurning) {
                // TURN PHASE
                const turnSpeed = 0.002 * dt * (1 + rotationSpeedScale * 0.5); // Turn speed varies slightly with slider

                // Move towards target
                if (kaleidoState.angle < kaleidoState.targetAngle) {
                    kaleidoState.angle += turnSpeed;
                    if (kaleidoState.angle >= kaleidoState.targetAngle) {
                        kaleidoState.angle = kaleidoState.targetAngle;
                        kaleidoState.isTurning = false;
                        kaleidoState.timer = 0; // Reset rest timer
                    }
                }
            } else {
                // REST PHASE
                kaleidoState.timer += dt;

                // Rest duration decreases as speed increases
                // Scale 0.1 -> 5000ms, Scale 5.0 -> 200ms
                const restDuration = 3000 / (rotationSpeedScale * 1.5 + 0.1);

                if (kaleidoState.timer > restDuration) {
                    kaleidoState.isTurning = true;
                    kaleidoState.targetAngle += Math.PI / 3; // Turn 60 degrees
                }
            }
        }

        const pulse = 1.0 + Math.sin(timestamp * 0.002) * 0.1; // Reduced pulse
        engine.world.gravity.x = Math.sin(kaleidoState.angle) * gravityScale * pulse;
        engine.world.gravity.y = Math.cos(kaleidoState.angle) * gravityScale * pulse;

        // Turbulence (Gated by Gravity Scale) - Only during turn? Or always?
        // Let's keep it but maybe enhance it during turn to shake things up
        if (kaleidoState.isTurning && gravityScale > 0.1 && Math.random() < 0.1) {
            Composite.allBodies(engine.world).forEach(b => {
                if (!b.isStatic && Math.random() < 0.3) {
                    Body.applyForce(b, b.position, {
                        x: (Math.random() - 0.5) * 0.02 * b.mass * gravityScale,
                        y: (Math.random() - 0.5) * 0.02 * b.mass * gravityScale
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


            // Glow Timer Logic
            if (b.plugin.glowTimer > 0) {
                b.plugin.glowTimer--;
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
            if (b.plugin.emotion === 'surprised') {
                b.plugin.emotionTimer--;
                if (b.plugin.emotionTimer <= 0) b.plugin.emotion = 'normal';
            } else if (b.plugin.emotion === 'angry') {
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
                b.plugin.emotionTimer--;
                if (b.plugin.emotionTimer <= 0) b.plugin.emotion = 'normal';

                const forceMag = 0.01 * b.mass;
                Body.applyForce(b, b.position, {
                    x: (Math.random() - 0.5) * forceMag,
                    y: (Math.random() - 0.5) * forceMag
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
            if (b.plugin.emotion === 'sleep') {
                // DO NOTHING (Strict Sleep)
                b.angularVelocity *= 0.9; // Slow rotation logic
            } else if (b.plugin.emotion === 'angry') {
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
            } else {
                // --- Organic Swim Logic ---
                let targetAngle = 0;

                if (b.plugin.isFascinated && b.plugin.fascinatedTarget) {
                    // Turn towards glowing object
                    const d = Vector.sub(b.plugin.fascinatedTarget.position, b.position);
                    targetAngle = Math.atan2(d.y, d.x);
                } else {
                    const t = (timestamp + b.plugin.noiseOffset) * 0.001;
                    const noiseAngle = noise(t) * Math.PI * 4;
                    targetAngle = noiseAngle;

                    const speed = Vector.magnitude(b.velocity);
                    if (speed > 0.1) {
                        targetAngle = Math.atan2(b.velocity.y, b.velocity.x);
                    }
                }

                let diff = targetAngle - b.angle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;

                b.torque = diff * 0.0005 * b.mass * (b.plugin.type === 'super_eye' ? 5 : 1);

                const swimCycle = Math.sin(timestamp * 0.005 + b.plugin.noiseOffset);
                if (swimCycle > 0) {
                    // Increased kick strength for freer movement (User Request) - Boosted significantly
                    let kickStrength = 0.0015 * b.mass * (globalScale ** 1.5); // 5x original

                    // Personality Speed Multipliers
                    if (b.plugin.personality === 'lazy') kickStrength *= 0.5;
                    if (b.plugin.personality === 'hyper') kickStrength *= 1.5;
                    if (b.plugin.personality === 'aggressive') kickStrength *= 1.2;

                    const moodMult = (b.plugin.emotion === 'tired' || b.plugin.emotion === 'scared') ? 0.3 : 1.0;

                    // Hyper jitters direction
                    if (b.plugin.personality === 'hyper' && Math.random() < 0.1) {
                        b.angle += (Math.random() - 0.5);
                    }

                    const force = {
                        x: Math.cos(b.angle) * kickStrength * moodMult,
                        y: Math.sin(b.angle) * kickStrength * moodMult
                    };
                    Body.applyForce(b, b.position, force);
                    b.torque += Math.sin(timestamp * 0.02) * 0.0001 * b.mass;
                }
            }
        }

        // Glow Particles & Power-up Aura
        if (b.plugin && (b.plugin.type === 'glowing' || b.plugin.type === 'super_eye' || b.plugin.glowTimer > 0) && !b.isStatic) {

            // Super Saiyan or Power-up Effect
            if (b.plugin.type === 'super_eye' || b.plugin.glowTimer > 0) {
                // Intense rising particles
                for (let i = 0; i < 3; i++) { // Multiple per frame
                    const hue = (timestamp * 0.5 + i * 30 + Math.random() * 60) % 360;
                    spawnRisingParticle(
                        b.position.x + (Math.random() - 0.5) * 80 * globalScale, // 2x Range
                        b.position.y + (Math.random() - 0.5) * 80 * globalScale,
                        `hsl(${hue}, 100%, 70%)` // Rainbow
                    );
                }
            } else {
                // Normal Glow
                if (Math.random() < 0.2) {
                    spawnParticle(
                        b.position.x + (Math.random() - 0.5) * 20,
                        b.position.y + (Math.random() - 0.5) * 20,
                        'rgba(255, 255, 255, 1)'
                    );
                }
            }
        }
    });

    Engine.update(engine, 1000 / 60);

    // Draw Boundary
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(boundaryCenter.x, boundaryCenter.y, boundaryRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw Supply Slots (Visual only)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    supplySlots.forEach(slot => {
        // Simple box representation
        const halfW = (renderWidth / CONFIG.slotCountCols) / 2 - 5;
        const halfH = (CONFIG.supplyBoxHeight / CONFIG.slotRows) / 2 - 5;
        ctx.strokeRect(slot.x - halfW, slot.y - halfH, halfW * 2, halfH * 2);
    });

    updateDrawParticles(ctx);
    ctx.globalCompositeOperation = 'screen';

    bodies.forEach(b => {
        if (b.label === 'wall') return;

        ctx.beginPath();
        const vertices = b.vertices;
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let j = 1; j < vertices.length; j += 1) {
            ctx.lineTo(vertices[j].x, vertices[j].y);
        }
        ctx.lineTo(vertices[0].x, vertices[0].y);
        ctx.closePath();

        // Color Logic with Emotion
        let fill = b.render.fillStyle;

        // Main Fill
        if (b.plugin && (b.plugin.type === 'eye' || b.plugin.type === 'super_eye')) {
            if (b.plugin.type === 'super_eye' || b.plugin.glowTimer > 0) {
                // AURA
                const hue = (timestamp * 0.2) % 360; // Slow rainbow cycle
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.shadowBlur = 40;
                ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
                ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${0.5 + Math.random() * 0.3})`;
                ctx.lineWidth = 10;
                ctx.stroke();
                ctx.restore();

                ctx.shadowBlur = 30;
                ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;

                // RAINBOW BODY Override
                ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
                ctx.shadowColor = '#FFD700'; // Gold
                ctx.strokeStyle = `rgba(255, 215, 0, ${0.5 + Math.random() * 0.3})`;
                ctx.lineWidth = 10;
                ctx.stroke();
                ctx.restore();

                ctx.shadowBlur = 30;
                ctx.shadowColor = 'gold';
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
        } else {
            if (b.plugin && b.plugin.type === 'glowing') {
                ctx.shadowBlur = 15;
                ctx.shadowColor = 'white';
                ctx.fillStyle = fill;
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = fill;
            }

            ctx.strokeStyle = b.render.strokeStyle || 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Inner Details (Complementary)
        if (b.plugin && (b.plugin.type === 'glowing' || b.plugin.type === 'super_eye')) {
            if (b.plugin.type !== 'super_eye' && b.plugin.emotion !== 'angry') {
                ctx.fillStyle = b.plugin.complementary;
                ctx.globalCompositeOperation = 'source-over';
                const center = b.position;
                const scale = 0.5;
                ctx.beginPath();
                ctx.moveTo(center.x + (vertices[0].x - center.x) * scale, center.y + (vertices[0].y - center.y) * scale);
                for (let j = 1; j < vertices.length; j++) {
                    ctx.lineTo(center.x + (vertices[j].x - center.x) * scale, center.y + (vertices[j].y - center.y) * scale);
                }
                ctx.closePath();
                ctx.fill();
                ctx.globalCompositeOperation = 'screen';
            }
        }

        // Eye Details
        if (b.plugin && (b.plugin.type === 'eye' || b.plugin.type === 'super_eye') && !b.isStatic && b.label !== 'gem_supply') {
            ctx.globalCompositeOperation = 'source-over';

            // Dynamic Size Calculation
            const bounds = b.bounds;
            const w = bounds.max.x - bounds.min.x;
            const h = bounds.max.y - bounds.min.y;
            const radius = Math.min(w, h) * 0.25; // 25% of body size (scales with growth)

            const center = b.position;

            if (b.plugin.emotion === 'sleep') {
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 3 * globalScale;
                ctx.beginPath();
                ctx.moveTo(center.x - radius, center.y);
                ctx.lineTo(center.x + radius, center.y);
                ctx.stroke();
            } else if (b.plugin.emotion === 'scared') {
                // Scared Face: Cyan tint, SINGLE trembling pupil (Cyclops)
                ctx.fillStyle = '#AFEEEE'; // PaleTurquoise (Darker than LightCyan)
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
                ctx.fill();

                // Trembling Pupil
                const trembleX = (Math.random() - 0.5) * 6 * globalScale;
                const trembleY = (Math.random() - 0.5) * 6 * globalScale;

                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.arc(center.x + trembleX, center.y + trembleY, radius * 0.4, 0, 2 * Math.PI); // Big dilated pupil
                ctx.fill();
            } else if (b.plugin.emotion === 'tired') {
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius, Math.PI, 0);
                ctx.fill();
                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.arc(center.x, center.y + radius * 0.3, radius * 0.4, 0, 2 * Math.PI);
                ctx.fill();
            } else if (b.plugin.emotion === 'surprised') {
                // Wide Open Eyes
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius * 1.8, 0, 2 * Math.PI); // Extra big
                ctx.fill();

                // Tiny pupils
                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius * 0.2, 0, 2 * Math.PI);
                ctx.fill();

                ctx.fillStyle = '#FF4500';
                ctx.font = `bold ${20 * globalScale}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('!?', center.x, center.y - 30 * globalScale);
            } else {
                let isBlinking = false;
                if (b.plugin.emotion === 'normal' && !b.plugin.isFascinated) {
                    const blinkCycle = (timestamp + b.plugin.noiseOffset) % 3000;
                    if (blinkCycle < 150) isBlinking = true;
                }

                if (isBlinking) {
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 3 * globalScale;
                    ctx.beginPath();
                    ctx.moveTo(center.x - radius, center.y);
                    ctx.lineTo(center.x + radius, center.y);
                    ctx.stroke();
                } else {
                    // Open Eye
                    ctx.fillStyle = 'white';
                    ctx.beginPath();
                    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
                    ctx.fill();

                    // Look Target Calculation
                    let targetLookX = 0, targetLookY = 0;

                    if (b.plugin.isFascinated && b.plugin.fascinatedTarget) {
                        const d = Vector.sub(b.plugin.fascinatedTarget.position, b.position);
                        const dist = Vector.magnitude(d);
                        const lookMag = Math.min(dist, 100) / 100; // Normalize gaze intensity by distance
                        const vNorm = Vector.normalise(d);
                        targetLookX = vNorm.x * (radius * 0.6) * lookMag;
                        targetLookY = vNorm.y * (radius * 0.6) * lookMag;
                    } else if (b.plugin.emotion === 'angry') {
                        targetLookX = (Math.random() - 0.5) * radius * 0.5;
                        targetLookY = (Math.random() - 0.5) * radius * 0.5;
                    } else {
                        const vel = b.velocity;
                        const speed = Vector.magnitude(vel);
                        if (speed > 0.5) {
                            const vNorm = Vector.normalise(vel);
                            targetLookX = vNorm.x * (radius * 0.5);
                            targetLookY = vNorm.y * (radius * 0.5);
                        } else {
                            const lookTime = (timestamp + b.plugin.eyeOffset) / 2000; // Slower idleness
                            targetLookX = Math.cos(lookTime) * (radius * 0.3);
                            targetLookY = Math.sin(lookTime) * (radius * 0.3);
                        }
                    }

                    // Smooth Pupil Movement (Lerp)
                    const lerpFactor = 0.15; // Smoothness
                    b.plugin.lookX = (b.plugin.lookX || 0) * (1 - lerpFactor) + targetLookX * lerpFactor;
                    b.plugin.lookY = (b.plugin.lookY || 0) * (1 - lerpFactor) + targetLookY * lerpFactor;

                    ctx.fillStyle = (b.plugin.type === 'super_eye') ? '#FF3333' : 'black'; // Red if super eye
                    ctx.beginPath();
                    ctx.arc(center.x + b.plugin.lookX, center.y + b.plugin.lookY, radius * 0.4, 0, 2 * Math.PI);
                    ctx.fill();

                    // Sparkle if fascinating
                    if (b.plugin.isFascinated) {
                        ctx.fillStyle = 'white';
                        const sparkleX = center.x + b.plugin.lookX - radius * 0.3;
                        const sparkleY = center.y + b.plugin.lookY - radius * 0.3;

                        const sparkleSize = radius * 0.5;
                        ctx.beginPath();
                        ctx.moveTo(sparkleX, sparkleY - sparkleSize);
                        ctx.lineTo(sparkleX + sparkleSize * 0.3, sparkleY);
                        ctx.lineTo(sparkleX, sparkleY + sparkleSize);
                        ctx.lineTo(sparkleX - sparkleSize * 0.3, sparkleY);
                        ctx.fill();

                        ctx.beginPath();
                        ctx.moveTo(sparkleX - sparkleSize, sparkleY);
                        ctx.lineTo(sparkleX, sparkleY - sparkleSize * 0.3);
                        ctx.lineTo(sparkleX + sparkleSize, sparkleY);
                        ctx.lineTo(sparkleX, sparkleY + sparkleSize * 0.3);
                        ctx.fill();
                    }

                    if (b.plugin.emotion === 'angry') {
                        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                        ctx.lineWidth = radius * 0.2;
                        // ... angry eyebrows ...
                        ctx.beginPath();
                        ctx.moveTo(center.x - radius, center.y - radius * 0.5);
                        ctx.lineTo(center.x + radius, center.y - radius * 0.5);
                        ctx.stroke();
                    }
                }
            }
            ctx.globalCompositeOperation = 'screen';
        }
    });
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
        // Significantly increase max iterations based on zoom to prevent black blobs at e6+
        maxIter = Math.min(2000, Math.floor(100 + 80 * zoomLevel));
    } else {
        maxIter = 128;
    }

    const imgData = fracCtx.createImageData(w, h);
    const data = imgData.data;

    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            // --- FOVEATED RENDERING OPTIMIZATION ---
            // Calculate distance from center (0.0 to 1.0 approx at edges)
            const dx = px - w / 2;
            const dy = py - h / 2;
            const distSq = (dx * dx + dy * dy);
            const maxDistSq = (w * w + h * h) * 0.25;
            const distRatio = distSq / maxDistSq;

            // Reduce iterations at edges to save performance (User Request: "High quality center, light outer")
            // Center = 100% maxIter, Edge = ~20% maxIter
            const currentPixelMaxIter = Math.floor(maxIter * (1 - 0.8 * distRatio));

            const x0 = centerX + (px - w / 2) * scale / h;
            const y0 = centerY + (py - h / 2) * scale / h;
            let x = (fractalType === 'mandelbrot') ? 0 : x0;
            let y = (fractalType === 'mandelbrot') ? 0 : y0;
            const jcx = juliaState.cx;
            const jcy = juliaState.cy;
            const mcx = x0;
            const mcy = y0;
            let iter = 0;

            while (x * x + y * y <= 4 && iter < currentPixelMaxIter) {
                const xtemp = x * x - y * y + ((fractalType === 'mandelbrot') ? mcx : jcx);
                y = 2 * x * y + ((fractalType === 'mandelbrot') ? mcy : jcy);
                x = xtemp;
                iter++;
            }
            const pixelIndex = (py * w + px) * 4;

            if (iter >= currentPixelMaxIter) {
                // --- INTERIOR COLORING (Trapped Orbit) ---
                // User Request: "Don't be boring darkness"
                // Use final z (x,y) to create a pattern
                const angle = Math.atan2(y, x);
                const dist = Math.sqrt(x * x + y * y);
                const colorShift = timestamp * 0.001;

                // Psychedelic interior pattern
                data[pixelIndex] = Math.sin(angle * 10 + dist * 20 + colorShift) * 127 + 128;
                data[pixelIndex + 1] = Math.sin(angle * 13 + dist * 15 + colorShift + 2) * 127 + 128;
                data[pixelIndex + 2] = Math.sin(angle * 7 + dist * 30 + colorShift + 4) * 127 + 128;
                data[pixelIndex + 3] = 255;
            } else {
                // Much slower color cycling (User Request: "Eyes hurt")
                const colorShift = timestamp * 0.002;
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

    if (debugState.visible) {
        // Colors
        const colAlpha = '#ffffff'; // White for better visibility (was Green)
        const colBeta = '#ffff00';
        const colGamma = '#ff00ff';
        const colGX = '#ff4444';
        const colGY = '#00ffff';

        const elAlpha = document.getElementById('val-alpha');
        const elBeta = document.getElementById('val-beta');
        const elGamma = document.getElementById('val-gamma');
        const elGX = document.getElementById('val-grav-x');
        const elGY = document.getElementById('val-grav-y');

        elAlpha.style.color = colAlpha; elAlpha.textContent = debugState.alpha;
        elBeta.style.color = colBeta; elBeta.textContent = debugState.beta;
        elGamma.style.color = colGamma; elGamma.textContent = debugState.gamma;

        const gx = engine.world.gravity.x;
        const gy = engine.world.gravity.y;

        elGX.style.color = colGX; elGX.textContent = gx.toFixed(2);
        elGY.style.color = colGY; elGY.textContent = gy.toFixed(2);

        // Count & Energy
        const bodies = engine.world.bodies;
        let count = 0;
        let totalKE = 0;
        for (let b of bodies) {
            if (!b.isStatic) {
                count++;
                totalKE += 0.5 * b.mass * (b.speed * b.speed);
            }
        }
        document.getElementById('val-count').textContent = count;
        document.getElementById('val-energy').textContent = Math.floor(totalKE);

        document.getElementById('val-mouse').textContent = debugState.mouseX + ',' + debugState.mouseY;
        document.getElementById('val-res').textContent = renderWidth + 'x' + renderHeight;

        // --- Gravity Graph (Acc) ---
        if (!debugState.historyX) debugState.historyX = new Array(280).fill(0);
        if (!debugState.historyY) debugState.historyY = new Array(280).fill(0);

        debugState.historyX.push(gx);
        debugState.historyX.shift();
        debugState.historyY.push(gy);
        debugState.historyY.shift();

        const canvasG = document.getElementById('debug-graph');
        if (canvasG) {
            const ctxG = canvasG.getContext('2d');
            const w = canvasG.width;
            const h = canvasG.height;
            ctxG.clearRect(0, 0, w, h);

            // Grid
            ctxG.strokeStyle = 'rgba(255,255,255,0.1)';
            ctxG.lineWidth = 1;
            ctxG.beginPath();
            ctxG.moveTo(0, h / 2); ctxG.lineTo(w, h / 2);
            ctxG.stroke();

            // Draw X (Red)
            ctxG.strokeStyle = colGX;
            ctxG.lineWidth = 2;
            ctxG.beginPath();
            for (let i = 0; i < debugState.historyX.length; i++) {
                const val = Math.max(-2, Math.min(2, debugState.historyX[i])); // Clamp -2 to 2
                const y = h / 2 - (val * h / 4);
                if (i === 0) ctxG.moveTo(i, y); else ctxG.lineTo(i, y);
            }
            ctxG.stroke();

            // Draw Y (Blue/Cyan)
            ctxG.strokeStyle = colGY;
            ctxG.beginPath();
            for (let i = 0; i < debugState.historyY.length; i++) {
                const val = Math.max(-2, Math.min(2, debugState.historyY[i]));
                const y = h / 2 - (val * h / 4);
                if (i === 0) ctxG.moveTo(i, y); else ctxG.lineTo(i, y);
            }
            ctxG.stroke();
        }

        // --- Sensor Graph (A/B/G) ---
        if (!debugState.histA) debugState.histA = new Array(280).fill(0);
        if (!debugState.histB) debugState.histB = new Array(280).fill(0);
        if (!debugState.histG) debugState.histG = new Array(280).fill(0);

        debugState.histA.push(parseFloat(debugState.alpha));
        debugState.histA.shift();
        debugState.histB.push(parseFloat(debugState.beta));
        debugState.histB.shift();
        debugState.histG.push(parseFloat(debugState.gamma));
        debugState.histG.shift();

        const canvasS = document.getElementById('debug-graph-sensor');
        if (canvasS) {
            const ctxS = canvasS.getContext('2d');
            const w = canvasS.width;
            const h = canvasS.height;
            ctxS.clearRect(0, 0, w, h);

            // Scale to fit -180 to 360 comfortably in 60px
            // Range 540. 60/540 ~ 0.11. Use 0.08 to be safe.
            // Center shift: we want 0 to be slightly lower than middle if 360 is max.
            // Let's just scale everything by dividing by 4 and centering.
            // 360/4 = 90. -180/4 = -45. Total range 135px? Canvas is 60px.
            // Divide by 20? 18px. Good.
            // User request: "Up to 370".
            // Height 60. Center 30. Max delta 30.
            // 370 * scale <= 28 (padding). scale <= 0.075.
            const sScale = 0.07; // Fits 370 range.
            const cy = h / 2;

            // Grid
            ctxS.strokeStyle = 'rgba(255,255,255,0.1)';
            ctxS.lineWidth = 1;
            ctxS.beginPath();
            ctxS.moveTo(0, cy); ctxS.lineTo(w, cy);
            ctxS.stroke();

            const drawLine = (arr, color) => {
                ctxS.strokeStyle = color;
                ctxS.lineWidth = 1.5;
                ctxS.beginPath();
                for (let i = 0; i < arr.length; i++) {
                    const val = arr[i];
                    // Wrap Alpha for display? Alpha 0 and 360 jump.
                    // Just direct plot.
                    const y = cy - (val * sScale);
                    if (i === 0) ctxS.moveTo(i, y); else ctxS.lineTo(i, y);
                }
                ctxS.stroke();
            };

            drawLine(debugState.histA, colAlpha);
            drawLine(debugState.histB, colBeta);
            drawLine(debugState.histG, colGamma);
        }

        // --- Gravity Arrow (Vector) ---
        const canvasA = document.getElementById('debug-arrow');
        if (canvasA) {
            const ctxA = canvasA.getContext('2d');
            const w = canvasA.width;
            const h = canvasA.height;
            const cx = w / 2;
            const cy = h / 2;
            ctxA.clearRect(0, 0, w, h);

            // Outer ring
            ctxA.strokeStyle = 'rgba(255,255,255,0.3)';
            ctxA.lineWidth = 1;
            ctxA.beginPath();
            ctxA.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
            ctxA.stroke();

            // Calculate Vector Properties
            const mag = Math.sqrt(gx * gx + gy * gy);
            // Color based on Magnitude
            // Map 0 (Zero-G) -> Blue (240), 1 (Normal) -> Green (120), 2+ (High) -> Red (0)
            let hue = 240 - (mag * 120);
            if (hue < 0) hue = 0;
            if (hue > 240) hue = 240;
            const arrowColor = `hsl(${hue}, 100%, 50%)`;

            // Fixed Length Direction
            const arrowLen = w / 2 - 4;
            let dirX = 0, dirY = -1; // Default up? Or 0?
            if (mag > 0.01) {
                dirX = gx / mag;
                dirY = gy / mag;
            }

            const endX = cx + dirX * arrowLen;
            const endY = cy + dirY * arrowLen;

            ctxA.strokeStyle = arrowColor;
            ctxA.lineWidth = 3;
            ctxA.beginPath();
            ctxA.moveTo(cx, cy);
            ctxA.lineTo(endX, endY);
            ctxA.stroke();

            // Arrow head
            const angle = Math.atan2(dirY, dirX);
            ctxA.beginPath();
            ctxA.moveTo(endX, endY);
            ctxA.lineTo(endX - 7 * Math.cos(angle - Math.PI / 6), endY - 7 * Math.sin(angle - Math.PI / 6));
            ctxA.lineTo(endX - 7 * Math.cos(angle + Math.PI / 6), endY - 7 * Math.sin(angle + Math.PI / 6));
            ctxA.closePath();
            ctxA.fillStyle = arrowColor;
            ctxA.fill();
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
