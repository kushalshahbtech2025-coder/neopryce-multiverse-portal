/**
 * NeoPryce Multiverse Visual Graphics & Animation Engine
 * Calibrated for smooth, subtle, high-performance UI motion.
 */

window.GraphicsEffects = (function () {
  let audioCtx = null;
  let audioEnabled = false; // Default off for smooth experience
  let canvas, ctx, particles = [];

  document.addEventListener('DOMContentLoaded', () => {
    initIntroSequence();
    initRoamingBot();
    initParticleCanvas();
    init3DTiltCards();
    initSoundToggle();
    initLenisSmoothScroll();
    initGSAPAnimations();
  });

  /**
   * Lenis Kinetic Smooth Scrolling Integration
   */
  function initLenisSmoothScroll() {
    if (typeof Lenis !== 'undefined') {
      const lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true
      });
      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    }
  }

  /**
   * GSAP Card Entrance & Kinetic Motion Choreography
   */
  function initGSAPAnimations() {
    if (typeof gsap !== 'undefined') {
      gsap.from(".neo-panel", {
        duration: 0.7,
        y: 18,
        opacity: 0.85,
        stagger: 0.08,
        ease: "power2.out"
      });
    }
  }

  /**
   * 1. Intro Sequence - Instant Action Multiverse Landing
   */
  function initIntroSequence() {
    const loader = document.getElementById('intro-portal-loader');
    if (!loader) return;

    const enterBtn = document.getElementById('enter-portal-btn');
    if (enterBtn) {
      enterBtn.addEventListener('click', () => {
        getAudioContext();
        playWarpSound();
        triggerPortalWarpOut(loader);
      });
    }
  }

  function triggerPortalWarpOut(loader) {
    if (!loader) return;
    loader.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    loader.style.opacity = '0';
    loader.style.transform = 'scale(1.08)';
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500);
  }

  /**
   * Roaming Cartoon Spider Bot Companion
   * Wanders across the screen with speech bubbles, reacts to clicks
   */
  function initRoamingBot() {
    const bot = document.getElementById('roaming-bot-companion');
    const bubble = document.getElementById('roaming-bot-bubble');
    if (!bot) return;

    const dialogues = [
      "🕷️ Scanning multiverse for price drops...",
      "⚡ ASUS TUF A16 detected with 38% price glitch!",
      "🔍 Checking fake MSRP discounts in real-time...",
      "🌐 Scraping Amazon, Croma & ASUS Store...",
      "🎯 Linear regression price forecast: STRONG BUY",
      "🤖 Quantum price tracking web is active!",
      "🛒 Click ENTER to start monitoring deals!"
    ];

    // Perimeter zones so the bot roams the edges and NEVER stops in the middle
    const getNextPerimeterPoint = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Define 8 outer patrol areas around the screen perimeter
      const zones = [
        // Top-Left corner
        { minX: 40, maxX: Math.max(120, w * 0.22), minY: 40, maxY: Math.max(100, h * 0.22) },
        // Top-Right corner
        { minX: w * 0.76, maxX: w - 120, minY: 40, maxY: Math.max(100, h * 0.22) },
        // Left wall
        { minX: 30, maxX: Math.max(100, w * 0.18), minY: h * 0.35, maxY: h * 0.68 },
        // Right wall
        { minX: w * 0.80, maxX: w - 110, minY: h * 0.35, maxY: h * 0.68 },
        // Bottom-Left corner
        { minX: 40, maxX: Math.max(120, w * 0.25), minY: h * 0.76, maxY: h - 140 },
        // Bottom-Right corner
        { minX: w * 0.74, maxX: w - 120, minY: h * 0.76, maxY: h - 140 },
        // Top edge strip
        { minX: w * 0.30, maxX: w * 0.70, minY: 25, maxY: Math.max(60, h * 0.12) },
        // Bottom edge strip
        { minX: w * 0.30, maxX: w * 0.70, minY: h - 130, maxY: h - 90 }
      ];

      // Pick a random perimeter zone
      const zone = zones[Math.floor(Math.random() * zones.length)];
      let x = Math.random() * (zone.maxX - zone.minX) + zone.minX;
      let y = Math.random() * (zone.maxY - zone.minY) + zone.minY;

      // Strict Middle Exclusion Check (Safety Box around center hero card)
      const centerX = w / 2;
      const centerY = h / 2;
      const boxW = Math.max(340, w * 0.28);
      const boxH = Math.max(360, h * 0.38);

      if (x > (centerX - boxW) && x < (centerX + boxW) && y > (centerY - boxH) && y < (centerY + boxH)) {
        // Push outward to the perimeter
        x = x < centerX ? Math.max(40, centerX - (boxW + 60)) : Math.min(w - 120, centerX + (boxW + 60));
        y = y < centerY ? Math.max(40, centerY - (boxH + 50)) : Math.min(h - 130, centerY + (boxH + 50));
      }

      // Bound strictly to window
      x = Math.max(30, Math.min(w - 120, x));
      y = Math.max(30, Math.min(h - 130, y));

      return { x, y };
    };

    // Initial position in safe top-left corner
    const initialPos = getNextPerimeterPoint();
    let currentX = initialPos.x;
    let currentY = initialPos.y;

    bot.style.left = `${currentX}px`;
    bot.style.top = `${currentY}px`;

    // Move bot smoothly along the perimeter
    function roamNext() {
      const nextPos = getNextPerimeterPoint();
      const targetX = nextPos.x;
      const targetY = nextPos.y;

      // Tilt slightly in movement direction
      const angle = targetX > currentX ? 6 : -6;
      bot.style.transform = `rotate(${angle}deg)`;

      bot.style.left = `${targetX}px`;
      bot.style.top = `${targetY}px`;

      currentX = targetX;
      currentY = targetY;

      // Update speech bubble text periodically
      if (bubble && Math.random() > 0.35) {
        const nextText = dialogues[Math.floor(Math.random() * dialogues.length)];
        bubble.innerText = nextText;
      }
    }

    // Roam every 3.2 seconds
    const roamInterval = setInterval(roamNext, 3200);

    // Interactive click trick
    bot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (audioEnabled) playSynthBeep(880, 0.1);
      bot.style.transform = 'rotate(360deg) scale(1.3)';
      if (bubble) {
        bubble.innerText = "✨ Wheee! Quantum warp node calibrated! 🚀";
      }
      setTimeout(() => {
        bot.style.transform = 'scale(1)';
        roamNext();
      }, 700);
    });
  }

  function triggerPortalWarpOut(loaderEl) {
    if (!loaderEl) return;
    try { playWarpSound(); } catch (e) {}
    loaderEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    loaderEl.style.opacity = '0';
    loaderEl.style.transform = 'scale(1.08)';
    setTimeout(() => {
      loaderEl.style.display = 'none';
    }, 400);
  }

  function manualWarpDimension() {
    const loader = document.getElementById('intro-portal-loader');
    if (!loader) return;

    loader.style.display = 'flex';
    loader.classList.remove('portal-warp-exit');
    initIntroSequence();
  }

  /**
   * 2. Calm Ambient Particle Canvas Background
   */
  function initParticleCanvas() {
    canvas = document.getElementById('speed-lines-canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);

    // 20 calm ambient particles moving slowly
    particles = [];
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * canvas.width,
        size: Math.random() * 1.5 + 1,
        color: i % 2 === 0 ? '#ff00ff' : '#00e3fd',
        speed: Math.random() * 0.8 + 0.3
      });
    }

    animateCanvas();
  }

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function animateCanvas() {
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    particles.forEach(p => {
      p.z -= p.speed;
      if (p.z <= 0) p.z = canvas.width;

      const k = 200 / p.z;
      const px = (p.x - cx) * k + cx;
      const py = (p.y - cy) * k + cy;

      if (px >= 0 && px <= canvas.width && py >= 0 && py <= canvas.height) {
        const size = p.size * k * 0.5;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    });

    requestAnimationFrame(animateCanvas);
  }

  /**
   * 3. Subtle & Controlled 3D Mouse Parallax
   */
  function init3DTiltCards() {
    document.addEventListener('mousemove', (e) => {
      const cards = document.querySelectorAll('.bg-surface-container');

      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          const cardX = e.clientX - (rect.left + rect.width / 2);
          const cardY = e.clientY - (rect.top + rect.height / 2);

          if (Math.abs(cardX) < rect.width / 2 && Math.abs(cardY) < rect.height / 2) {
            // Toned down to max 2.5 degrees tilt for smooth, stable interaction
            const rotX = Math.max(-2.5, Math.min(2.5, -(cardY / rect.height) * 4));
            const rotY = Math.max(-2.5, Math.min(2.5, (cardX / rect.width) * 4));
            card.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(1)}deg) rotateY(${rotY.toFixed(1)}deg) translateY(-3px)`;
            card.style.boxShadow = `4px 6px 0px 0px #ff00ff`;
          } else {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
            card.style.boxShadow = '';
          }
        }
      });
    });
  }

  /**
   * 4. Web Audio Synthesizer Controls
   */
  let audioCtx = null;
  let audioEnabled = true; // Default ON for rich cyberpunk audio feedback
  let canvas, ctx, particles = [];

  document.addEventListener('DOMContentLoaded', () => {
    initIntroSequence();
    initRoamingBot();
    initParticleCanvas();
    init3DTiltCards();
    initSoundToggle();

    // Global listener: unlock audio context & play synth audio on ANY button or tab click
    document.addEventListener('click', (e) => {
      getAudioContext();
      const interactive = e.target.closest('button, a, .nav-tab, [data-target-tab], [onclick]');
      if (interactive) {
        playSynthBeep(720, 0.08);
      }
    });
  });

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSynthBeep(freq = 750, duration = 0.09) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.45, ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playWarpSound() {
    if (!audioEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
  }

  function initSoundToggle() {
    const btn = document.getElementById('sound-toggle-btn');
    if (!btn) return;

    btn.innerText = audioEnabled ? '🔊 AUDIO ON' : '🔇 AUDIO OFF';
    btn.className = `font-label-mono text-xs px-2 py-1 comic-border ${audioEnabled ? 'bg-tertiary text-black' : 'bg-surface-container-highest text-on-surface-variant'}`;

    btn.addEventListener('click', () => {
      audioEnabled = !audioEnabled;
      btn.innerText = audioEnabled ? '🔊 AUDIO ON' : '🔇 AUDIO OFF';
      btn.className = `font-label-mono text-xs px-2 py-1 comic-border ${audioEnabled ? 'bg-tertiary text-black' : 'bg-surface-container-highest text-on-surface-variant'}`;
      if (audioEnabled) playSynthBeep(650, 0.08);
    });
  }

  return {
    manualWarpDimension,
    playSynthBeep,
    playWarpSound
  };
})();
