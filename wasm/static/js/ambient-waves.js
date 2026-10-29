/*
 * Ambient wave background for Moonlight Tizen.
 * Animation is driven by GSAP; drawing is performed on canvas (no SVG).
 * GSAP is vendored locally in static/js/gsap.min.js.
 */
(function () {
  'use strict';

  var wrapper = document.getElementById('ambient-trails');
  var canvas = document.getElementById('ambient-wave-canvas');
  var layer = document.getElementById('main-ui-layer');
  if (!wrapper || !canvas || !layer || !canvas.getContext || !window.gsap) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var width = 0;
  var height = 0;
  var active = false;
  var accent = '0, 163, 198';
  var lines = [];
  var gsap = window.gsap;
  var random = gsap.utils.random;

  function readAccent() {
    var value = getComputedStyle(document.body).getPropertyValue('--theme-accent').trim();
    var match;
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
  }

  function makeLine(index) {
    var duration = random(40, 80);
    var line = {
      index: index,
      y: random(-0.18, 0.18),
      rotation: random(-0.035, 0.035),
      scaleX: random(1.7, 2.25),
      scaleY: random(0.65, 1.15),
      opacity: random(0.18, 0.29),
      phase: random(0, Math.PI * 2),
      amplitude: random(0.035, 0.095),
      frequency: random(1.05, 1.75),
      thickness: random(1.1, 2.1),
      duration: duration
    };
    var ease = random(['power2.inOut', 'power3.inOut', 'power4.inOut', 'sine.inOut']);

    gsap.to(line, {
      phase: Math.PI * 2,
      duration: duration,
      ease: 'none',
      repeat: -1
    });

    gsap.fromTo(line, {
      y: line.y,
      opacity: random(0.18, 0.27),
      rotation: line.rotation,
      scaleX: line.scaleX,
      scaleY: random(1.15, 1.6)
    }, {
      y: -line.y,
      opacity: random(0.22, 0.34),
      rotation: -line.rotation,
      scaleX: random(1.25, 1.7),
      scaleY: random(0.55, 0.78),
      duration: duration * 0.25,
      ease: ease,
      repeat: -1,
      yoyo: true,
      yoyoEase: ease
    });

    return line;
  }

  function drawLine(line) {
    var centerY = height * (0.61 + line.index * 0.075 + line.y);
    var amplitude = height * line.amplitude * line.scaleY;
    var frequency = line.frequency * Math.PI * 2 / Math.max(1, width);
    var phase = line.phase;
    var rotation = line.rotation;
    var x;
    var y;
    var step = width > 1600 ? 5 : 3;

    ctx.save();
    ctx.translate(width * 0.5, centerY);
    ctx.rotate(rotation);
    ctx.scale(line.scaleX, 1);
    ctx.translate(-width * 0.5, -centerY);
    ctx.beginPath();

    for (x = -width * 0.1; x <= width * 1.1; x += step) {
      var normalized = x / Math.max(1, width);
      y = centerY +
        Math.sin(normalized * Math.PI * 2 * line.frequency + phase) * amplitude +
        Math.sin(normalized * Math.PI * 4 * line.frequency - phase * 0.63) * amplitude * 0.26;
      if (x <= -width * 0.1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = 'rgba(' + accent + ',' + line.opacity + ')';
    ctx.lineWidth = line.thickness;
    ctx.stroke();

    /* A second, slightly offset trace creates the layered trail appearance. */
    ctx.beginPath();
    for (x = -width * 0.1; x <= width * 1.1; x += step) {
      var n = x / Math.max(1, width);
      y = centerY + height * 0.012 +
        Math.sin(n * Math.PI * 2 * line.frequency + phase - 0.42) * amplitude * 0.88 +
        Math.sin(n * Math.PI * 4 * line.frequency - phase * 0.52) * amplitude * 0.2;
      if (x <= -width * 0.1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(' + accent + ',' + (line.opacity * 0.52) + ')';
    ctx.lineWidth = Math.max(1, line.thickness * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    if (!active || document.hidden) return;
    if (!width || !height) resize();
    ctx.clearRect(0, 0, width, height);
    for (var i = 0; i < lines.length; i++) drawLine(lines[i]);
  }

  function start() {
    if (active) return;
    active = true;
    readAccent();
    resize();
    if (!lines.length) {
      for (var i = 0; i < 4; i++) lines.push(makeLine(i));
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
  new MutationObserver(function () {
    readAccent();
    sync();
  }).observe(layer, { attributes: true, attributeFilter: ['class', 'style'] });
  new MutationObserver(readAccent).observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-color-theme']
  });

  if (window.ResizeObserver) new ResizeObserver(resize).observe(wrapper);
  sync();
}());
