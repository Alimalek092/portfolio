/**
 * High-performance Editorial Cherry Blossom Simulation Engine
 * Features:
 * - Viewport-fixed canvas particle simulation
 * - Procedural vector cherry blossoms and single petals
 * - Circular "gravity portal" detection: particles orbit the hero circle when idle
 * - Viewport scroll event listeners: scroll speed creates a parallax wind vector
 * - Dynamic trail spawning on cursor move & click-ripple blast storm
 */

const canvas = document.getElementById('interactive-canvas');
const ctx = canvas.getContext('2d');

const fpsCounter = document.getElementById('fps-counter');
const particleCounter = document.getElementById('particle-counter');
const btnTogglePhysics = document.getElementById('btn-toggle-physics');
const btnExplore = document.getElementById('btn-explore');
const portalElement = document.querySelector('.gravity-portal');

// Configuration Settings
const CONFIG = {
  ambientPetals: 65,       // Background drifting petals
  maxParticles: 250,       // Performance guard rails
  windX: 0.35,             // Base horizontal breeze
  windY: 0.7,              // Downward gravity
  gravityRadius: 200,      // Cursor influence zone
  chaseForce: 0.45,        // Strength of pull to cursor
  friction: 0.94,          // Speed dampening
  shockwaveCount: 22,      // Petals spawned on click
};

let particles = [];
let width = 0;
let height = 0;
let lastMouseX = null;
let lastMouseY = null;
let mouseIsMoving = false;
let trailMode = true; // true = spawn trails, false = funnel gravity
let time = 0;

// Cursor tracking
const pointer = {
  x: null,
  y: null,
  active: false,
  radius: CONFIG.gravityRadius,
};

// Portal center coordinates (idle orbit point)
let portalCenter = { x: null, y: null };

/**
 * Locate the gravity portal coordinates dynamically
 */
function updatePortalCoordinates() {
  if (portalElement) {
    const rect = portalElement.getBoundingClientRect();
    portalCenter.x = rect.left + rect.width / 2;
    portalCenter.y = rect.top + rect.height / 2;
  }
}

/**
 * Handle resizing
 */
function resizeCanvas() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  
  updatePortalCoordinates();
  initAmbientParticles();
}

/**
 * Procedural flower drawings
 */
function drawFlower(ctx, x, y, size, rotation, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.5, -size * 0.3, -size * 0.5, -size * 0.85, 0, -size);
    ctx.bezierCurveTo(size * 0.5, -size * 0.85, size * 0.5, -size * 0.3, 0, 0);
    
    const grad = ctx.createLinearGradient(0, 0, 0, -size);
    grad.addColorStop(0, `rgba(255, 230, 238, ${alpha})`); // Pinkish core
    grad.addColorStop(0.4, `rgba(255, 246, 248, ${alpha})`);
    grad.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.95})`);
    ctx.fillStyle = grad;
    ctx.fill();
    
    ctx.strokeStyle = `rgba(255, 205, 220, ${alpha * 0.2})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    
    ctx.rotate((Math.PI * 2) / 5);
  }
  
  // Center detail
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 218, 122, ${alpha * 0.95})`;
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 120, 145, ${alpha * 0.95})`;
  ctx.fill();
  
  ctx.restore();
}

