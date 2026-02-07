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
    initialBeadCount: 15, // Increased slightly for more interaction
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
        color: color
    });
}

function updateDrawParticles(ctx) {
    ctx.globalCompositeOperation = 'screen';
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;

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
let globalScale = 1.0;

// Global state
let isSensorActive = false;
let isAutoRotating = true; // Default ON
let autoRotateAngle = 0;

// Elements & Listeners
document.getElementById('gravityControl').addEventListener('input', (e) => {
    gravityScale = parseFloat(e.target.value);
});
document.getElementById('frictionControl').addEventListener('input', (e) => {
    airFriction = parseFloat(e.target.value);
    Composite.allBodies(engine.world).forEach(body => {
        if (!body.isStatic) body.frictionAir = airFriction;
    });
});
document.getElementById('restitutionControl').addEventListener('input', (e) => {
    wallRestitution = parseFloat(e.target.value);
    Composite.allBodies(engine.world).forEach(body => {
        if (body.label === 'wall') {
            body.restitution = wallRestitution;
        }
    });
});
document.getElementById('scaleControl').addEventListener('input', (e) => {
    const newScale = parseFloat(e.target.value);
    const ratio = newScale / globalScale;
    globalScale = newScale;

    // Rescale all dynamic bodies
    Composite.allBodies(engine.world).forEach(body => {
        if (!body.isStatic && body.label !== 'gem_supply') {
            Body.scale(body, ratio, ratio);
        }
    });
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
    const baseSize = Common.random(15, 25);
    const size = baseSize * (isStaticInBox ? 1.0 : globalScale);

    const sides = Math.floor(Common.random(3, 8));
    let color = Common.choose(CONFIG.gemColors);

    const rand = Math.random();

    // Rare Super Object: Glowing + Moving
    const isSuperRare = rand < 0.0005;
    const isGlowing = isSuperRare || (rand >= 0.0005 && rand < 0.0505);
    const isEye = isSuperRare || (!isGlowing && rand > 0.0505 && rand < 0.1005); // Increased eye probability

    // Eye colors
    if (isEye && !isSuperRare) {
        color = Common.choose(CONFIG.gemColors); // Can be any color now
    }
    if (isSuperRare) {
        color = '#FFD700'; // Gold
    }

    const plug = {};
    plug.color = color; // Store color for matching
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

        // Emotion State
        plug.emotion = 'normal';
        plug.stuckCounter = 0;
        plug.sleepCounter = 0;
        plug.emotionTimer = 0;
    } else if (!isGlowing) {
        plug.type = 'normal';
    }

    const bodyOptions = {
        friction: 0.1,
        restitution: 0.6,
        frictionAir: airFriction,
        render: {
            fillStyle: color,
            strokeStyle: 'white',
            lineWidth: isGlowing ? 4 : 2
        },
        label: 'gem',
        plugin: plug
    };

    const body = Bodies.polygon(x, y, sides, size, bodyOptions);

    if (isGlowing) {
        Body.setDensity(body, body.density * 5); // Heavy
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

        // Skip static
        if (bodyA.isStatic || bodyB.isStatic) continue;
        // Skip walls
        if (bodyA.label === 'wall' || bodyB.label === 'wall') continue;

        // Check if one is Eye and they match color
        // Simple Logic: Only Eyes eat non-eyes (or smaller eyes)
        // Let's make it: Eye eats matching color Gem (if Gem !Eye or smaller)

        const typeA = bodyA.plugin && (bodyA.plugin.type === 'eye' || bodyA.plugin.type === 'super_eye');
        const typeB = bodyB.plugin && (bodyB.plugin.type === 'eye' || bodyB.plugin.type === 'super_eye');

        if (!typeA && !typeB) continue; // No eyes involved

        // Determine Eater and Eaten
        let eater = null;
        let eaten = null;

        // If both are eyes, larger eats smaller? Or ignore? Let's ignore cannibalism for now to keep population up.
        // Actually user said "eat same colored block".
        if (typeA && !typeB && bodyA.plugin.color === bodyB.plugin.color) {
            eater = bodyA; eaten = bodyB;
        } else if (typeB && !typeA && bodyB.plugin.color === bodyA.plugin.color) {
            eater = bodyB; eaten = bodyA;
        }

        if (eater && eaten) {
            // Eat!
            // Grow Eater
            const growthFactor = 1.05;
            // Limit max size
            if (eater.area < 20000) { // arbitrary cap
                Body.scale(eater, growthFactor, growthFactor);
                eater.mass *= growthFactor;
            }

            // FX
            spawnParticle(eaten.position.x, eaten.position.y, eaten.plugin.color);
            spawnParticle(eaten.position.x, eaten.position.y, 'white');

            // Remove Eaten
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

        // Check sensor
        setTimeout(() => {
            if (!isSensorActive && !isAutoRotating) {
                console.log("No sensor data.");
            }
        }, 2000);
    }
});


// Mouse Gravity
if (!('ontouchstart' in window)) {
    document.addEventListener('mousemove', (e) => {
        if (e.buttons === 0 && !isAutoRotating) {
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

// Render Loop
function render() {
    const timestamp = Date.now();
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
    const bodies = Composite.allBodies(engine.world); // Cache list

    bodies.forEach(b => {
        if (b.label === 'gem' || b.label === 'gem_transition') b.frictionAir = airFriction;

        // --- Eye Logic (Emotions & AI) ---
        if (b.plugin && (b.plugin.type === 'eye' || b.plugin.type === 'super_eye') && !b.isStatic && b.label !== 'gem_supply') {

            // --- AI: Scan Neighbors ---
            const scanRange = 250 * globalScale;

            bodies.forEach(other => {
                if (b === other || other.isStatic || other.label === 'gem_supply') return;

                const dVector = Vector.sub(other.position, b.position);
                const dist = Vector.magnitude(dVector);

                if (dist < scanRange && other.plugin) {
                    const dir = Vector.normalise(dVector);

                    // 1. Same Color -> Attract to Eat (Weak attraction)
                    if (other.plugin.color === b.plugin.color) {
                        const force = Vector.mult(dir, 0.0003 * b.mass);
                        Body.applyForce(b, b.position, force);
                    }
                    // 2. Complementary Color -> Place around self (Spring-like)
                    else if (other.plugin.color === b.plugin.complementary) {
                        // Desired orbital distance
                        const idealDist = 80 * globalScale;
                        const delta = dist - idealDist;
                        // If too far, attract. If too close, repel.
                        const forceMag = delta * 0.00001 * b.mass; // Spring constant
                        const force = Vector.mult(dir, forceMag);
                        Body.applyForce(other, other.position, Vector.neg(force)); // Pull other to me? or me to other? Let's interact
                        Body.applyForce(b, b.position, force);
                    }
                }
            });


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
            }

            // 2. Sleep Logic
            if (b.plugin.emotion === 'normal' && Math.random() < 0.0001) {
                b.plugin.emotion = 'sleep';
                b.plugin.sleepCounter = 600;
            }
            if (b.plugin.emotion === 'sleep') {
                b.plugin.sleepCounter--;
                if (b.plugin.sleepCounter <= 0) b.plugin.emotion = 'normal';
            }

            // Action based on emotion
            if (b.plugin.emotion === 'angry') {
                // Explode / Push neighbors (MILDER)
                if (Math.random() < 0.1) {
                    if (Math.random() < 0.3) spawnParticle(b.position.x, b.position.y, 'rgba(255,255,255,0.5)');

                    Composite.allBodies(engine.world).forEach(other => {
                        if (other !== b && !other.isStatic) {
                            const d = Vector.sub(other.position, b.position);
                            const dist = Vector.magnitude(d);
                            if (dist < 150) { // Reduced range
                                let force = Vector.normalise(d);
                                force = Vector.mult(force, 0.015); // Much weaker push
                                Body.applyForce(other, other.position, force);
                            }
                        }
                    });
                    Body.applyForce(b, b.position, { x: (Math.random() - 0.5) * 0.02, y: (Math.random() - 0.5) * 0.02 });
                }
            } else if (b.plugin.emotion === 'sleep') {
                // Do nothing
            } else {
                // Normal swim
                const moodMult = (b.plugin.emotion === 'tired' || b.plugin.emotion === 'scared') ? 0.2 : 1.0;
                const t = (timestamp + b.plugin.noiseOffset) * 0.002;
                const angle = noise(t) * Math.PI * 2;
                const uniqueMult = (b.plugin.type === 'super_eye') ? 2.0 : 1.0;
                const forceMag = 0.0002 * b.mass * (globalScale * globalScale) * uniqueMult * moodMult;
                Body.applyForce(b, b.position, {
                    x: Math.cos(angle) * forceMag,
                    y: Math.sin(angle) * forceMag
                });
            }
        }

        // Glow Particles
        if (b.plugin && (b.plugin.type === 'glowing' || b.plugin.type === 'super_eye') && !b.isStatic) {
            if (Math.random() < 0.2) {
                spawnParticle(
                    b.position.x + (Math.random() - 0.5) * 20,
                    b.position.y + (Math.random() - 0.5) * 20,
                    (b.plugin.type === 'super_eye') ? 'gold' : 'rgba(255, 255, 255, 1)'
                );
            }
        }
    });

    Engine.update(engine, 1000 / 60);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    // Boundary Link
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(boundaryCenter.x, boundaryCenter.y, boundaryRadius, 0, 2 * Math.PI);
    ctx.stroke();

    updateDrawParticles(ctx);
    ctx.globalCompositeOperation = 'screen';

    bodies.forEach(body => {
        if (body.label === 'wall') return;

        ctx.beginPath();
        const vertices = body.vertices;
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let j = 1; j < vertices.length; j += 1) {
            ctx.lineTo(vertices[j].x, vertices[j].y);
        }
        ctx.lineTo(vertices[0].x, vertices[0].y);
        ctx.closePath();

        // Color Logic with Emotion
        let fill = body.render.fillStyle;

        // Main Fill
        // Super Eye = Gold
        if (body.plugin && (body.plugin.type === 'eye' || body.plugin.type === 'super_eye')) {
            if (body.plugin.type === 'super_eye') {
                ctx.shadowBlur = 30;
                ctx.shadowColor = 'gold';
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
        } else {
            if (body.plugin && body.plugin.type === 'glowing') {
                ctx.shadowBlur = 15;
                ctx.shadowColor = 'white';
                ctx.fillStyle = fill;
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = fill;
            }

            ctx.strokeStyle = body.render.strokeStyle || 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Inner Details (Complementary)
        if (body.plugin && (body.plugin.type === 'glowing' || body.plugin.type === 'super_eye')) {
            if (body.plugin.type !== 'super_eye' && body.plugin.emotion !== 'angry') {
                ctx.fillStyle = body.plugin.complementary;
                ctx.globalCompositeOperation = 'source-over';
                const center = body.position;
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
        if (body.plugin && (body.plugin.type === 'eye' || body.plugin.type === 'super_eye')) {
            ctx.globalCompositeOperation = 'source-over';
            const radius = 8 * globalScale; // Scale eye too
            const center = body.position;

            // Emotion Drawing
            if (body.plugin.emotion === 'sleep') {
                // Sleep: Flat line
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(center.x - radius, center.y);
                ctx.lineTo(center.x + radius, center.y);
                ctx.stroke();
                if (Math.random() < 0.05) spawnParticle(center.x, center.y - 20, 'white');
            } else if (body.plugin.emotion === 'scared') {
                // Scared: > <
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(center.x - radius * 0.8, center.y - radius * 0.5);
                ctx.lineTo(center.x - radius * 0.2, center.y);
                ctx.lineTo(center.x - radius * 0.8, center.y + radius * 0.5);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(center.x + radius * 0.8, center.y - radius * 0.5);
                ctx.lineTo(center.x + radius * 0.2, center.y);
                ctx.lineTo(center.x + radius * 0.8, center.y + radius * 0.5);
                ctx.stroke();
            } else if (body.plugin.emotion === 'tired') {
                // Tired
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,0.3)'; // Eyelids
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius, Math.PI, 0);
                ctx.fill();
                ctx.fillStyle = 'black'; // Pupil
                ctx.beginPath();
                ctx.arc(center.x, center.y + radius * 0.3, radius * 0.4, 0, 2 * Math.PI);
                ctx.fill();
                if (Math.random() < 0.02) spawnParticle(center.x + radius, center.y - 10, 'rgba(100,100,255,0.5)');
            } else {
                // Normal / Angry -> Look at velocity
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
                ctx.fill();

                // LOOK AT VELOCITY LOGIC
                let lookX = 0, lookY = 0;
                if (body.plugin.emotion === 'angry') {
                    lookX = (Math.random() - 0.5) * 2;
                    lookY = (Math.random() - 0.5) * 2;
                } else {
                    // Look along velocity vector
                    const vel = body.velocity;
                    const speed = Vector.magnitude(vel);
                    if (speed > 0.5) { // Only look if moving somewhat
                        const vNorm = Vector.normalise(vel);
                        lookX = vNorm.x * 4 * globalScale; // Range of looking
                        lookY = vNorm.y * 4 * globalScale;
                    } else {
                        // Idle look
                        const lookTime = (timestamp + body.plugin.eyeOffset) / 1000;
                        lookX = Math.cos(lookTime) * 2 * globalScale;
                        lookY = Math.sin(lookTime) * 2 * globalScale;
                    }
                }

                ctx.fillStyle = (body.plugin.type === 'super_eye') ? 'red' : 'black';
                ctx.beginPath();
                ctx.arc(center.x + lookX, center.y + lookY, radius * 0.4, 0, 2 * Math.PI);
                ctx.fill();

                // Angry Features
                if (body.plugin.emotion === 'angry') {
                    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(center.x - radius, center.y - radius * 0.5);
                    ctx.lineTo(center.x + radius, center.y - radius * 0.5);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(center.x - radius * 0.5, center.y + radius * 0.5);
                    ctx.lineTo(center.x + radius * 0.5, center.y + radius * 0.5);
                    ctx.stroke();
                }

                // Blink
                if (body.plugin.emotion === 'normal') {
                    const blinkCycle = (timestamp + body.plugin.noiseOffset) % 3000;
                    if (blinkCycle < 150) {
                        ctx.fillStyle = body.render.fillStyle;
                        ctx.beginPath();
                        ctx.arc(center.x, center.y, radius + 1, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            }
            ctx.globalCompositeOperation = 'screen';
        }

        if (!body.plugin || (body.plugin.type !== 'eye' && body.plugin.type !== 'super_eye')) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fill();
        }
    });

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(render);
}

render();
