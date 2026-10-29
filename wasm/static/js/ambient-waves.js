/*
 * Ambient wave background for Moonlight Tizen.
 * Original CodePen wave geometry, rendered to canvas and animated with GSAP.
 * GSAP is vendored locally in static/js/gsap.min.js.
 */
(function () {
  'use strict';

  var wrapper = document.getElementById('ambient-trails');
  var canvas = document.getElementById('ambient-wave-canvas');
  var layer = document.getElementById('main-ui-layer');
  if (!wrapper || !canvas || !layer || !canvas.getContext || !window.gsap || !window.Path2D) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var gsap = window.gsap;
  var random = gsap.utils.random;
  var width = 0;
  var height = 0;
  var active = false;
  var accent = '0, 163, 198';
  var horizontalGradient = null;
  var waves = [];
  var pathRight = new Path2D("m1920 538.5 8.6-.4h8.6l8.6.3 4.3.3 4.3.4c11.4 1.1 22.8 2.9 34 5.4 22.5 5 44.3 12.4 65.6 21a730.8 730.8 0 0 1 62.3 28.7c20.3 10.3 40.3 21 60.2 31.7l29.8 15.9c9.9 5.2 19.9 10.3 29.9 15.3a727 727 0 0 0 60.7 27.2 360.6 360.6 0 0 0 62.6 18.3c10.6 2 21.2 3.4 31.8 4l8 .3 7.7-.1c2.6-.2 5.1-.2 7.7-.5l3.9-.4 1.9-.2 1.9-.3a177 177 0 0 0 30.8-7.4c10.2-3.3 20.2-7.5 30.1-12.1a448 448 0 0 0 57.5-33.2c37.2-24.9 72.1-53.7 106.7-82.8 34.6-29.1 68.7-59.1 105.7-85.8 9.3-6.6 18.7-13.1 28.5-19.1 9.8-6.1 19.8-11.7 30.3-16.7s21.3-9.4 32.7-12.6c11.4-3.2 23.2-5.3 35.3-5.7 12.1-.3 24.2 1.1 35.8 3.7 11.7 2.6 23 6.4 33.8 11 21.8 9.1 42 20.9 61.2 33.7 9.6 6.4 19 13.1 28.2 20a934 934 0 0 1 27.1 21.1c17.8 14.3 35.1 29 52.4 43.6 34.6 29.2 68.9 58.3 104.9 83.9 9 6.4 18.2 12.5 27.4 18.3 9.3 5.8 18.7 11.2 28.2 16.1 19.1 9.7 39 17.4 59 20.9l3.8.6 3.8.5 7.5.7 3.8.1 3.8.1h5.9l2-.1a243.7 243.7 0 0 0 63-10.6 388 388 0 0 0 31-10.3 706.6 706.6 0 0 0 60.9-26.6c20.1-9.8 40-20.3 60-30.8 20-10.6 40-21.2 60.4-31.4a875.4 875.4 0 0 1 62.3-28.5 430.2 430.2 0 0 1 65.5-20.9c11.2-2.5 22.6-4.3 34-5.5l4.3-.4 4.3-.3 8.6-.4 4.3-.1h4.3c2.9 0 5.7.2 8.6.3v3c-22.5 1.4-44.5 6-65.7 12.8a449 449 0 0 0-61.8 25.5c-40.1 19.7-78.4 43.3-117.4 66.4a1413.4 1413.4 0 0 1-59.3 33.9 675.1 675.1 0 0 1-62.4 29.9c-21.5 8.8-44 16.3-67.5 20.8a250.2 250.2 0 0 1-35.8 4.5l-2.3.1-2.3.1-4.6.1h-4.7l-4.7-.1-9.4-.7-4.6-.6-4.6-.7c-12.3-2-24.2-5.3-35.6-9.4-11.4-4.1-22.4-9-32.9-14.5a454.2 454.2 0 0 1-59.3-37.5c-37.3-27.5-71.2-58-105.1-88-16.9-15-33.8-30-50.8-44.5a845.7 845.7 0 0 0-52.2-41.8c-8.9-6.5-18-12.8-27.3-18.7a297 297 0 0 0-28.5-16.1c-9.7-4.7-19.7-8.8-30-11.8a128 128 0 0 0-31.2-5.2c-21.1-.5-42.6 4.8-62.9 13.4-20.3 8.6-39.7 20-58.2 32.6a590.9 590.9 0 0 0-27.3 19.7l-13.3 10.4-13.1 10.6a1788.2 1788.2 0 0 0-51.4 44.2c-33.9 29.9-67.2 60.8-103.3 89-18.1 14-37 27.3-57.5 38.7a267 267 0 0 1-31.9 15.2 191.4 191.4 0 0 1-34.6 10.1l-2.2.4-2.3.3-4.5.7-9.2 1-4.6.2c-1.5 0-3.1.2-4.6.1l-9-.1c-12-.3-23.9-1.6-35.5-3.7a340 340 0 0 1-67.4-19.9 674.5 674.5 0 0 1-62.6-29.3c-10.1-5.3-20.1-10.9-30-16.5l-14.8-8.5-14.7-8.6c-39.1-22.9-77.5-46.3-117.6-66.1-20-9.8-40.6-18.7-61.8-25.5a279.8 279.8 0 0 0-65.6-13.2v-2.9z");
  var pathLeft = new Path2D("m0 538.5 8.6-.4h8.6l8.6.3 4.3.3 4.3.4c11.4 1.1 22.8 2.9 34 5.4 22.5 5 44.3 12.4 65.6 21a730.8 730.8 0 0 1 62.3 28.7c20.3 10.3 40.3 21 60.2 31.7l29.8 15.9c9.9 5.2 19.9 10.3 29.9 15.3a727 727 0 0 0 60.7 27.2 360.6 360.6 0 0 0 62.6 18.3c10.6 2 21.2 3.4 31.8 4l8 .3 7.7-.1c2.6-.2 5.1-.2 7.7-.5l3.9-.4 1.9-.2 1.9-.3a177 177 0 0 0 30.8-7.4c10.2-3.3 20.2-7.5 30.1-12.1a448 448 0 0 0 57.5-33.2c37.2-24.9 72.1-53.7 106.7-82.8 34.6-29.1 68.7-59.1 105.7-85.8 9.3-6.6 18.7-13.1 28.5-19.1 9.8-6.1 19.8-11.7 30.3-16.7s21.3-9.4 32.7-12.6c11.4-3.2 23.2-5.3 35.3-5.7 12.1-.3 24.2 1.1 35.8 3.7 11.7 2.6 23 6.4 33.8 11 21.8 9.1 42 20.9 61.2 33.7 9.6 6.4 19 13.1 28.2 20a934 934 0 0 1 27.1 21.1c17.8 14.3 35.1 29 52.4 43.6 34.6 29.2 68.9 58.3 104.9 83.9 9 6.4 18.2 12.5 27.4 18.3 9.3 5.8 18.7 11.2 28.2 16.1 19.1 9.7 39 17.4 59 20.9l3.8.6 3.8.5 7.5.7 3.8.1 3.8.1h5.9l2-.1a243.7 243.7 0 0 0 63-10.6 388 388 0 0 0 31-10.3 706.6 706.6 0 0 0 60.9-26.6c20.1-9.8 40-20.3 60-30.8 20-10.6 40-21.2 60.4-31.4a875.4 875.4 0 0 1 62.3-28.5 430.2 430.2 0 0 1 65.5-20.9c11.2-2.5 22.6-4.3 34-5.5l4.3-.4 4.3-.3 8.6-.4 4.3-.1h4.3c2.9 0 5.7.2 8.6.3v3c-22.5 1.4-44.5 6-65.7 12.8a449 449 0 0 0-61.8 25.5c-40.1 19.7-78.4 43.3-117.4 66.4a1413.4 1413.4 0 0 1-59.3 33.9 675.1 675.1 0 0 1-62.4 29.9c-21.5 8.8-44 16.3-67.5 20.8a250.2 250.2 0 0 1-35.8 4.5l-2.3.1-2.3.1-4.6.1h-4.7l-4.7-.1-9.4-.7-4.6-.6-4.6-.7c-12.3-2-24.2-5.3-35.6-9.4-11.4-4.1-22.4-9-32.9-14.5a454.2 454.2 0 0 1-59.3-37.5c-37.3-27.5-71.2-58-105.1-88-16.9-15-33.8-30-50.8-44.5a845.7 845.7 0 0 0-52.2-41.8c-8.9-6.5-18-12.8-27.3-18.7a297 297 0 0 0-28.5-16.1c-9.7-4.7-19.7-8.8-30-11.8a128 128 0 0 0-31.2-5.2c-21.1-.5-42.6 4.8-62.9 13.4-20.3 8.6-39.7 20-58.2 32.6a590.9 590.9 0 0 0-27.3 19.7l-13.3 10.4-13.1 10.6a1788.2 1788.2 0 0 0-51.4 44.2c-33.9 29.9-67.2 60.8-103.3 89-18.1 14-37 27.3-57.5 38.7a267 267 0 0 1-31.9 15.2 191.4 191.4 0 0 1-34.6 10.1l-2.2.4-2.3.3-4.5.7-9.2 1-4.6.2c-1.5 0-3.1.2-4.6.1l-9-.1c-12-.3-23.9-1.6-35.5-3.7a340 340 0 0 1-67.4-19.9 674.5 674.5 0 0 1-62.6-29.3c-10.1-5.3-20.1-10.9-30-16.5l-14.8-8.5-14.7-8.6c-39.1-22.9-77.5-46.3-117.6-66.1-20-9.8-40.6-18.7-61.8-25.5A278.2 278.2 0 0 0 0 541.5v-3z");

  function updateGradient() {
    if (!width || !height) {
      horizontalGradient = null;
      return;
    }
    var gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(' + accent + ', 0)');
    gradient.addColorStop(0.18, 'rgba(' + accent + ', 0.18)');
    gradient.addColorStop(0.35, 'rgba(' + accent + ', 0.72)');
    gradient.addColorStop(0.5, 'rgba(' + accent + ', 1)');
    gradient.addColorStop(0.65, 'rgba(' + accent + ', 0.72)');
    gradient.addColorStop(0.82, 'rgba(' + accent + ', 0.18)');
    gradient.addColorStop(1, 'rgba(' + accent + ', 0)');
    horizontalGradient = gradient;
  }

  function readAccent() {
    var value = getComputedStyle(document.body).getPropertyValue('--theme-accent').trim();
    var match;
    var previousAccent = accent;
    if ((match = /^#([0-9a-f]{3})$/i.exec(value))) {
      accent = parseInt(match[1][0] + match[1][0], 16) + ', ' +
        parseInt(match[1][1] + match[1][1], 16) + ', ' +
        parseInt(match[1][2] + match[1][2], 16);
    } else if ((match = /^#([0-9a-f]{6})$/i.exec(value))) {
      accent = parseInt(value.slice(1, 3), 16) + ', ' +
        parseInt(value.slice(3, 5), 16) + ', ' +
        parseInt(value.slice(5, 7), 16);
    } else if ((match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value))) {
      accent = match[1] + ', ' + match[2] + ', ' + match[3];
    }
    if (accent !== previousAccent) updateGradient();
  }

  function resize() {
    var rect = wrapper.getBoundingClientRect();
    var nextWidth = Math.max(1, Math.round(rect.width));
    var nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    canvas.width = width;
    canvas.height = height;
    updateGradient();
  }

  function makeWave(index) {
    var duration = random(40, 80);
    var y = random(-250, 250);
    var rotation = random(-20, 20);
    var scaleXFrom = random(2, 2.5);
    var scaleXTo = random(1.5, 1.75);
    var scaleYFrom = random(1.5, 2);
    var scaleYTo = random(0.6, 0.7);
    /* Start with six clearly separated depth levels. The first three
       begin fading down while the last three begin fading up. */
    var opacityFrom = [0.95, 0.80, 0.65, 0.35, 0.20, 0.10][index];
    var opacityTo = [0.20, 0.35, 0.45, 0.65, 0.80, 0.95][index];
    var ease = random(['power2.inOut', 'power3.inOut', 'power4.inOut', 'sine.inOut']);
    var wave = {
      index: index,
      x: 0,
      y: y,
      rotation: rotation,
      scaleX: scaleXFrom,
      scaleY: scaleYFrom,
      opacity: opacityFrom
    };
    var timeline = gsap.timeline();

    timeline.to(wave, {
      x: -1920,
      duration: duration,
      ease: 'none',
      repeat: -1
    });

    timeline.fromTo(wave, {
      y: y,
      rotation: rotation,
      scaleY: scaleYFrom,
      scaleX: scaleXFrom
    }, {
      y: y * -1,
      rotation: rotation * -1,
      scaleY: scaleYTo,
      scaleX: scaleXTo,
      repeat: -1,
      yoyo: true,
      yoyoEase: ease,
      duration: duration * 0.25,
      ease: ease
    }, 0);

    /* Opposing opacity phases make the depth shift immediately visible.
       Each ribbon keeps its own duration and a short staggered start. */
    gsap.fromTo(wave, {
      opacity: opacityFrom
    }, {
      opacity: opacityTo,
      duration: random(8, 12),
      delay: index * 1.25,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });

    timeline.seek(random(10, 20));
    return wave;
  }

  function drawWave(wave) {
    var sx = width / 1920;
    var sy = height / 1080;
    var centerX = width * 0.5;
    var centerY = height * 0.5 + wave.y * sy;
    var offsetX = wave.x * sx;
    var rotation = wave.rotation * Math.PI / 180;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.scale(wave.scaleX, wave.scaleY);
    ctx.translate(-centerX, -centerY);
    /* Keep the original animation's opacity values while making the effect
       subtle enough to sit behind the application UI. */
    ctx.globalAlpha = wave.opacity * 0.09;
    ctx.fillStyle = horizontalGradient || 'rgb(' + accent + ')';

    for (var repeat = -1; repeat <= 2; repeat++) {
      ctx.save();
      ctx.translate(offsetX + repeat * width, 0);
      ctx.scale(sx, sy);
      ctx.fill(pathLeft);
      ctx.fill(pathRight);
      ctx.restore();
    }
    ctx.restore();
  }

  function render() {
    if (!active || document.hidden) return;
    if (!width || !height) resize();
    ctx.clearRect(0, 0, width, height);
    for (var i = 0; i < waves.length; i++) drawWave(waves[i]);
  }

  function start() {
    if (active) return;
    active = true;
    readAccent();
    resize();
    if (!waves.length) {
      for (var i = 0; i < 6; i++) waves.push(makeWave(i));
    }
    gsap.ticker.add(render);
    render();
  }

  function stop() {
    if (!active) return;
    active = false;
    gsap.ticker.remove(render);
    ctx.clearRect(0, 0, width, height);
  }

  function sync() {
    var shouldRun = layer.classList.contains('ambient-trails-active') && !document.hidden;
    if (shouldRun) start();
    else stop();
    readAccent();
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe(layer, { attributes: true, attributeFilter: ['class', 'style'] });
  new MutationObserver(readAccent).observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-color-theme']
  });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(wrapper);
  sync();
}());
