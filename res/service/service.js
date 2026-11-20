/**
 * Samsung Smart Hub Preview background service.
 * Receives preview payloads through AppControl and publishes them through
 * Samsung's Preview API. The local HTTP server serves tile artwork.
 */
/* global tizen, webapis, module, global */

var webapis = (typeof global !== 'undefined' && global.webapis) || null;
var loadError = '';
if (!webapis) {
  try {
    webapis = require('$WEBAPIS/webapis/webapis.js');
  } catch (e) {
    loadError = 'webapis: ' + e.message;
  }
}

var fs = null;
try {
  fs = require('fs');
} catch (e) {
  console.error('%c[service.js]', 'color: gray;', '[SmartHub Service] fs module is not available: ' + e.message);
}

var http = null;
try {
  http = require('http');
} catch (e) {
  console.error('%c[service.js]', 'color: gray;', '[SmartHub Service] http module is not available: ' + e.message);
}

var tvIp = '127.0.0.1';
var localServer = null;
var localServerStartPromise = null;
var routeMap = {};

function log(message) {
  console.log('[SmartHub Service] ' + message);
}

function finish(req, status, shouldExit) {
  try {
    if (req) {
      req.replyResult([new tizen.ApplicationControlData('status', [status])]);
    }
  } catch (e) {
    log('Could not reply to AppControl: ' + e.message);
  }
  if (shouldExit !== false) {
    setTimeout(function() {
      try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
    }, 500);
  }
}

/**
 * Processes incoming app control data to extract and set preview data.
 */
function startLocalServer() {
  if (!http) return Promise.reject(new Error('http module is not available'));
  if (!fs) return Promise.reject(new Error('fs module is not available'));
  if (localServer && localServer.listening) return Promise.resolve();
  if (localServerStartPromise) return localServerStartPromise;

  localServerStartPromise = new Promise(function(resolve, reject) {
    try {
      localServer = http.createServer(function(req, res) {
        var route = require('url').parse(req.url).pathname;
        log('Local HTTP server received request for: ' + route);
        if (routeMap[route]) {
          try {
            var binaryData = fs.readFileSync(routeMap[route]);
            var contentType = route.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png';
            res.writeHead(200, {'Content-Type': contentType, 'Content-Length': binaryData.length});
            res.end(binaryData);
            log('Successfully served binary image for ' + route + ' | Size: ' + Math.round(binaryData.length / 1024) + ' KB');
          } catch (err) {
            log('Error reading binary image file for ' + route + ': ' + err.message);
            res.writeHead(404);
            res.end();
          }
          return;
        }

        // Fallback after a TV reboot, when the in-memory route map is empty.
        // Only accept a plain preview filename; never use request path segments on disk.
        var fallbackMatch = /^\/(preview-[A-Za-z0-9_-]+\.jpg)$/.exec(route || '');
        if (fallbackMatch) {
          var fallbackFileName = fallbackMatch[1];
          var fallbackPaths = [
            '/opt/usr/home/owner/content/Documents/' + fallbackFileName,
            '/home/owner/content/Documents/' + fallbackFileName
          ];
          for (var i = 0; i < fallbackPaths.length; i++) {
            try {
              var fallbackData = fs.readFileSync(fallbackPaths[i]);
              res.writeHead(200, {'Content-Type': 'image/jpeg', 'Content-Length': fallbackData.length});
              res.end(fallbackData);
              log('Successfully served fallback image: ' + fallbackFileName);
              return;
            } catch (fallbackErr) {
              log('Fallback image path unavailable: ' + fallbackErr.message);
            }
          }
        }
        log('Route not found: ' + route);
        res.writeHead(404);
        res.end();
      });

      var onListenError = function(err) {
        localServer = null;
        localServerStartPromise = null;
        reject(err);
      };
      localServer.once('error', onListenError);
      localServer.listen(8888, '0.0.0.0', function() {
        localServer.removeListener('error', onListenError);
        localServer.on('error', function(err) {
          log('Local HTTP server error: ' + err.message);
        });
        log('Local HTTP server listening on port 8888 (TV IP: ' + tvIp + ')');
        resolve();
      });
    } catch (err) {
      localServer = null;
      localServerStartPromise = null;
      reject(err);
    }
  });
  return localServerStartPromise;
}

