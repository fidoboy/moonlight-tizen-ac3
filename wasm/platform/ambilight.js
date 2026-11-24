(function() {
  'use strict';

  var SERVICE_APP_ID = 'MoonLightS.MoonlightAmbilight';
  var OPERATION = 'http://tizen.org/appcontrol/operation/default';
  // Ambilight service compatibility starts at Tizen 6.0.
  var MINIMUM_SERVICE_PLATFORM_VERSION = '6.0';

  function platformSupportsService() {
    try {
      if (!window.tizen || !tizen.systeminfo ||
          typeof tizen.systeminfo.getCapability !== 'function') return false;

      var value = String(tizen.systeminfo.getCapability(
        'http://tizen.org/feature/platform.version') || '');
      var parts = value.split('.');
      if (parts.length < 2) return false;

      var major = parseInt(parts[0], 10);
      var minor = parseInt(parts[1], 10);
      if (!isFinite(major) || !isFinite(minor)) return false;
      var required = MINIMUM_SERVICE_PLATFORM_VERSION.split('.');
      var requiredMajor = Number(required[0]);
      var requiredMinor = Number(required[1]);

      return major > requiredMajor ||
        (major === requiredMajor && minor >= requiredMinor);
    } catch (error) {
      console.warn('[ambilight] Could not read Tizen platform version:', error);
      return false;
    }
  }
  var initialized = false;
  var supported = false;
  var serviceStarted = false;
  var active = false;
  var pending = Promise.resolve();
  var initialization = null;
  var shutdownPromise = null;

  var SERVICE_STOP_VERIFY_ATTEMPTS = 30;
  var SERVICE_STOP_VERIFY_DELAY_MS = 100;
  var SERVICE_LIFECYCLE_TIMEOUT_MS = 5000;

  function readReply(data, key) {
    if (!Array.isArray(data)) return null;
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].key === key && Array.isArray(data[i].value) && data[i].value.length) {
        return data[i].value[0];
      }
    }
    return null;
  }

  function launch(command, settings) {
    if (!window.tizen || !tizen.application || !tizen.ApplicationControl ||
        !tizen.ApplicationControlData || typeof tizen.application.launchAppControl !== 'function') {
      return Promise.reject(new Error('Tizen AppControl is unavailable.'));
    }

    var data = [new tizen.ApplicationControlData('command', [command])];
    if (command === 'start') {
      data.push(new tizen.ApplicationControlData('wledIp', [settings.ip]));
      data.push(new tizen.ApplicationControlData('wledPort', [String(settings.port || 21324)]));
      data.push(new tizen.ApplicationControlData('ledCount', [String(settings.ledCount || 73)]));
      data.push(new tizen.ApplicationControlData('hdr', [settings.hdr === true ? 'true' : 'false']));
      data.push(new tizen.ApplicationControlData('colorSpace', [String(settings.colorSpace === 0 || settings.colorSpace === 2 ? settings.colorSpace : 1)]));
      data.push(new tizen.ApplicationControlData('fullRange', [settings.fullRange === true ? 'true' : 'false']));
      data.push(new tizen.ApplicationControlData('captureBackend', [settings.captureBackend === 'ppi' ? 'ppi' : 'video_plane']));
    }

    var control = new tizen.ApplicationControl(OPERATION, null, null, null, data);
    return new Promise(function(resolve, reject) {
      var settled = false;
      var timeoutId = window.setTimeout(function() {
        finish(new Error('Ambilight service did not reply to "' + command + '".'));
      }, 10000);

      function finish(error, result) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (error) reject(error);
        else resolve(result || {});
      }

      var replyCallback = {
        onsuccess: function(replyData) {
          var ok = readReply(replyData, 'ok');
          var replySupported = readReply(replyData, 'supported');
          var errorText = readReply(replyData, 'error');
          finish(null, {
            ok: ok !== 'false',
            supported: replySupported === 'true',
            error: errorText || null
          });
        },
        onfailure: function() {
          finish(new Error('Ambilight service rejected "' + command + '".'));
        }
      };

      try {
        tizen.application.launchAppControl(
          control,
          SERVICE_APP_ID,
          function() {
            // Process state is updated only after the AppControl reply and lifecycle
            // verification have completed. A launch callback alone is not readiness.
          },
          function(error) {
            finish(new Error(error && error.message ? error.message : 'Could not launch Ambilight service.'));
          },
          replyCallback
        );
      } catch (error) {
        finish(error);
      }
    });
  }

  function serialize(command, settings, requireCleanStart) {
    pending = pending.catch(function() {}).then(function() {
      return requireCleanStart ? stopExistingService() : null;
    }).then(function() {
      return launch(command, settings);
    });
    return pending;
  }

  function delay(milliseconds) {
    return new Promise(function(resolve) {
      window.setTimeout(resolve, milliseconds);
    });
  }

  function getRunningServiceContexts() {
    return new Promise(function(resolve, reject) {
      try {
        if (!window.tizen || !tizen.application ||
            typeof tizen.application.getAppsContext !== 'function') {
          throw new Error('Tizen running-application inspection is unavailable.');
        }
        var settled = false;
        var timeoutId = window.setTimeout(function() {
          if (settled) return;
          settled = true;
          reject(new Error('Checking the Ambilight service state timed out.'));
        }, SERVICE_LIFECYCLE_TIMEOUT_MS);
        tizen.application.getAppsContext(function(contexts) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          contexts = Array.isArray(contexts) ? contexts : [];
          resolve(contexts.filter(function(context) {
            return context && context.appId === SERVICE_APP_ID;
          }));
        }, function(error) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          reject(new Error('Could not inspect running Ambilight services: ' +
            (error && error.message ? error.message : String(error))));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function waitForServiceStopped(attempt) {
    return getRunningServiceContexts().then(function(contexts) {
      if (contexts.length === 0) return true;
      if (attempt >= SERVICE_STOP_VERIFY_ATTEMPTS) {
        throw new Error('The previous Ambilight service did not stop completely.');
      }
      return delay(SERVICE_STOP_VERIFY_DELAY_MS).then(function() {
        return waitForServiceStopped(attempt + 1);
      });
    });
  }

  function stopExistingService() {
    return getRunningServiceContexts().then(function(contexts) {
      if (contexts.length === 0) return true;
      if (!tizen.application || typeof tizen.application.kill !== 'function') {
        throw new Error('Tizen application termination is unavailable; a clean Ambilight start cannot be guaranteed.');
      }
      return contexts.reduce(function(chain, context) {
        return chain.then(function() {
          return new Promise(function(resolve, reject) {
            var settled = false;
            var timeoutId = window.setTimeout(function() {
              if (settled) return;
              settled = true;
              reject(new Error('Stopping the previous Ambilight service timed out.'));
            }, SERVICE_LIFECYCLE_TIMEOUT_MS);
            function finish(error) {
              if (settled) return;
              settled = true;
              window.clearTimeout(timeoutId);
              if (error) reject(error);
              else resolve();
            }
            try {
              tizen.application.kill(context.id, function() {
                finish();
              }, function(error) {
                if (error && error.name === 'NotFoundError') {
                  finish();
                  return;
                }
                finish(new Error('Could not stop the previous Ambilight service: ' +
                  (error && error.message ? error.message : String(error))));
              });
            } catch (error) {
              finish(error);
            }
          });
        });
      }, Promise.resolve()).then(function() {
        return waitForServiceStopped(0);
      });
    });
  }

  function initialize() {
    if (initialization) return initialization;

    // Fail closed on Tizen 5.5–6.0 and on platforms where the version cannot be read.
    // In that case the service is left completely unlaunched, as if it were absent.
    if (!platformSupportsService()) {
      initialized = true;
      supported = false;
      serviceStarted = false;
      active = false;
      initialization = Promise.resolve(false);
      return initialization;
    }

    initialization = serialize('initialize').then(function(result) {
      initialized = true;
      supported = result.supported === true && result.ok !== false;
      serviceStarted = false;
      active = false;
      // The capability probe exits its ServiceApplication after replying.
      // Verify that it is gone before allowing a later stream to start.
      return stopExistingService().then(function() {
        return supported;
      });
    }).catch(function(error) {
      initialized = true;
      supported = false;
      serviceStarted = false;
      active = false;
      return stopExistingService().catch(function(cleanupError) {
        console.warn('[ambilight] Could not clean up after capability probe:', cleanupError);
      }).then(function() {
        throw error;
      });
    });
    return initialization;
  }

  window.moonlightAmbilight = {
    initialize: initialize,

    isSupported: function() {
      return initialized && supported;
    },

    start: function(ip, port, ledCount, colorProfile, captureBackend) {
      if (!ip) return Promise.reject(new Error('WLED IP address is required.'));
      return initialize().then(function(available) {
        if (!available) throw new Error('Ambilight capture is not supported on this TV.');
        colorProfile = colorProfile || {};
        return serialize('start', {
          ip: ip,
          port: port,
          ledCount: ledCount,
          hdr: colorProfile.hdr === true,
          colorSpace: colorProfile.colorSpace,
          fullRange: colorProfile.fullRange === true,
          captureBackend: captureBackend === 'ppi' ? 'ppi' : 'video_plane'
        }, true);
      }).then(function(result) {
        if (result.supported === false) {
          supported = false;
          initialized = true;
          serviceStarted = false;
          active = false;
          throw new Error(result.error || 'Ambilight capture is not supported on this TV.');
        }
        if (!result.ok) throw new Error(result.error || 'Ambilight capture could not be started.');
        serviceStarted = true;
        active = true;
        return result;
      }).catch(function(error) {
        serviceStarted = false;
        active = false;
        return stopExistingService().catch(function(cleanupError) {
          console.warn('[ambilight] Could not clean up after failed startup:', cleanupError);
        }).then(function() {
          throw error;
        });
      });
    },

    stop: function() {
      if (!serviceStarted) {
        active = false;
        return Promise.resolve(null);
      }
      return serialize('stop').then(function(result) {
        if (!result.ok) throw new Error(result.error || 'Ambilight capture could not be stopped.');
        active = false;
        return result;
      });
    },

    shutdown: function() {
      if (shutdownPromise) return shutdownPromise;
      shutdownPromise = pending.catch(function() {}).then(function() {
        if (!serviceStarted) return stopExistingService();
        return launch('shutdown').then(function(result) {
          if (!result.ok) throw new Error(result.error || 'Ambilight service could not be stopped.');
          return waitForServiceStopped(0);
        }).catch(function(error) {
          console.warn('[ambilight] Graceful shutdown failed; forcing service termination:', error);
          return stopExistingService();
        });
      }).then(function() {
        serviceStarted = false;
        active = false;
        return true;
      }).catch(function(error) {
        serviceStarted = false;
        active = false;
        throw error;
      }).then(function(result) {
        shutdownPromise = null;
        return result;
      }, function(error) {
        shutdownPromise = null;
        throw error;
      });
      return shutdownPromise;
    },

    isActive: function() { return active; }
  };
})();
