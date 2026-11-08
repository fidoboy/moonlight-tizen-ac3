(function() {
  'use strict';

  var SERVICE_APP_ID = 'MoonLightS.MoonlightAmbilight';
  var OPERATION = 'http://tizen.org/appcontrol/operation/default';
  var active = false;
  var pending = Promise.resolve();

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
      tizen.application.launchAppControl(control, SERVICE_APP_ID, resolve, reject, null);
    });
  }

  function serialize(operation, settings) {
    pending = pending.catch(function() {}).then(function() {
      return launch(operation, settings);
    }).then(function(result) {
      active = operation === 'start';
      return result;
    });
    return pending;
  }

  window.moonlightAmbilight = {
    start: function(ip, port, ledCount) {
      if (!ip) return Promise.reject(new Error('WLED IP address is required.'));
      return serialize('start', { ip: ip, port: port, ledCount: ledCount });
    },
    stop: function() {
      return serialize('stop');
    },
    isActive: function() { return active; }
  };
})();