function handleDataInRequest() {
  var req = null;
  try {
    req = tizen.application.getCurrentApplication().getRequestedAppControl();
    if (!req || !req.appControl || !req.appControl.data) {
      log('No AppControl data received.');
      finish(req, 'nothing to process');
      return;
    }

    var previewJson = null;
    req.appControl.data.forEach(function(entry) {
      if (entry.key === 'preview' || entry.key === 'Preview') previewJson = entry.value && entry.value[0];
    });
    if (!previewJson) {
      finish(req, 'nothing to publish');
      return;
    }
    if (!webapis || !webapis.preview || typeof webapis.preview.setPreviewData !== 'function') {
      finish(req, 'preview API unavailable' + (loadError ? ': ' + loadError : ''));
      return;
    }

    var parsedPreviewData = JSON.parse(previewJson);
    if (!parsedPreviewData || !Array.isArray(parsedPreviewData.sections)) {
      finish(req, 'invalid preview payload');
      return;
    }
    log('Preview data received. Size: ' + previewJson.length + ' bytes');

    var hasLocalImageRoutes = false;
    parsedPreviewData.sections.forEach(function(section) {
      if (!section || !Array.isArray(section.tiles)) return;
      section.tiles.forEach(function(tile) {
        if (!tile || !tile.image_url || !tile.txtPath) return;
        var parsedUrl = require('url').parse(tile.image_url);
        var route = parsedUrl.pathname;
        if (!route) return;
        hasLocalImageRoutes = true;
        routeMap[route] = tile.txtPath;

        if (tvIp === '127.0.0.1' && webapis.network && typeof webapis.network.getIp === 'function') {
          try {
            var detectedIp = webapis.network.getIp();
            if (detectedIp) tvIp = detectedIp;
          } catch (netErr) {
            log('Failed to get TV IP: ' + netErr.message);
          }
        }
        tile.image_url = tile.image_url.replace('127.0.0.1', tvIp);
        delete tile.txtPath;
      });
    });

    var publishPreview = function() {
      try {
        webapis.preview.setPreviewData(JSON.stringify(parsedPreviewData), function() {
          log('Preview set successfully. Service remains alive to serve HTTP requests.');
          finish(req, 'ok', false);
        }, function(error) {
          var message = error && error.message ? error.message : String(error || 'unknown error');
          log('Preview data setting failed: ' + message);
          finish(req, 'preview API failed: ' + message);
        });
      } catch (apiError) {
        var message = apiError && apiError.message ? apiError.message : String(apiError);
        log('Preview API threw an exception: ' + message);
        finish(req, 'preview API exception: ' + message);
      }
    };

    // Only local artwork requires the HTTP server. Do not let an unavailable
    // server prevent an empty payload or remote-image-only payload from publishing.
    if (hasLocalImageRoutes) {
      startLocalServer().then(publishPreview, function(serverError) {
        var message = serverError && serverError.message ? serverError.message : String(serverError);
        log('Could not start local HTTP server: ' + message);
        finish(req, 'HTTP server failed: ' + message);
      });
    } else {
      publishPreview();
    }
  } catch (e) {
    log('Error handling AppControl request: ' + e.message);
    finish(req, 'exception: ' + e.message);
  }
}

module.exports.onStart = function() {
  log('Service started.');
};

module.exports.onRequest = function() {
  log('AppControl request received.');
  handleDataInRequest();
};

module.exports.onStop = function() {
  log('Service stopping...');
};

module.exports.onExit = function() {
  log('Service exiting...');
};