function drawPetal(ctx, x, y, size, rotation, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-size * 0.6, -size * 0.3, -size * 0.5, -size * 0.9, 0, -size);
  ctx.bezierCurveTo(size * 0.5, -size * 0.9, size * 0.6, -size * 0.3, 0, 0);
  
  const grad = ctx.createLinearGradient(0, 0, 0, -size);
  grad.addColorStop(0, `rgba(255, 228, 236, ${alpha})`);
  grad.addColorStop(0.8, `rgba(255, 248, 250, ${alpha})`);
  grad.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.9})`);
  ctx.fillStyle = grad;
  ctx.fill();
  
  ctx.strokeStyle = `rgba(255, 205, 215, ${alpha * 0.2})`;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Particle Class
 */
class BlossomParticle {
  constructor(x, y, isTrail = false, type = null) {
    this.x = x || Math.random() * width;
    this.y = y || (isTrail ? y : Math.random() * height - 50);
    
    this.isTrail = isTrail;
    this.type = type || (Math.random() > 0.45 ? 'petal' : 'flower');
    
    this.vx = (Math.random() - 0.5) * 1.2 + (isTrail ? 0 : CONFIG.windX);
    this.vy = Math.random() * 1.0 + 0.6 + (isTrail ? 0 : CONFIG.windY);
    
    this.size = Math.random() * 8 + 6;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.025;
    
    this.swaySeed = Math.random() * 100;
    this.swaySpeed = Math.random() * 0.015 + 0.01;
    
    this.life = 1.0;
    this.decay = Math.random() * 0.012 + 0.007;
    this.alpha = isTrail ? 1.0 : Math.random() * 0.65 + 0.25;
  }

  update() {
    time += 0.001;
    
    this.x += this.vx;
    this.y += this.vy;
    
    this.vx *= CONFIG.friction;
    this.vy *= CONFIG.friction;
    
    // Flutter sway
    const sway = Math.sin(time * 25 + this.swaySeed) * 0.22;
    this.x += sway;
    this.rotation += this.rotSpeed;

    // Identify current target attractor (Cursor coordinates or Portal center)
    let targetX = null;
    let targetY = null;
    let activeRadius = pointer.radius;
    let isCursorAttraction = false;

    if (pointer.active && pointer.x !== null) {
      targetX = pointer.x;
      targetY = pointer.y;
      isCursorAttraction = true;
    } else if (portalCenter.x !== null) {
      targetX = portalCenter.x;
      targetY = portalCenter.y;
      activeRadius = 150; // Smaller radius for portal orbit
    }

    // Apply attraction forces
    if (targetX !== null) {
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < activeRadius) {
        const force = (activeRadius - distance) / activeRadius;
        const angle = Math.atan2(dy, dx);
        
        if (isCursorAttraction) {
          if (this.isTrail) {
            // Trails chase cursor directly
            if (distance > 8) {
              this.vx += (dx / distance) * CONFIG.chaseForce * (1.2 - force);
              this.vy += (dy / distance) * CONFIG.chaseForce * (1.2 - force);
            }
          } else if (!trailMode) {
            // Gravity vacuum pulls ambient petals in
            this.vx += Math.cos(angle) * force * 0.6;
            this.vy += Math.sin(angle) * force * 0.6;
            this.rotation += this.rotSpeed * 2.5;
          }
        } else if (!this.isTrail) {
          // Idle state: Orbit around portal center using gravitational pull & tangent vector
          const tangentAngle = angle + Math.PI / 2;
          this.vx += Math.cos(angle) * force * 0.15 + Math.cos(tangentAngle) * force * 0.38;
          this.vy += Math.sin(angle) * force * 0.15 + Math.sin(tangentAngle) * force * 0.38;
          this.rotation += this.rotSpeed * 1.8;
        }
      }
    }

    // Ambient drifts
    this.vx += CONFIG.windX * 0.15;
    this.vy += CONFIG.windY * 0.15;

    // Boundary wrap / decay
    if (this.isTrail) {
      this.life -= this.decay;
      this.alpha = Math.max(0, this.life);
    } else {
      if (this.y > height + 20) {
        this.y = -20;
        this.x = Math.random() * width;
        this.vx = (Math.random() - 0.5) * 1.2 + CONFIG.windX;
        this.vy = Math.random() * 1.0 + 0.6 + CONFIG.windY;
        this.alpha = Math.random() * 0.65 + 0.25;
      }
      if (this.x > width + 20) {
        this.x = -20;
        this.y = Math.random() * height - 50;
      }
      if (this.x < -20) {
        this.x = width + 20;
      }
    }
  }

  draw() {
    if (this.alpha <= 0.05) return;
    
    if (this.type === 'flower') {
      drawFlower(ctx, this.x, this.y, this.size, this.rotation, this.alpha);
    } else {
      drawPetal(ctx, this.x, this.y, this.size, this.rotation, this.alpha);
    }
  }
}

function initAmbientParticles() {
  particles = [];
  for (let i = 0; i < CONFIG.ambientPetals; i++) {
    particles.push(new BlossomParticle());
  }
}

// Performance FPS tracking metrics
let lastFrameTime = performance.now();
let frameCount = 0;
let fpsTimer = 0;

/**
 * Frame loop
 */
function animate(currentTime) {
  frameCount++;
  const delta = currentTime - lastFrameTime;
  lastFrameTime = currentTime;
  fpsTimer += delta;
  
  if (fpsTimer >= 1000) {
    if (fpsCounter) {
      fpsCounter.innerText = Math.round((frameCount * 1000) / fpsTimer);
    }
    frameCount = 0;
    fpsTimer = 0;
  }

  ctx.clearRect(0, 0, width, height);

  // Expire trail items
  particles = particles.filter(p => !p.isTrail || p.alpha > 0.05);

  // Emit trail on move
  if (pointer.active && pointer.x !== null && trailMode && mouseIsMoving) {
    particles.push(new BlossomParticle(pointer.x, pointer.y, true, 'flower'));
    particles.push(new BlossomParticle(pointer.x + (Math.random() - 0.5) * 15, pointer.y + (Math.random() - 0.5) * 15, true, 'petal'));
    mouseIsMoving = false;
  }

  if (particleCounter) {
    particleCounter.innerText = particles.length;
  }
  
  particles.forEach(p => {
    p.update();
    p.draw();
  });

  requestAnimationFrame(animate);
}

/**
 * Event Listeners
 */

// Track mouse viewport coordinates
window.addEventListener('mousemove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
  
  if (e.clientX !== lastMouseX || e.clientY !== lastMouseY) {
    mouseIsMoving = true;
  }
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener('mouseleave', () => {
  pointer.active = false;
  mouseIsMoving = false;
});

// Mobile viewport track
window.addEventListener('touchstart', (e) => {
  pointer.active = true;
  pointer.x = e.touches[0].clientX;
  pointer.y = e.touches[0].clientY;
  mouseIsMoving = true;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  pointer.x = e.touches[0].clientX;
  pointer.y = e.touches[0].clientY;
  mouseIsMoving = true;
}, { passive: true });

window.addEventListener('touchend', () => {
  pointer.active = false;
  mouseIsMoving = false;
});

// Click Shockwave Burst
window.addEventListener('click', (e) => {
  if (e.target.closest('button') || e.target.closest('a')) return;

  const targetX = e.clientX;
  const targetY = e.clientY;

  for (let i = 0; i < CONFIG.shockwaveCount; i++) {
    const p = new BlossomParticle(targetX, targetY, true);
    const angle = Math.random() * Math.PI * 2;
    const force = Math.random() * 8 + 4;
    p.vx = Math.cos(angle) * force;
    p.vy = Math.sin(angle) * force;
    p.decay = Math.random() * 0.015 + 0.009;
    particles.push(p);
  }
});

// Interactive Parallax Scroll wind effect
let lastScrollY = window.scrollY;
const scrollContainer = document.querySelector('.scroll-container');

if (scrollContainer) {
  scrollContainer.addEventListener('scroll', () => {
    const currentScrollY = scrollContainer.scrollTop;
    const diff = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;
    
    // Scroll motion creates vertical wind gusts pushing the blossoms
    particles.forEach(p => {
      p.vy -= diff * 0.07; // scrolling down pushes them up, up pushes down
      p.vx += (Math.random() - 0.5) * Math.abs(diff) * 0.04;
    });
    
    // Update coordinates of portal circle dynamically since elements scrolled
    updatePortalCoordinates();
  }, { passive: true });
}

// Toggle Trail Physics Mode
if (btnTogglePhysics) {
  btnTogglePhysics.addEventListener('click', () => {
    trailMode = !trailMode;
    
    if (trailMode) {
      btnTogglePhysics.style.background = '';
      btnTogglePhysics.style.borderColor = '';
      btnTogglePhysics.querySelector('span').innerText = 'Toggle Trails';
    } else {
      btnTogglePhysics.style.background = 'rgba(15, 23, 42, 0.1)';
      btnTogglePhysics.style.borderColor = 'rgba(15, 23, 42, 0.3)';
      btnTogglePhysics.querySelector('span').innerText = 'Gravity Funnel';
    }
  });
}

// Wind gust trigger
if (btnExplore) {
  btnExplore.addEventListener('click', () => {
    particles.forEach(p => {
      p.vx += Math.random() * 15 + 10;
      p.vy += (Math.random() - 0.5) * 5;
    });
  });
}

// Coordinate updates when screen changes size
window.addEventListener('resize', () => {
  resizeCanvas();
});

// Initial startup
resizeCanvas();
requestAnimationFrame(animate);
