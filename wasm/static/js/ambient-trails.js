/* Lightweight ambient trails for the Hosts and Apps screens.
 * Geometry is generated once per resize; animation uses inexpensive sine offsets.
 * No per-frame noise sampling, blur filters, or external dependencies.
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
  var frameInterval = 1000 / 24;
  var rows = [];
  var noise = new SimplexNoise3D();
  var X_COUNT = 32;
  var Y_COUNT = 36;

  function resizeCanvas() {
    var rect = layer.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width || window.innerWidth));
    height = Math.max(1, Math.round(rect.height || window.innerHeight));

    // Keep the backing store at or below CSS pixel resolution for low-power TVs.
    var pixelRatio = Math.min(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    buildGeometry();
  }

  function buildGeometry() {
    rows = [];
    var halfHeight = height / 2;
    for (var j = 0; j < Y_COUNT; j++) {
      var rowT = j / (Y_COUNT - 1);
      var rowTime = j * 0.01;
      var c = Math.cos(rowT * Math.PI * 2) * 0.1;
      var points = [];
      for (var i = 0; i < X_COUNT; i++) {
        var tx = i / (X_COUNT - 1);
        points.push({
          x: tx * (width + 20) - width / 2 - 10,
          baseY: noise.noise3D(tx, rowTime, c) * halfHeight,
          phase: tx * Math.PI * 2 + rowT * Math.PI * 3
        });
      }
      rows.push(points);
    }
  }

  function hsl(hue, saturation, lightness, alpha) {
    return 'hsla(' + hue + ', ' + saturation + '%, ' + lightness + '%, ' + alpha + ')';
  }

  function draw(timestamp) {
    window.requestAnimationFrame(draw);
    if (timestamp - lastFrame < frameInterval) return;
    lastFrame = timestamp;

    if (!mainUi.classList.contains('ambient-trails-active') ||
        mainUi.classList.contains('ui-inactive') ||
        canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

    var time = timestamp * 0.00004;
    var halfWidth = width / 2;
    var halfHeight = height / 2;
    var hueA = Math.floor(time % 2) === 0 ? 340 : 210;
    var hueB = hueA === 340 ? 210 : 340;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var pixelRatio = canvas.width / width;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, halfWidth * pixelRatio, halfHeight * pixelRatio);

    var grad = ctx.createLinearGradient(-width, 0, width, height);
    grad.addColorStop(0, hsl(hueA, 100, 50, 1));
    grad.addColorStop(0.5, hsl(hueB, 100, 50, 1));
    grad.addColorStop(1, hsl(hueA, 100, 50, 1));

    // Preserve the ambient colour wash, but avoid filters and per-frame noise.
    ctx.globalAlpha = 0.08 + (Math.cos(time) + 1) * 0.035;
    ctx.fillStyle = grad;
    ctx.fillRect(-halfWidth, -halfHeight, width, height);
    ctx.globalAlpha = 1;

    var waveTime = timestamp * 0.00018;
    var waveAmplitude = Math.min(24, halfHeight * 0.045);
    ctx.beginPath();
    for (var j = 0; j < rows.length; j++) {
      var points = rows[j];
      var rowPhase = j * 0.17;
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        var y = p.baseY + Math.sin(p.phase + waveTime + rowPhase) * waveAmplitude;
        if (i === 0) ctx.moveTo(p.x, y);
        else ctx.lineTo(p.x, y);
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.48)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Compact 3D simplex-noise implementation, used only when geometry is built.
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
      var F3 = 1 / 3, G3 = 1 / 6;
      var s = (xin + yin + zin) * F3;
      var i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      var t = (i + j + k) * G3;
      var x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
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
      return 32 * (contribution(gi0,x0,y0,z0) + contribution(gi1,x1,y1,z1) +
        contribution(gi2,x2,y2,z2) + contribution(gi3,x3,y3,z3));
    };
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  window.requestAnimationFrame(draw);
})();
