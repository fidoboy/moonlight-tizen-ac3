/* Ambient canvas experiment for the Hosts and Apps screens.
 * Standalone Canvas 2D implementation; no p5/canvas-sketch runtime required.
 */
(function () {
  'use strict';

  window.canvasOptions = {
    autoClear: true,
    autoCompensate: false,
    autoPushPop: true,
    canvas: true,
    centered: true,
    width: null,
    height: null
  };

  var canvas = document.getElementById('ambient-trails-canvas');
  var layer = document.getElementById('ambient-trails');
  var mainUi = document.getElementById('main-ui-layer');
  if (!canvas || !layer || !mainUi || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var width = 0;
  var height = 0;
  var lastFrame = 0;
  var frameInterval = 1000 / 30;
  var noise = new SimplexNoise3D();

  function resizeCanvas() {
    var rect = layer.getBoundingClientRect();
    var nextWidth = Math.max(1, Math.round(rect.width || window.innerWidth));
    var nextHeight = Math.max(1, Math.round(rect.height || window.innerHeight));
    // Avoid a costly high-DPI backing store on 4K TVs.
    var pixelRatio = Math.min(1, window.devicePixelRatio || 1);
    width = nextWidth;
    height = nextHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function map(value, inMin, inMax, outMin, outMax) {
    return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
  }

  function hsl(hue, saturation, lightness, alpha) {
    return 'hsla(' + hue + ', ' + saturation + '%, ' + lightness + '%, ' + (alpha === undefined ? 1 : alpha) + ')';
  }

  function draw(timestamp) {
    window.requestAnimationFrame(draw);
    if (timestamp - lastFrame < frameInterval) return;
    lastFrame = timestamp;

    if (!mainUi.classList.contains('ambient-trails-active') ||
        mainUi.classList.contains('ui-inactive') ||
        canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

    var xCount = 40;
    var yCount = 60;
    var iXCount = 1 / (xCount - 1);
    var iYCount = 1 / (yCount - 1);
    // Original sketch advances at roughly 1 time unit/second. Slow it down 25x.
    var time = timestamp * 0.00004;
    var timeStep = 0.01;
    var halfWidth = width / 2;
    var halfHeight = height / 2;
    var t = time % 1;
    var tSide = Math.floor(time % 2) === 0;
    var hueA = tSide ? 340 : 210;
    var hueB = tSide ? 210 : 340;
    var colorA = hsl(hueA, 100, 50);
    var colorB = hsl(hueB, 100, 50);

    // Clear in pixel coordinates, then use a centered coordinate system like the supplied sketch.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var pixelRatio = canvas.width / width;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, halfWidth * pixelRatio, halfHeight * pixelRatio);

    var grad = ctx.createLinearGradient(-width, 0, width, height);
    grad.addColorStop(0, colorA);
    grad.addColorStop(0.5, colorB);
    grad.addColorStop(1, colorA);

    ctx.globalAlpha = map(Math.cos(time), -1, 1, 0.15, 0.3);
    ctx.fillStyle = grad;
    ctx.fillRect(-halfWidth, -halfHeight, width, height);
    ctx.globalAlpha = 1;

    ctx.beginPath();
    var rowTime = time;
    for (var j = 0; j < yCount; j++) {
      var tj = j * iYCount;
      var c = Math.cos(tj * Math.PI * 2 + rowTime) * 0.1;
      for (var i = 0; i < xCount; i++) {
        var tx = i * iXCount;
        var n = noise.noise3D(tx, rowTime, c);
        var y = n * halfHeight;
        var x = tx * (width + 20) - halfWidth - 10;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      rowTime += timeStep;
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(10px)';
    ctx.strokeStyle = grad;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.filter = 'none';
    ctx.strokeStyle = hsl(0, 0, 100, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Compact 3D simplex-noise implementation, avoiding an external dependency on Tizen.
  function SimplexNoise3D() {
    var grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];
    var p = [];
    var perm = [];
    var seed = 0x6d2b79f5;
    function random() {
      seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
      seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
      return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
    }
    for (var i = 0; i < 256; i++) p[i] = i;
    for (var j = 255; j > 0; j--) {
      var k = Math.floor(random() * (j + 1));
      var tmp = p[j]; p[j] = p[k]; p[k] = tmp;
    }
    for (var n = 0; n < 512; n++) perm[n] = p[n & 255];

    this.noise3D = function (xin, yin, zin) {
      var F3 = 1 / 3;
      var G3 = 1 / 6;
      var s = (xin + yin + zin) * F3;
      var i = Math.floor(xin + s);
      var j = Math.floor(yin + s);
      var k = Math.floor(zin + s);
      var t = (i + j + k) * G3;
      var x0 = xin - (i - t);
      var y0 = yin - (j - t);
      var z0 = zin - (k - t);
      var i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
        else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
        else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
      } else {
        if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
        else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
        else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
      }
      var x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
      var x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
      var x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;
      var ii=i&255, jj=j&255, kk=k&255;
      function contribution(g, x, y, z) {
        var q = 0.6 - x*x - y*y - z*z;
        if (q < 0) return 0;
        var v = grad3[g % 12];
        q *= q;
        return q*q*(v[0]*x + v[1]*y + v[2]*z);
      }
      var gi0=perm[ii+perm[jj+perm[kk]]] % 12;
      var gi1=perm[ii+i1+perm[jj+j1+perm[kk+k1]]] % 12;
      var gi2=perm[ii+i2+perm[jj+j2+perm[kk+k2]]] % 12;
      var gi3=perm[ii+1+perm[jj+1+perm[kk+1]]] % 12;
      return 32 * (
        contribution(gi0,x0,y0,z0) +
        contribution(gi1,x1,y1,z1) +
        contribution(gi2,x2,y2,z2) +
        contribution(gi3,x3,y3,z3)
      );
    };
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  window.requestAnimationFrame(draw);
})();
