/* HTML launch splash: reproduces the former 30 fps native video animation. */
(function() {
  'use strict';

  var FPS = 30;
  var TOTAL_FRAMES = 258;
  var LOGO_ANIMATION_FRAMES = 108;
  var ANIMATED_FRAMES = 168;
  var SECTOR_INTERVAL = 9;
  var SECTOR_FADE = 9;
  var SETTLE_FRAMES = 36;
  var STAR_COUNT = 2000;
  var MAX_DEPTH = 1500;
  var STAR_SPEED = 25;
  var STAR_SPEED_PEAK = 30;
  var STAR_ACCELERATION_FRAMES = 8;
  var STAR_DECEL_LOG_STRENGTH = 2.5;
  var STAR_TRAIL_MAX_LENGTH = 30;
  var STAR_TRAIL_RADIAL_FRACTION = 0.075;
  var STAR_TRAIL_MAX_OPACITY = 0.22;
  var STAR_TRAIL_MIN_SPEED = 0.35;
  var STAR_MIN_OPACITY = 0.15;
  var STAR_DEPTH_OPACITY_POWER = 1.3;
  var WIDTH = 1280;
  var HEIGHT = 720;
  var CENTER_X = 639.84;
  var CENTER_Y = 274.84;
  var FINAL_SCALE = 0.78;
  var OVERSIZED_SCALE = FINAL_SCALE * 1.15;
  var BOUNCE_LOW_SCALE = FINAL_SCALE * 0.93;
  var BOUNCE_HIGH_SCALE = FINAL_SCALE * 1.06;
  var DOLBY_START_FRAME = LOGO_ANIMATION_FRAMES + 15;
  var DOLBY_FADE_FRAMES = 15;

  var root = document.getElementById('launch-splash');
  var canvas = document.getElementById('launch-splash-stars');
  var logo = document.getElementById('launch-splash-logo');
  var audio = document.getElementById('launch-splash-audio');
  if (!root || !canvas || !logo) return;

  var context = canvas.getContext('2d');
  if (!context) {
    root.style.display = 'none';
    return;
  }

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // A fixed seed keeps the star composition repeatable between launches.
  var randomState = 0x4D4F4F4E;
  function random() {
    randomState += 0x6D2B79F5;
    var value = randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function createStar() {
    var angle = random() * Math.PI * 2;
    var distanceRatio = Math.sqrt(random());
    return {
      x: Math.cos(angle) * distanceRatio * (WIDTH / 2),
      y: Math.sin(angle) * distanceRatio * (WIDTH / 2),
      z: random() * MAX_DEPTH,
      size: (1 - distanceRatio) * 0.1 + 0.5
    };
  }

  var stars = [];
  for (var i = 0; i < STAR_COUNT; i++) stars.push(createStar());

  function smoothstep(value) {
    value = Math.max(0, Math.min(1, value));
    return value * value * (3 - 2 * value);
  }

  function interpolate(start, end, progress) {
    return start + (end - start) * smoothstep(progress);
  }

  function settlingScale(progress) {
    if (progress <= 0.42) return interpolate(OVERSIZED_SCALE, BOUNCE_LOW_SCALE, progress / 0.42);
    if (progress <= 0.72) return interpolate(BOUNCE_LOW_SCALE, BOUNCE_HIGH_SCALE, (progress - 0.42) / 0.30);
    return interpolate(BOUNCE_HIGH_SCALE, FINAL_SCALE, (progress - 0.72) / 0.28);
  }

  function starSpeed(frame) {
    if (frame <= STAR_ACCELERATION_FRAMES) {
      return STAR_SPEED + (STAR_SPEED_PEAK - STAR_SPEED) *
        smoothstep(frame / STAR_ACCELERATION_FRAMES);
    }
    var progress = (frame - STAR_ACCELERATION_FRAMES) /
      (ANIMATED_FRAMES - 1 - STAR_ACCELERATION_FRAMES);
    progress = Math.max(0, Math.min(1, progress));
    if (progress >= 1) return 0;
    var decay = Math.log1p(STAR_DECEL_LOG_STRENGTH * progress) /
      Math.log1p(STAR_DECEL_LOG_STRENGTH);
    return STAR_SPEED_PEAK * (1 - decay);
  }

  function resetStar(star) {
    var angle = random() * Math.PI * 2;
    var distanceRatio = Math.sqrt(random());
    star.x = Math.cos(angle) * distanceRatio * (WIDTH / 2);
    star.y = Math.sin(angle) * distanceRatio * (WIDTH / 2);
    star.z = MAX_DEPTH;
    star.size = (1 - distanceRatio) * 0.1 + 0.5;
  }

  function drawStars(speed) {
    context.fillStyle = '#000000';
    context.fillRect(0, 0, WIDTH, HEIGHT);

    var speedRatio = Math.min(1, Math.max(0, speed / STAR_SPEED_PEAK));
    var trails = speed >= STAR_TRAIL_MIN_SPEED;
    var trailOpacity = STAR_TRAIL_MAX_OPACITY * Math.pow(speedRatio, 1.25);
    var strokeWidth = 0.60 + 0.35 * speedRatio;

    context.beginPath();
    for (var i = 0; i < stars.length; i++) {
      var star = stars[i];
      star.z -= speed * (2 - star.z / MAX_DEPTH);
      if (star.z <= 0) resetStar(star);

      var x = ((star.x / star.z) * WIDTH) / 2 + CENTER_X;
      var y = ((star.y / star.z) * HEIGHT) / 2 + CENTER_Y;
      var radius = (1 - star.z / MAX_DEPTH) * star.size * 3;
      if (radius <= 0.02 || x + radius < 0 || x - radius > WIDTH ||
          y + radius < 0 || y - radius > HEIGHT) continue;

      var depthRatio = 1 - star.z / MAX_DEPTH;
      var opacity = STAR_MIN_OPACITY + (1 - STAR_MIN_OPACITY) *
        Math.pow(depthRatio, STAR_DEPTH_OPACITY_POWER);

      if (trails) {
        var dx = x - CENTER_X;
        var dy = y - CENTER_Y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        var length = Math.min(STAR_TRAIL_MAX_LENGTH,
          distance * STAR_TRAIL_RADIAL_FRACTION) * speedRatio;
        if (distance > 1 && length >= 0.65) {
          context.moveTo(x - dx / distance * length, y - dy / distance * length);
          context.lineTo(x, y);
        }
      }
    }

    if (trails) {
      context.strokeStyle = 'rgba(255,255,255,' + trailOpacity + ')';
      context.lineWidth = strokeWidth;
      context.lineCap = 'round';
      context.stroke();
    }

    context.beginPath();
    for (var j = 0; j < stars.length; j++) {
      var point = stars[j];
      var px = ((point.x / point.z) * WIDTH) / 2 + CENTER_X;
      var py = ((point.y / point.z) * HEIGHT) / 2 + CENTER_Y;
      var pr = (1 - point.z / MAX_DEPTH) * point.size * 3;
      if (pr > 0.02 && px + pr >= 0 && px - pr <= WIDTH &&
          py + pr >= 0 && py - pr <= HEIGHT) {
        context.moveTo(px + pr, py);
        context.arc(px, py, pr, 0, Math.PI * 2);
      }
    }
    context.fillStyle = '#ffffff';
    context.fill();
  }

  var sectors = [];
  for (var sectorIndex = 0; sectorIndex < 8; sectorIndex++) {
    sectors.push(logo.querySelector('#sector-' + sectorIndex));
  }
  var backgroundCircle = logo.querySelector('#background-circle');
  var appName = logo.querySelector('#app-name');
  var dolbyLogo = logo.querySelector('#dolby-logo');
  var startedAt = null;
  var lastDrawAt = 0;
  var frameHandle = null;
  var finished = false;

  function render(timestamp) {
    if (finished) return;
    if (startedAt === null) startedAt = timestamp;
    var elapsed = Math.max(0, timestamp - startedAt);
    var frame = Math.min(TOTAL_FRAMES - 1, Math.floor(elapsed * FPS / 1000));

    // Keep the canvas at the original 30 fps cadence; the browser may present
    // the same frame more than once on 50/60 Hz television panels.
    if (elapsed - lastDrawAt >= 1000 / FPS - 1) {
      lastDrawAt = elapsed;
      var speed = frame < ANIMATED_FRAMES ? starSpeed(frame) : 0;
      if (frame < ANIMATED_FRAMES) drawStars(speed);
      else if (frame === ANIMATED_FRAMES) drawStars(0);
    }

    for (var i = 0; i < sectors.length; i++) {
      var sector = sectors[i];
      if (!sector) continue;
      var sectorStart = i * SECTOR_INTERVAL;
      var opacity = frame < sectorStart ? 0 :
        Math.min(1, (frame - sectorStart + 1) / SECTOR_FADE);
      sector.style.opacity = opacity.toFixed(4);
    }

    var settleProgress = frame < LOGO_ANIMATION_FRAMES ? 0 :
      Math.min(1, (frame - LOGO_ANIMATION_FRAMES + 1) / SETTLE_FRAMES);
    var scale = frame < LOGO_ANIMATION_FRAMES
      ? OVERSIZED_SCALE : settlingScale(settleProgress);
    logo.querySelector('#logo-group').setAttribute('transform',
      'translate(' + CENTER_X + ' ' + CENTER_Y + ') scale(' +
      scale.toFixed(5) + ') translate(-128 -128)');
    if (backgroundCircle) backgroundCircle.style.opacity = settleProgress.toFixed(4);
    if (appName) appName.style.opacity = settleProgress.toFixed(4);

    var dolbyProgress = frame < DOLBY_START_FRAME ? 0 :
      Math.min(1, (frame - DOLBY_START_FRAME + 1) / DOLBY_FADE_FRAMES);
    if (dolbyLogo) dolbyLogo.style.opacity = smoothstep(dolbyProgress).toFixed(4);

    if (elapsed >= TOTAL_FRAMES * 1000 / FPS) {
      finished = true;
      root.style.display = 'none';
      if (audio) {
        try { audio.pause(); } catch (ignore) {}
      }
      if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
      return;
    }
    frameHandle = window.requestAnimationFrame(render);
  }

  if (audio) {
    audio.volume = 1;
    var playResult = audio.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(function(error) {
        console.warn('[launch-splash] Startup audio playback was blocked:', error);
      });
    }
  }

  // Render the first black/starfield frame before starting the timed sequence.
  drawStars(STAR_SPEED);
  frameHandle = window.requestAnimationFrame(render);
})();
