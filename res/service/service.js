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
  if (!http) {
    log('startLocalServer aborted: http module is not available');
    return;
  }
  if (!fs) {
    log('startLocalServer aborted: fs module is not available');
    return;
  }
  if (localServer) {
    log('Local HTTP server is already running on http://' + tvIp + ':8888');
    return;
  }
  
  localServer = http.createServer(function (req, res) {
    var route = require('url').parse(req.url).pathname; // Strip query string for cache-busting
    log('Local HTTP server received request for: ' + route);
    if (routeMap[route]) {
      var imagePath = routeMap[route];
      try {
        var binaryData = fs.readFileSync(imagePath);
        var contentType = route.toLowerCase().endsWith('.jpg')
          ? 'image/jpeg'
          : 'image/png';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': binaryData.length
        });
        res.end(binaryData);
        log('Successfully served binary image for ' + route + ' | Size: ' + Math.round(binaryData.length / 1024) + ' KB');
      } catch (err) {
        log('Error reading binary image file for ' + route + ': ' + err.message);
        res.writeHead(404);
        res.end();
      }
    } else {
      // Fallback for TV reboots when memory routeMap is empty.
      // Accept only a plain preview filename; never use request path segments on disk.
      var fallbackMatch = /^\/(preview-[A-Za-z0-9_-]+\.jpg)$/.exec(route || '');
      if (fallbackMatch) {
        var fallbackFileName = fallbackMatch[1];
        log('Attempting fallback disk resolution for: ' + fallbackFileName);
        var fallbackPaths = [
          '/opt/usr/home/owner/content/Documents/' + fallbackFileName,
          '/home/owner/content/Documents/' + fallbackFileName
        ];
        
        for (var i = 0; i < fallbackPaths.length; i++) {
          try {
            var fallbackData = fs.readFileSync(fallbackPaths[i]);
            var fallbackContentType = 'image/jpeg';
            res.writeHead(200, {
              'Content-Type': fallbackContentType,
              'Content-Length': fallbackData.length
            });
            res.end(fallbackData);
            log('Successfully served fallback binary image from ' + fallbackPaths[i]);
            return; // Exit on success
          } catch (fallbackErr) {
            // Ignore error and try the next path
            log('Fallback path not found or error reading: ' + fallbackErr.message);
          }
        }
      }
      
      log('Route not found in routeMap or fallbacks for: ' + route);
      res.writeHead(404);
      res.end();
    }
  });
  
  localServer.on('error', function(err) {
    log('Local HTTP server error: ' + err.message);
  });
  
  localServer.listen(8888, '0.0.0.0', function() {
    log('Local HTTP server listening on http://0.0.0.0:8888 (TV IP: ' + tvIp + ')');
  });
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

    var appControlData = req.appControl.data;
    var probeRequested = false;
    var previewJson = null;

    appControlData.forEach(function(entry) {
      if (entry.key === 'probe' || entry.key === 'Probe') {
        probeRequested = true;
      } else if (entry.key === 'preview' || entry.key === 'Preview') {
        previewJson = entry.value && entry.value[0];
      }
    });

    if (probeRequested) {
      var isSupported = !!(webapis && webapis.preview &&
        typeof webapis.preview.setPreviewData === 'function');
      log('Preview API available: ' + isSupported + (loadError ? ' (' + loadError + ')' : ''));
      finish(req, isSupported ? 'SMART_HUB_SUPPORTED' : 'SMART_HUB_NOT_SUPPORTED');
      return;
    }

    if (!previewJson) {
      finish(req, 'nothing to publish');
      return;
    }

    if (!webapis || !webapis.preview ||
        typeof webapis.preview.setPreviewData !== 'function') {
      finish(req, 'no preview API ' + loadError);
      return;
    }

    var parsedPreviewData = JSON.parse(previewJson);
    log('Preview data received. Size: ' + previewJson.length + ' bytes');

    if (parsedPreviewData.sections) {
      parsedPreviewData.sections.forEach(function(section) {
        if (!section.tiles) return;
        section.tiles.forEach(function(tile) {
          if (!tile.image_url || !tile.txtPath) return;

          var parsedUrl = require('url').parse(tile.image_url);
          var route = parsedUrl.pathname;
          routeMap[route] = tile.txtPath;

          if (tvIp === '127.0.0.1' && webapis.network) {
            try {
              tvIp = webapis.network.getIp();
              log('Obtained TV IP from webapis.network.');
            } catch (netErr) {
              log('Failed to get TV IP: ' + netErr.message);
            }
          }

          tile.image_url = tile.image_url.replace('127.0.0.1', tvIp);
          delete tile.txtPath;
        });
      });
    }

    try {
      startLocalServer();
    } catch (serverErr) {
      log('Failed to start local HTTP server: ' + serverErr.message);
    }

    webapis.preview.setPreviewData(JSON.stringify(parsedPreviewData), function() {
      log('Preview set successfully. Service remains alive to serve HTTP requests.');
      finish(req, 'ok', false);
    }, function(e) {
      log('Preview data setting failed: ' + (e && e.message ? e.message : e));
      finish(req, 'failed ' + (e && e.message ? e.message : e));
    });
  } catch (e) {
    log('Error handling AppControl request: ' + e.message);
    finish(req, 'exception ' + e.message);
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
