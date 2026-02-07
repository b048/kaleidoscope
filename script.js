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
    initialBeadCount: 10,
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
    particleCount: 50 // Max particles
};

// --- Particles System ---
const particles = [];
function spawnParticle(x, y, color) {
    if (particles.length > CONFIG.particleCount) particles.shift(); // Limit count
    particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
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
        p.life -= 0.02; // Fade out

        if (p.life <= 0) {
            particles.splice(i, 1);
        } else {
            ctx.fillStyle = p.color; // simplified, assumes rgba is handled or passed correctly
            // Hack for alpha:
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
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
const runner = Runner.create();
let renderWidth = window.innerWidth;
let renderHeight = window.innerHeight;

// Physics Parameters
let gravityScale = 1;
let airFriction = 0.05;
let wallRestitution = 0.6;

// Elements
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
const slotBaseY = renderHeight - CONFIG.supplyBoxHeight + 50;
const slotWidth = renderWidth / CONFIG.slotCountCols;
const slotRowHeight = CONFIG.supplyBoxHeight / CONFIG.slotRows;

for (let row = 0; row < CONFIG.slotRows; row++) {
    for (let col = 0; col < CONFIG.slotCountCols; col++) {
        supplySlots.push({ x: (col + 0.5) * slotWidth, y: slotBaseY + (row * slotRowHeight), occupiedBy: null });
    }
}

// Generate Gemstones
function createGem(x, y, isStaticInBox = false) {
    const size = Common.random(15, 25);
    const sides = Math.floor(Common.random(3, 8));
    let color = Common.choose(CONFIG.gemColors);

    const rand = Math.random();
    const isGlowing = rand < 0.05; // 5%
    // If not glowing, small chance for Eye. 0.5% overall
    const isEye = !isGlowing && Math.random() < 0.005;

    if (isEye) {
        // Monster color
        color = Common.choose(['#9b59b6', '#2ecc71', '#e67e22', '#34495e']);
    }

    const plug = {};
    if (isGlowing) {
        plug.type = 'glowing';
        plug.complementary = getComplementaryColor(color);
    } else if (isEye) {
        plug.type = 'eye';
        plug.eyeOffset = Math.random() * 1000;
        plug.blinkTimer = 0; // use simpler blink logic
        // Movement state
        plug.noiseOffset = Math.random() * 1000;
    } else {
        plug.type = 'normal';
    }

    const body = Bodies.polygon(x, y, sides, size, {
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
    });

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
                    if (!body.isStatic) body.label = 'gem';
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

// Initial Objects
for (let i = 0; i < CONFIG.initialBeadCount; i++) {
    const gem = createGem(boundaryCenter.x + Common.random(-50, 50), boundaryCenter.y + Common.random(-50, 50), false);
    Composite.add(engine.world, gem);
}

// Gravity
function handleOrientation(event) {
    if (event.gamma === null || event.beta === null) return;
    engine.world.gravity.x = (Common.clamp(event.gamma, -90, 90) / 90) * gravityScale;
    engine.world.gravity.y = (Common.clamp(event.beta, -90, 90) / 90) * gravityScale;
}
window.addEventListener('deviceorientation', handleOrientation);

// Mouse Gravity
if (!('ontouchstart' in window)) {
    document.addEventListener('mousemove', (e) => {
        if (e.buttons === 0) {
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
});
Composite.add(engine.world, mouseConstraint);


// --- Simplex-like Noise function for smooth random movement ---
// Simple 1D noise approximation
function noise(t) {
    return Math.sin(t) + Math.sin(2.2 * t + 5.5) * 0.5 + Math.sin(1.2 * t + 3.0) * 0.2;
}

// Render Loop
function render() {
    const timestamp = Date.now();
    checkSupplyAndCleanup();

    // Update Logic
    Composite.allBodies(engine.world).forEach(b => {
        if (b.label === 'gem' || b.label === 'gem_transition') b.frictionAir = airFriction;

        // Eye Logic: Smooth "Swimming" logic
        if (b.plugin && b.plugin.type === 'eye' && !b.isStatic && b.label !== 'gem_supply') {
            // Use noise applied to force vector for smooth turns
            const t = (timestamp + b.plugin.noiseOffset) * 0.002;
            const angle = noise(t) * Math.PI * 2; // Smoothly changing angle
            const forceMag = 0.0005; // Gentle swim force

            Body.applyForce(b, b.position, {
                x: Math.cos(angle) * forceMag,
                y: Math.sin(angle) * forceMag
            });
        }

        // Glow Particles
        if (b.plugin && b.plugin.type === 'glowing' && !b.isStatic) {
            // Emmit particle occasionally
            if (Math.random() < 0.2) { // 20% chance per frame
                spawnParticle(
                    b.position.x + (Math.random() - 0.5) * 20,
                    b.position.y + (Math.random() - 0.5) * 20,
                    'rgba(255, 255, 255, 1)'
                );
            }
        }
    });

    Engine.update(engine, 1000 / 60);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    // Backgrounds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, renderHeight - CONFIG.supplyBoxHeight, renderWidth, CONFIG.supplyBoxHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(boundaryCenter.x, boundaryCenter.y, boundaryRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Bodies
    const bodies = Composite.allBodies(engine.world);

    // Render Particles (Underneath or on top? Let's do underneath for glow effect)
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

        // Main Fill
        // Eyes should be solid/monster color, not additively blended if possible? 
        // Screen blend on "monster color" looks okay usually, but distinct
        if (body.plugin && body.plugin.type === 'eye') {
            // Eye monster body
            ctx.globalCompositeOperation = 'source-over'; // Solid
            ctx.fillStyle = body.render.fillStyle;
            ctx.fill();
            ctx.stroke();
            ctx.globalCompositeOperation = 'screen'; // back to normal
        } else {
            // Gems
            if (body.plugin && body.plugin.type === 'glowing') {
                ctx.shadowBlur = 15;
                ctx.shadowColor = 'white';
                ctx.fillStyle = body.render.fillStyle;
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = body.render.fillStyle;
            }

            ctx.strokeStyle = body.render.strokeStyle || 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Inner Details
        if (body.plugin && body.plugin.type === 'glowing') {
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

        if (body.plugin && body.plugin.type === 'eye') {
            // Eye Drawing
            ctx.globalCompositeOperation = 'source-over';
            const radius = 8;
            const center = body.position;

            // Sclera
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
            ctx.fill();

            // Pupil
            const lookTime = (timestamp + body.plugin.eyeOffset) / 500;
            const lookX = Math.cos(lookTime) * 3;
            const lookY = Math.sin(lookTime) * 3;
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(center.x + lookX, center.y + lookY, radius * 0.4, 0, 2 * Math.PI);
            ctx.fill();

            // Simple Blink (No rect, just close eye by not drawing or drawing skin over)
            // Or just simple blink:
            const blinkCycle = (timestamp + body.plugin.noiseOffset) % 3000;
            if (blinkCycle < 150) { // Closed for 150ms every 3s
                ctx.fillStyle = body.render.fillStyle;
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius + 1, 0, 2 * Math.PI);
                ctx.fill();
            }

            ctx.globalCompositeOperation = 'screen';
        }

        // Shine overlay (skip for eyes to keep them "matter")
        if (!body.plugin || body.plugin.type !== 'eye') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fill();
        }
    });

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(render);
}

render();
