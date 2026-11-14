/* Recreates the original 8.6-second launch presentation in the WebApp.
 * The Python generator in res/generate-launch-screen.py is the source of truth
 * for geometry, timing, starfield physics and the deterministic random seed.
 */
(function() {
  'use strict';

  var FPS = 30;
  var TOTAL_FRAMES = 258;
  var ANIMATED_FRAME_COUNT = 168;
  var SECTOR_INTERVAL_FRAMES = 9;
  var SECTOR_FADE_FRAMES = 9;
  var SECTOR_PHASE_FRAMES = 72;
  var SETTLE_FRAMES = 36;
  var DOLBY_LOGO_FADE_START_FRAME = 123;
  var DOLBY_LOGO_FADE_IN_FRAMES = 15;

  var FRAME_WIDTH = 1280;
  var FRAME_HEIGHT = 720;
  var STAR_COUNT = 2000;
  var STAR_SPEED = 25.0;
  var STAR_SPEED_PEAK = 30.0;
  var STAR_ACCELERATION_FRAMES = 8;
  var STAR_DECEL_LOG_STRENGTH = 2.5;
  var STAR_TRAIL_MAX_LENGTH = 30.0;
  var STAR_TRAIL_RADIAL_FRACTION = 0.075;
  var STAR_TRAIL_MAX_OPACITY = 0.22;
  var STAR_TRAIL_MIN_SPEED = 0.35;
  var MAX_STAR_DEPTH = 1500.0;
  var STAR_MIN_OPACITY = 0.15;
  var STAR_DEPTH_OPACITY_POWER = 1.3;
  var STARFIELD_SEED = 0x4D4F4F4E;
  var LOGO_CENTER_X = 639.84;
  var LOGO_CENTER_Y = 274.84;

  function createPythonRandom(seed) {
    // CPython random.Random integer seeding + MT19937 random() conversion.
    var mt = new Array(624);
    mt[0] = 19650218;
    for (var i = 1; i < 624; i++) {
      var previous = mt[i - 1];
      mt[i] = (Math.imul(1812433253, previous ^ (previous >>> 30)) + i) >>> 0;
    }

    var key = [seed >>> 0];
    var index = 1;
    var keyIndex = 0;
    for (var k = Math.max(624, key.length); k > 0; k--) {
      var prior = mt[index - 1];
      var mixed = mt[index] ^ Math.imul(prior ^ (prior >>> 30), 1664525);
      mt[index] = (mixed + key[keyIndex] + keyIndex) >>> 0;
      index++;
      keyIndex++;
      if (index >= 624) {
        mt[0] = mt[623];
        index = 1;
      }
      if (keyIndex >= key.length) keyIndex = 0;
    }

    for (var j = 623; j > 0; j--) {
      var priorValue = mt[index - 1];
      var mixedValue = mt[index] ^ Math.imul(priorValue ^ (priorValue >>> 30), 1566083941);
      mt[index] = (mixedValue - index) >>> 0;
      index++;
      if (index >= 624) {
        mt[0] = mt[623];
        index = 1;
      }
    }
    mt[0] = 0x80000000;
    var mtIndex = 624;

    function nextUint32() {
      if (mtIndex >= 624) {
        for (var n = 0; n < 624; n++) {
          var y = (mt[n] & 0x80000000) | (mt[(n + 1) % 624] & 0x7fffffff);
          mt[n] = (mt[(n + 397) % 624] ^ (y >>> 1) ^
            ((y & 1) ? 0x9908b0df : 0)) >>> 0;
        }
        mtIndex = 0;
      }

      var value = mt[mtIndex++];
      value ^= value >>> 11;
      value ^= (value << 7) & 0x9d2c5680;
      value ^= (value << 15) & 0xefc60000;
      value ^= value >>> 18;
      return value >>> 0;
    }

    return function() {
      var high = nextUint32() >>> 5;
      var low = nextUint32() >>> 6;
      return (high * 67108864.0 + low) / 9007199254740992.0;
    };
  }

  function createStarField() {
    var random = createPythonRandom(STARFIELD_SEED);
    var stars = [];

    function randomizePosition(star) {
      var angle = random() * Math.PI * 2.0;
      var distanceRatio = Math.sqrt(random());
      var distance = distanceRatio * (FRAME_WIDTH / 2.0);
      star.x = Math.cos(angle) * distance;
      star.y = Math.sin(angle) * distance;
      star.size = (1.0 - distanceRatio) * 0.1 + 0.5;
    }

    for (var i = 0; i < STAR_COUNT; i++) {
      var star = {
        z: random() * MAX_STAR_DEPTH,
        x: 0,
        y: 0,
        size: 0.5
      };
      randomizePosition(star);
      stars.push(star);
    }

    return {
      stars: stars,
      update: function(speed) {
        for (var i = 0; i < stars.length; i++) {
          var star = stars[i];
          star.z -= speed * (2.0 - star.z / MAX_STAR_DEPTH);
          if (star.z <= 0.0) {
            star.z = MAX_STAR_DEPTH;
            randomizePosition(star);
          }
        }
      }
    };
  }

  function smoothstep(value) {
    value = Math.max(0.0, Math.min(1.0, value));
    return value * value * (3.0 - 2.0 * value);
  }

  function interpolate(start, end, progress) {
    return start + (end - start) * smoothstep(progress);
  }

  function starSpeedForFrame(frameNumber) {
    if (frameNumber <= STAR_ACCELERATION_FRAMES) {
      var accelerationProgress = frameNumber / STAR_ACCELERATION_FRAMES;
      return STAR_SPEED + (STAR_SPEED_PEAK - STAR_SPEED) * smoothstep(accelerationProgress);
    }

    var progress = (frameNumber - STAR_ACCELERATION_FRAMES) /
      (ANIMATED_FRAME_COUNT - 1 - STAR_ACCELERATION_FRAMES);
    progress = Math.max(0.0, Math.min(1.0, progress));
    if (progress >= 1.0) return 0.0;

    var normalizedDecay = Math.log1p(STAR_DECEL_LOG_STRENGTH * progress) /
      Math.log1p(STAR_DECEL_LOG_STRENGTH);
    return STAR_SPEED_PEAK * (1.0 - normalizedDecay);
  }

  function settlingScale(progress) {
    var finalScale = 0.78;
    var oversizedScale = finalScale * 1.15;
    var bounceLowScale = finalScale * 0.93;
    var bounceHighScale = finalScale * 1.06;

    if (progress <= 0.42) {
      return interpolate(oversizedScale, bounceLowScale, progress / 0.42);
    }
    if (progress <= 0.72) {
      return interpolate(bounceLowScale, bounceHighScale, (progress - 0.42) / 0.30);
    }
    return interpolate(bounceHighScale, finalScale, (progress - 0.72) / 0.28);
  }

  function setOpacity(element, value) {
    if (element) element.setAttribute('opacity', value.toFixed(4));
  }

  function startHtmlLaunchSplash(onComplete) {
    if (window._directSmartHubLaunch) return false;

    var overlay = document.getElementById('html-launch-splash');
    var stage = document.getElementById('html-launch-splash-stage');
    var canvas = document.getElementById('html-launch-splash-stars');
    var svg = document.getElementById('html-launch-splash-logo');
    var context = canvas && canvas.getContext ? canvas.getContext('2d') : null;

    if (!overlay || !stage || !canvas || !context || !svg) {
      if (typeof onComplete === 'function') onComplete();
      return false;
    }

    var logoGroup = document.getElementById('html-splash-logo-group');
    var backgroundCircle = document.getElementById('html-splash-background-circle');
    var appName = document.getElementById('html-splash-app-name');
    var dolbyLogo = document.getElementById('html-splash-dolby-logo');
    var sectors = [];
    for (var sectorIndex = 0; sectorIndex < 8; sectorIndex++) {
      sectors.push(document.getElementById('html-splash-sector-' + sectorIndex));
    }

    window._normalLaunchSplashActive = true;
    window._normalLaunchSplashFinished = false;

    function resizeStage() {
      var viewportWidth = window.innerWidth || FRAME_WIDTH;
      var viewportHeight = window.innerHeight || FRAME_HEIGHT;
      var scale = Math.min(viewportWidth / FRAME_WIDTH, viewportHeight / FRAME_HEIGHT);
      stage.style.width = (FRAME_WIDTH * scale) + 'px';
      stage.style.height = (FRAME_HEIGHT * scale) + 'px';
    }

    resizeStage();
    window.addEventListener('resize', resizeStage);

    var starField = createStarField();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    function drawStarField(speed) {
      context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      var speedRatio = Math.min(1.0, Math.max(0.0, speed / STAR_SPEED_PEAK));
      var drawTrails = speed >= STAR_TRAIL_MIN_SPEED;
      var trailOpacity = drawTrails ? STAR_TRAIL_MAX_OPACITY * Math.pow(speedRatio, 1.25) : 0;
      var strokeWidth = 0.60 + 0.35 * speedRatio;
      var projectedStars = [];

      for (var i = 0; i < starField.stars.length; i++) {
        var star = starField.stars[i];
        if (star.z <= 0.0) continue;

        var x = ((star.x / star.z) * FRAME_WIDTH) / 2.0 + LOGO_CENTER_X;
        var y = ((star.y / star.z) * FRAME_HEIGHT) / 2.0 + LOGO_CENTER_Y;
        var radius = (1.0 - star.z / MAX_STAR_DEPTH) * star.size * 3.0;

        if (radius <= 0.02 || x + radius < 0 || x - radius > FRAME_WIDTH ||
            y + radius < 0 || y - radius > FRAME_HEIGHT) {
          continue;
        }

        var depthRatio = 1.0 - star.z / MAX_STAR_DEPTH;
        var starOpacity = STAR_MIN_OPACITY + (1.0 - STAR_MIN_OPACITY) *
          Math.pow(depthRatio, STAR_DEPTH_OPACITY_POWER);
        projectedStars.push({ x: x, y: y, radius: radius, opacity: starOpacity });
      }

      // Batch all trails into one stroke and all star points into one fill,
      // matching the low-overhead Canvas strategy used by the stream transition.
      if (drawTrails) {
        context.beginPath();
        for (var trailIndex = 0; trailIndex < projectedStars.length; trailIndex++) {
          var trailStar = projectedStars[trailIndex];
          var dx = trailStar.x - LOGO_CENTER_X;
          var dy = trailStar.y - LOGO_CENTER_Y;
          var radialDistance = Math.sqrt(dx * dx + dy * dy);
          var trailLength = Math.min(
            STAR_TRAIL_MAX_LENGTH,
            radialDistance * STAR_TRAIL_RADIAL_FRACTION
          ) * speedRatio;

          if (radialDistance > 1.0 && trailLength >= 0.65) {
            var tailX = trailStar.x - (dx / radialDistance) * trailLength;
            var tailY = trailStar.y - (dy / radialDistance) * trailLength;
            context.moveTo(tailX, tailY);
            context.lineTo(trailStar.x, trailStar.y);
          }
        }
        context.globalAlpha = trailOpacity;
        context.strokeStyle = '#ffffff';
        context.lineWidth = strokeWidth;
        context.stroke();
      }

      context.beginPath();
      for (var pointIndex = 0; pointIndex < projectedStars.length; pointIndex++) {
        var point = projectedStars[pointIndex];
        context.moveTo(point.x + point.radius, point.y);
        context.arc(point.x, point.y, point.radius, 0, Math.PI * 2, false);
      }
      context.globalAlpha = 1.0;
      context.fillStyle = '#ffffff';
      context.fill();
      context.globalAlpha = 1.0;
    }

    function drawLogoFrame(frameNumber) {
      var scale;
      var fade;

      if (frameNumber < SECTOR_PHASE_FRAMES) {
        scale = 0.78 * 1.15;
        fade = 0.0;
      } else {
        var settleFrame = frameNumber - SECTOR_PHASE_FRAMES;
        var progress = Math.min(1.0, (settleFrame + 1) / SETTLE_FRAMES);
        scale = settlingScale(progress);
        fade = progress;
      }

      logoGroup.setAttribute(
        'transform',
        'translate(' + LOGO_CENTER_X + ' ' + LOGO_CENTER_Y + ') scale(' +
          scale.toFixed(5) + ') translate(-128 -128)'
      );
      backgroundCircle.setAttribute('fill-opacity', fade.toFixed(4));
      setOpacity(appName, fade);

      var dolbyOpacity = 0.0;
      if (frameNumber >= DOLBY_LOGO_FADE_START_FRAME) {
        var dolbyProgress = Math.min(
          1.0,
          (frameNumber - DOLBY_LOGO_FADE_START_FRAME + 1) / DOLBY_LOGO_FADE_IN_FRAMES
        );
        dolbyOpacity = smoothstep(dolbyProgress);
      }
      setOpacity(dolbyLogo, dolbyOpacity);

      for (var i = 0; i < sectors.length; i++) {
        var startFrame = i * SECTOR_INTERVAL_FRAMES;
        var opacity = frameNumber < startFrame ? 0.0 :
          Math.min(1.0, (frameNumber - startFrame + 1) / SECTOR_FADE_FRAMES);
        setOpacity(sectors[i], opacity);
      }
    }

    var lastRenderedFrame = -1;
    function renderThroughFrame(targetFrame) {
      targetFrame = Math.min(TOTAL_FRAMES - 1, targetFrame);
      for (var frame = lastRenderedFrame + 1; frame <= targetFrame; frame++) {
        if (frame < ANIMATED_FRAME_COUNT) {
          starField.update(starSpeedForFrame(frame));
        }
      }
      lastRenderedFrame = targetFrame;
      var currentSpeed = targetFrame < ANIMATED_FRAME_COUNT
        ? starSpeedForFrame(targetFrame) : 0.0;
      drawStarField(currentSpeed);
      drawLogoFrame(targetFrame);
    }

    var audio = null;
    var durationMs = TOTAL_FRAMES * 1000 / FPS;
    var requestFrame = typeof window.requestAnimationFrame === 'function'
      ? function(callback) { window.requestAnimationFrame(callback); }
      : function(callback) {
        window.setTimeout(function() {
          callback(window.performance && typeof window.performance.now === 'function'
            ? window.performance.now() : Date.now());
        }, 1000 / FPS);
      };
    var playbackRequested = false;
    var animationStarted = false;
    var animationStartMediaTime = 0;
    var fallbackStartTime = 0;
    var usingMediaClock = false;

    function nowMilliseconds() {
      return window.performance && typeof window.performance.now === 'function'
        ? window.performance.now() : Date.now();
    }

    function finishSplash() {
      window.removeEventListener('resize', resizeStage);
      if (audio) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (error) {
          // Audio cleanup must never hold normal startup.
        }
      }
      overlay.classList.remove('is-active');
      window._normalLaunchSplashActive = false;
      window._normalLaunchSplashFinished = true;
      if (typeof onComplete === 'function') onComplete();
    }

    function animationFrame() {
      if (!animationStarted) return;

      var elapsed;
      if (usingMediaClock && audio) {
        elapsed = Math.max(0, (audio.currentTime - animationStartMediaTime) * 1000);
        if (isFinite(audio.duration) && audio.duration > 0) {
          durationMs = Math.max(durationMs, audio.duration * 1000);
        }
      } else {
        elapsed = Math.max(0, nowMilliseconds() - fallbackStartTime);
      }

      if (elapsed >= durationMs || (audio && audio.ended)) {
        renderThroughFrame(TOTAL_FRAMES - 1);
        finishSplash();
        return;
      }

      var targetFrame = Math.floor(elapsed * FPS / 1000);
      if (targetFrame > lastRenderedFrame) renderThroughFrame(targetFrame);
      requestFrame(animationFrame);
    }

    function beginAnimation(useAudioClock) {
      if (animationStarted) return;
      animationStarted = true;
      usingMediaClock = !!useAudioClock && !!audio;
      animationStartMediaTime = usingMediaClock ? audio.currentTime : 0;
      fallbackStartTime = nowMilliseconds();
      renderThroughFrame(0);
      requestFrame(animationFrame);
    }

    function showPreparedStarfield() {
      // Paint the first complete frame while hidden. Only expose the splash once
      // the canvas is ready, so the user never sees an unpainted/late first frame.
      drawStarField(0);
      drawLogoFrame(-1);
      overlay.classList.add('is-active');
    }

    function startAudioPlayback() {
      if (playbackRequested || animationStarted) return;
      playbackRequested = true;

      // Reveal a fully rendered starfield first. The logo timeline starts only
      // when the media element confirms playback, keeping sound and logo aligned.
      showPreparedStarfield();

      if (!audio) {
        beginAnimation(false);
        return;
      }

      var playbackStarted = false;
      function onPlaybackStarted() {
        if (playbackStarted || animationStarted) return;
        playbackStarted = true;
        beginAnimation(true);
      }
      audio.addEventListener('playing', onPlaybackStarted, false);

      try {
        var playResult = audio.play();
        if (playResult && typeof playResult.then === 'function') {
          playResult.then(onPlaybackStarted, function(error) {
            console.warn('[launch_splash.js] Could not autoplay the launch sound:', error);
            beginAnimation(false);
          });
        } else {
          // Older Tizen WebKit may not return a Promise from HTMLMediaElement.play().
          // The playing event remains the preferred synchronization signal.
          if (audio.paused === false) onPlaybackStarted();
        }
      } catch (error) {
        console.warn('[launch_splash.js] Could not start the launch sound:', error);
        beginAnimation(false);
      }
    }

    function startSilentFallback(error) {
      if (playbackRequested || animationStarted) return;
      console.warn('[launch_splash.js] Launch sound could not be prepared:', error);
      showPreparedStarfield();
      beginAnimation(false);
    }

    try {
      audio = new Audio();
      audio.preload = 'auto';
      audio.loop = false;
      audio.addEventListener('canplay', startAudioPlayback, false);
      audio.addEventListener('error', function() {
        startSilentFallback(audio.error || new Error('Audio resource failed to load'));
      }, false);
      audio.src = 'static/res/launch_screen.mp3';
      audio.load();

      // HAVE_FUTURE_DATA is sufficient to begin playback without exposing a
      // blank canvas. Otherwise wait for the media element's canplay event.
      if (audio.readyState >= (audio.HAVE_FUTURE_DATA || 3)) {
        startAudioPlayback();
      }
    } catch (error) {
      startSilentFallback(error);
    }
    return true;
  }

  window.startHtmlLaunchSplash = startHtmlLaunchSplash;
  window._normalLaunchSplashActive = false;
  window._normalLaunchSplashFinished = false;
})();