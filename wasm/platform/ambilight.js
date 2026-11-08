(function() {
  'use strict';

  var SERVICE_APP_ID = 'MoonLightS.MoonlightAmbilight';
  var OPERATION = 'http://tizen.org/appcontrol/operation/default';
  // Tizen API 9 (tizen90) maps to Tizen 6.5. Older TVs still install and run
  // Moonlight, but must never be asked to launch this optional .NET service.
  var MINIMUM_SERVICE_PLATFORM_VERSION = '6.5';

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
            // The process may be running even if its AppControl reply is delayed.
            // Do not let a late launch callback resurrect a service already reported unsupported.
            if ((command === 'initialize' || command === 'start') && initialized && !supported) return;
            serviceStarted = true;
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

  function serialize(command, settings) {
    pending = pending.catch(function() {}).then(function() {
      return launch(command, settings);
    });
    return pending;
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
      serviceStarted = supported;
      active = false;
      return supported;
    }).catch(function(error) {
      initialized = true;
      supported = false;
      serviceStarted = false;
      active = false;
      throw error;
    });
    return initialization;
  }

  window.moonlightAmbilight = {
    initialize: initialize,

    isSupported: function() {
      return initialized && supported;
    },

    start: function(ip, port, ledCount) {
      if (!ip) return Promise.reject(new Error('WLED IP address is required.'));
      return initialize().then(function(available) {
        if (!available) throw new Error('Ambilight capture is not supported on this TV.');
        return serialize('start', { ip: ip, port: port, ledCount: ledCount });
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
      });
    },

    stop: function() {
      return initialize().then(function(available) {
        if (!available || !serviceStarted) return null;
        return serialize('stop').then(function(result) {
          if (!result.ok) throw new Error(result.error || 'Ambilight capture could not be stopped.');
          active = false;
          return result;
        });
      });
    },

    shutdown: function() {
      return pending.catch(function() {}).then(function() {
        if (!serviceStarted) {
          active = false;
          return null;
        }
        return launch('shutdown').then(function(result) {
          serviceStarted = false;
          active = false;
          initialized = false;
          supported = false;
          initialization = null;
          if (!result.ok) throw new Error(result.error || 'Ambilight service could not be stopped.');
          return result;
        });
      });
    },

    isActive: function() { return active; }
  };
})();
