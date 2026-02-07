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
    if (particles.length > CONFIG.particleCount) particles.shift();
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
            ctx.fillStyle = p.color;
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
// Safe margin: 150px
const safeBottomMargin = 150;
const slotBaseY = renderHeight - CONFIG.supplyBoxHeight - safeBottomMargin + 100;
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

    // Rare Super Object: Glowing + Moving
    const isSuperRare = rand < 0.00025;

    // Glowing (5%)
    const isGlowing = isSuperRare || (rand >= 0.00025 && rand < 0.05025);

    // Eye (0.5%)
    const isEye = isSuperRare || (!isGlowing && rand > 0.05025 && rand < 0.05525);

    if (isEye && !isSuperRare) {
        color = Common.choose(['#9b59b6', '#2ecc71', '#e67e22', '#34495e']);
    }
    if (isSuperRare) {
        color = '#FFD700'; // Gold
    }

    const plug = {};
    if (isGlowing) {
        plug.type = 'glowing';
        plug.complementary = getComplementaryColor(color);
    }

    if (isEye) {
        if (!plug.type) plug.type = 'eye';
        if (isSuperRare) plug.type = 'super_eye';

        plug.eyeOffset = Math.random() * 1000;
        plug.blinkTimer = 0;
        plug.noiseOffset = Math.random() * 1000;
    } else if (!isGlowing) {
        plug.type = 'normal';
    }

    const bodyOptions = {
        friction: 0.1,
        restitution: 0.6,
        frictionAir: airFriction,
        render: {
            fillStyle: (isEye && !isSuperRare) ? '#333' : color,
            strokeStyle: 'white',
            lineWidth: isGlowing ? 4 : 2
        },
        label: 'gem',
        plugin: plug
    };

    const body = Bodies.polygon(x, y, sides, size, bodyOptions);

    if (isGlowing) {
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
        // Expanded supply zone check
        const isInSupplyZone = body.position.y > renderHeight - CONFIG.supplyBoxHeight - safeBottomMargin - 50;

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

// Gravity & Permission
const debugInfo = document.getElementById('debug-info');

function handleOrientation(event) {
    // Debug info
    if (debugInfo && event.alpha !== null) {
        debugInfo.textContent = `a:${event.alpha.toFixed(1)} b:${event.beta.toFixed(1)} g:${event.gamma.toFixed(1)}`;
    }

    if (event.gamma === null || event.beta === null) return;

    const rad = Math.PI / 180;
    const x = Math.sin(event.gamma * rad);
    const y = Math.sin(event.beta * rad);

    engine.world.gravity.x = x * gravityScale;
    engine.world.gravity.y = y * gravityScale;
}

// Permission Request (iOS 13+)
const startButton = document.getElementById('startButton');
startButton.addEventListener('click', async () => {
    // Fullscreen attempt
    if (!document.fullscreenElement) {
        try {
            await document.documentElement.requestFullscreen();
        } catch (e) {
            console.log("Fullscreen denied", e);
        }
    }

    // iOS Permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
                document.getElementById('instruction-overlay').classList.add('hidden');
            } else {
                alert('Permission denied. Gravity will not work.');
            }
        } catch (e) {
            console.error(e);
            alert('Error requesting permission: ' + e);
        }
    } else {
        // Non-iOS or older devices
        window.addEventListener('deviceorientation', handleOrientation);
        document.getElementById('instruction-overlay').classList.add('hidden');
    }
});


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


// Noise function
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

        // Eye (or Super Eye) Movement
        if (b.plugin && (b.plugin.type === 'eye' || b.plugin.type === 'super_eye') && !b.isStatic && b.label !== 'gem_supply') {
            const t = (timestamp + b.plugin.noiseOffset) * 0.002;
            const angle = noise(t) * Math.PI * 2;
            const forceMag = 0.0005 * (b.mass / 5);

            Body.applyForce(b, b.position, {
                x: Math.cos(angle) * forceMag,
                y: Math.sin(angle) * forceMag
            });
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

    // Supply Box Area BG
    const boxY = renderHeight - CONFIG.supplyBoxHeight - safeBottomMargin;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, boxY, renderWidth, CONFIG.supplyBoxHeight + safeBottomMargin);

    // Boundary Link
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(boundaryCenter.x, boundaryCenter.y, boundaryRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Bodies
    const bodies = Composite.allBodies(engine.world);
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

        // Main Fill & Glow
        if (body.plugin && (body.plugin.type === 'eye' || body.plugin.type === 'super_eye')) {
            if (body.plugin.type === 'super_eye') {
                ctx.shadowBlur = 30;
                ctx.shadowColor = 'gold';
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = body.render.fillStyle;
            ctx.fill();
            ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
        } else {
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

        // Inner Details (Complementary)
        if (body.plugin && (body.plugin.type === 'glowing' || body.plugin.type === 'super_eye')) {
            if (body.plugin.type !== 'super_eye') {
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
            const radius = 8;
            const center = body.position;

            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
            ctx.fill();

            const lookTime = (timestamp + body.plugin.eyeOffset) / 500;
            const lookX = Math.cos(lookTime) * 3;
            const lookY = Math.sin(lookTime) * 3;

            ctx.fillStyle = (body.plugin.type === 'super_eye') ? 'red' : 'black';
            ctx.beginPath();
            ctx.arc(center.x + lookX, center.y + lookY, radius * 0.4, 0, 2 * Math.PI);
            ctx.fill();

            const blinkCycle = (timestamp + body.plugin.noiseOffset) % 3000;
            if (blinkCycle < 150) {
                ctx.fillStyle = body.render.fillStyle;
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius + 1, 0, 2 * Math.PI);
                ctx.fill();
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
