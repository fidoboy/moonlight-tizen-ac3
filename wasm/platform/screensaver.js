(function(global) {
  'use strict';
  var IDLE_TIMEOUT_MS = 30000;
  var LOGO_MOVE_INTERVAL_MS = 2000;
  var screensaverEnabled = true;
  var screensaverInitialized = false;
  var screensaverVisible = false;
  var idleTimeout = null;
  var logoMoveInterval = null;
  var layerObserver = null;

  function elements() {
    return { overlay: document.getElementById('screensaver-overlay'),
      content: document.getElementById('screensaver-content') };
  }
  function clearIdleTimeout() {
    if (idleTimeout !== null) { window.clearTimeout(idleTimeout); idleTimeout = null; }
  }
  function eligible() {
    if (!screensaverInitialized || !screensaverEnabled || global._directSmartHubLaunch ||
        global.isInGame === true || typeof global.isMainUiLayerActive !== 'function' ||
        !global.isMainUiLayerActive()) return false;
    var transition = document.getElementById('stream-transition-layer');
    return !!transition && window.getComputedStyle(transition).display === 'none';
  }
  function moveLogo() {
    var content = elements().content;
    if (!content || !screensaverVisible) return;
    var bounds = content.getBoundingClientRect();
    var width = window.innerWidth || document.documentElement.clientWidth;
    var height = window.innerHeight || document.documentElement.clientHeight;
    var margin = Math.max(24, Math.round(Math.min(width, height) * 0.06));
    var minX = margin + bounds.width / 2, maxX = width - margin - bounds.width / 2;
    var minY = margin + bounds.height / 2, maxY = height - margin - bounds.height / 2;
    if (maxX < minX) minX = maxX = width / 2;
    if (maxY < minY) minY = maxY = height / 2;
    content.style.left = (minX + Math.random() * (maxX - minX)) + 'px';
    content.style.top = (minY + Math.random() * (maxY - minY)) + 'px';
  }
  function hide() {
    var overlay = elements().overlay;
    if (logoMoveInterval !== null) { window.clearInterval(logoMoveInterval); logoMoveInterval = null; }
    if (overlay && screensaverVisible) {
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
    }
    screensaverVisible = false;
  }
  function show() {
    var e = elements();
    if (!e.overlay || !e.content || !eligible()) return;
    screensaverVisible = true;
    e.overlay.classList.add('is-visible');
    e.overlay.setAttribute('aria-hidden', 'false');
    moveLogo();
    logoMoveInterval = window.setInterval(moveLogo, LOGO_MOVE_INTERVAL_MS);
  }
  function syncScreensaverTimer() {
    if (!screensaverInitialized || !screensaverEnabled || global._directSmartHubLaunch || !eligible()) {
      clearIdleTimeout(); hide(); return;
    }
    if (screensaverVisible || idleTimeout !== null) return;
    idleTimeout = window.setTimeout(function() {
      idleTimeout = null;
      if (eligible()) show(); else syncScreensaverTimer();
    }, IDLE_TIMEOUT_MS);
  }
  function handleActivity() {
    if (!screensaverInitialized) return;
    hide(); clearIdleTimeout(); syncScreensaverTimer();
  }
  function setScreensaverEnabled(enabled) {
    screensaverEnabled = enabled === true;
    if (!screensaverEnabled) { clearIdleTimeout(); hide(); return; }
    syncScreensaverTimer();
  }
  function initializeScreensaver() {
    if (screensaverInitialized || global._directSmartHubLaunch) return;
    var e = elements();
    var mainUi = document.getElementById('main-ui-layer');
    var transition = document.getElementById('stream-transition-layer');
    if (!e.overlay || !e.content || !mainUi || !transition) return;
    screensaverInitialized = true;
    ['keydown','keyup','keypress','mousedown','mouseup','mousemove','click','wheel',
     'pointerdown','pointerup','pointermove','touchstart','touchmove','touchend','touchcancel',
     'gamepadinputchanged'].forEach(function(name) {
      window.addEventListener(name, handleActivity, true);
    });
    if (typeof MutationObserver === 'function') {
      layerObserver = new MutationObserver(syncScreensaverTimer);
      layerObserver.observe(mainUi, { attributes:true, attributeFilter:['class','style'] });
      layerObserver.observe(transition, { attributes:true, attributeFilter:['class','style'] });
    }
    syncScreensaverTimer();
  }
  global.initializeScreensaver = initializeScreensaver;
  global.setScreensaverEnabled = setScreensaverEnabled;
  global.syncScreensaverTimer = syncScreensaverTimer;
})(window);
