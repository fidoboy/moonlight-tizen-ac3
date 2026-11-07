/**
 * findNvService() — unified host discovery for Tizen.
 * 
 * Tizen's WebAssembly sandbox cannot receive mDNS responses:
 *   - UDP multicast on port 5353 is intercepted by the system Avahi daemon and
 *     never delivered to WASM sockets, even with SO_REUSEPORT set.
 *   - Unicast mDNS replies are dropped by Tizen's SMACK stateful firewall because
 *     the query goes to 224.0.0.251 but the reply comes from the host's unicast IP,
 *     so the 5-tuple never matches an established conntrack entry.
 *   - Samsung's Tizen WRT has no mDNS/NetBIOS/local DNS support, making .local
 *     hostnames (e.g. MacBook-Pro.local from /serverinfo's <hostname>) unresolvable.
 * 
 * Instead, we perform a fast parallel HTTP scan of the /24 subnet. TCP fetch()
 * correctly establishes conntrack state, so replies are delivered normally.
 * Only port 47989 (Sunshine HTTP) is probed — 47984 (HTTPS/GFE) is skipped to
 * halve the number of parallel requests and avoid TLS certificate errors.
 * 
 * If Samsung ever adds native UDP multicast or mDNS support to the Tizen WRT,
 * re-enable the original findNvService() and replace this function with a
 * call to sendMessage('startMdnsDiscovery').
 */
function findNvService(ipString) {
  // Discovery is IPv4-only: Tizen has no mDNS/NetBIOS/local DNS to resolve
  // .local hostnames, and the HTTP subnet scanner only produces IPv4 addresses.
  var ip = ipString.replace('ipv4:', '');

  // Resolve with true only when this handshake adds a previously unknown host.
  return new Promise(function(resolve) {
    var completed = false;
    function finish(isNewHost) {
      if (completed) return;
      completed = true;
      resolve(isNewHost === true);
    }

    try {
      var discoveredHost = new NvHTTP(ip, myUniqueid);
      discoveredHost.httpPort = 47989;
      discoveredHost.httpsPort = 47984;

      discoveredHost.pollServer(function(returnedDiscoveredHost) {
        try {
          // Discard results from handshakes that finish while streaming.
          if (isInGame === true || !returnedDiscoveredHost.online) {
            finish(false);
            return;
          }

          if (hosts[returnedDiscoveredHost.serverUid] != null) {
            // Host already known — update its stored IP if it has changed.
            var existingAddress = hosts[returnedDiscoveredHost.serverUid].address;
            var existingBaseUrl = hosts[returnedDiscoveredHost.serverUid]._baseUrlHttps;
            if (existingAddress !== returnedDiscoveredHost.address || existingBaseUrl !== returnedDiscoveredHost._baseUrlHttps) {
              var isIpv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(existingAddress);
              // Do not overwrite IPv6 or DNS addresses if they are currently online.
              if (!isIpv4 && hosts[returnedDiscoveredHost.serverUid].online && existingBaseUrl === returnedDiscoveredHost._baseUrlHttps) {
                console.log('%c[main.js, findNvService]', 'color: gray;', 'Keeping existing non-IPv4 address since it is online:', existingAddress);
              } else {
                console.log('%c[main.js, findNvService]', 'color: gray;', 'Updating address for server UID:', returnedDiscoveredHost.serverUid, 'from', existingAddress, 'to', returnedDiscoveredHost.address);
                hosts[returnedDiscoveredHost.serverUid].address = returnedDiscoveredHost.address;
                hosts[returnedDiscoveredHost.serverUid].localAddress = returnedDiscoveredHost.localAddress;
                hosts[returnedDiscoveredHost.serverUid]._baseUrlHttp = returnedDiscoveredHost._baseUrlHttp;
                hosts[returnedDiscoveredHost.serverUid]._baseUrlHttps = returnedDiscoveredHost._baseUrlHttps;
                updateMacAddress(returnedDiscoveredHost);
                if (typeof hosts[returnedDiscoveredHost.serverUid].updateExternalAddressIP4 === 'function') {
                  hosts[returnedDiscoveredHost.serverUid].updateExternalAddressIP4();
                }
              }
            }

            // Refresh the live status of an already-known host.
            var existingHost = hosts[returnedDiscoveredHost.serverUid];
            existingHost.online = true;
            existingHost._statusVerified = true;
            existingHost._consecutivePollFailures = 0;
            updateHostStatusIndicator(existingHost);
            saveHosts();
            finish(false);
          } else {
            // New host — add to grid and begin background polling.
            addHostToGrid(returnedDiscoveredHost, true);
            beginBackgroundPollingOfHost(returnedDiscoveredHost, true);
            saveHosts();
            finish(true);
          }
        } catch (error) {
          console.error('%c[main.js, findNvService]', 'color: red;', 'Could not register discovered host:', error);
          finish(false);
        }
      });
    } catch (error) {
      console.error('%c[main.js, findNvService]', 'color: red;', 'Could not check discovered host:', error);
      finish(false);
    }
  });
}

/**
 * Scan the /24 subnet for Sunshine/GFE hosts. For each IP that responds with
 * HTTP 200 on port 47989, findNvService() runs the full NvHTTP handshake and
 * registers the host in the UI. See the findNvService() comment above for why
 * mDNS is not used on Tizen.
 */
window.subnetScanAbortCtrl = null;
window.subnetScanPromise = null;

window.abortSubnetScan = function() {
  if (manualSubnetScanPromise) {
    manualSubnetScanCancelled = true;
    if (manualSubnetScanAbortCtrl) {
      manualSubnetScanAbortCtrl.abort();
      manualSubnetScanAbortCtrl = null;
    }
  }
  if (window.subnetScanAbortCtrl) {
    console.log('%c[main.js]', 'color: orange;', 'User initiated action: Aborting background subnet scan to free network stack.');
    window.subnetScanAbortCtrl.abort();
    window.subnetScanAbortCtrl = null;
  }
};

// Manual discovery has its own controller and promise. It never shares the
// startup/Auto WOL scan lifecycle or the unified known-host discovery handler.
var manualSubnetScanAbortCtrl = null;
var manualSubnetScanPromise = null;
var manualSubnetScanCancelled = false;

function normalizeManualIPv4(value) {
  if (typeof value !== 'string') return null;
  value = value.trim();
  if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value)) return null;
  var octets = value.split('.').map(function(part) { return Number(part); });
  if (octets.some(function(part) { return !Number.isInteger(part) || part < 0 || part > 255; })) return null;
  return octets.join('.');
}

function startManualSubnetScanner() {
  if (isInGame === true) return Promise.resolve(0);
  if (manualSubnetScanPromise) return manualSubnetScanPromise;

  manualSubnetScanCancelled = false;
  manualSubnetScanPromise = new Promise(function(resolve, reject) {
    var localIp;
    var gatewayIp;
    try {
      localIp = normalizeManualIPv4(webapis.network.getIp());
      gatewayIp = normalizeManualIPv4(webapis.network.getGateway());
    } catch (error) {
      reject(new Error('Could not determine the TV or gateway IP for the manual network scan.'));
      return;
    }
    // Fail closed: never scan if we cannot guarantee that both the TV and
    // gateway are excluded from the candidate list.
    if (!localIp || !gatewayIp) {
      reject(new Error('Could not determine the TV or gateway IP for the manual network scan.'));
      return;
    }

    var excluded = Object.create(null);
    function exclude(value) {
      var ip = normalizeManualIPv4(value);
      if (ip) excluded[ip] = true;
    }
    exclude(localIp);
    exclude(gatewayIp);
    exclude('127.0.0.1');
    exclude('0.0.0.0');

    function excludeHostAddress(value) {
      if (typeof value !== 'string') return;
      exclude(value);
      // Also extract IPv4 literals embedded in HTTP(S) base URLs.
      var matches = value.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/g);
      if (matches) matches.forEach(exclude);
    }
    Object.keys(hosts || {}).forEach(function(uid) {
      var host = hosts[uid];
      if (!host) return;
      excludeHostAddress(host.address);
      excludeHostAddress(host.localAddress);
      excludeHostAddress(host.externalIP);
      excludeHostAddress(host.userEnteredAddress);
      excludeHostAddress(host.hostname);
      excludeHostAddress(host._baseUrlHttp);
      excludeHostAddress(host._baseUrlHttps);
    });

    var parts = localIp.split('.');
    var subnet = parts[0] + '.' + parts[1] + '.' + parts[2];
    var candidates = [];
    for (var i = 1; i <= 254; i++) {
      var candidate = subnet + '.' + i;
      if (!excluded[candidate]) candidates.push(candidate);
    }

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    manualSubnetScanAbortCtrl = controller;
    var pendingChecks = [];
    var nextIndex = 0;
    var activeRequests = 0;
    var settled = false;
    var concurrency = 64;

    function isActive() {
      return !manualSubnetScanCancelled && isInGame !== true &&
        manualSubnetScanAbortCtrl === controller;
    }
    function finish() {
      if (settled || activeRequests !== 0 || (isActive() && nextIndex < candidates.length)) return;
      settled = true;
      Promise.all(pendingChecks).then(function(results) {
        if (manualSubnetScanAbortCtrl === controller) manualSubnetScanAbortCtrl = null;
        manualSubnetScanPromise = null;
        resolve(results.filter(function(isNew) { return isNew; }).length);
      }, function(error) {
        if (manualSubnetScanAbortCtrl === controller) manualSubnetScanAbortCtrl = null;
        manualSubnetScanPromise = null;
        reject(error);
      });
    }

    function scanNext() {
      if (!isActive() || nextIndex >= candidates.length) {
        finish();
        return;
      }
      var ip = candidates[nextIndex++];
      activeRequests++;
      var requestController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var requestDone = false;
      var timeoutId = setTimeout(function() {
        if (requestController) requestController.abort();
        completeRequest(null);
      }, 1000);
      function completeRequest(response) {
        if (requestDone) return;
        requestDone = true;
        clearTimeout(timeoutId);
        if (response && response.ok && isActive()) {
          pendingChecks.push(findNewNvService('ipv4:' + ip, isActive));
        }
        activeRequests--;
        if (isActive() && nextIndex < candidates.length) scanNext();
        finish();
      }
      if (controller) {
        controller.signal.addEventListener('abort', function() {
          if (requestController) requestController.abort();
        }, { once: true });
      }
      try {
        fetch('http://' + ip + ':47989/serverinfo', requestController ? { signal: requestController.signal } : {})
          .then(completeRequest, function() { completeRequest(null); });
      } catch (error) {
        completeRequest(null);
      }
    }

    if (candidates.length === 0) {
      finish();
      return;
    }
    for (var slot = 0; slot < Math.min(concurrency, candidates.length); slot++) scanNext();
  });

  manualSubnetScanPromise = manualSubnetScanPromise.catch(function(error) {
    manualSubnetScanPromise = null;
    throw error;
  });
  return manualSubnetScanPromise;
}

// Auto WOL uses a private scan lifecycle and verifies every candidate against
// the target server UID. It never registers discoveries or mutates other hosts.
function normalizeAutoWolIPv4(value) {
  if (typeof value !== 'string') return null;
  value = value.trim();
  if (!/^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$/.test(value)) return null;
  var octets = value.split('.').map(function(part) { return Number(part); });
  if (octets.some(function(part) { return !Number.isInteger(part) || part < 0 || part > 255; })) return null;
  return octets.join('.');
}

function abortAutoWolSubnetScan(operation) {
  if (!operation) return;
  operation.cancelled = true;
  if (operation.abortController) {
    operation.abortController.abort();
    operation.abortController = null;
  }
}

function startAutoWolSubnetScanner(targetHost, operation) {
  if (!targetHost || !targetHost.serverUid || !operation ||
      operation.cancelled || isInGame === true) {
    return Promise.resolve(false);
  }
  if (operation.promise) return operation.promise;

  var localIp;
  var gatewayIp = null;
  try {
    localIp = normalizeAutoWolIPv4(webapis.network.getIp());
    gatewayIp = normalizeAutoWolIPv4(webapis.network.getGateway());
  } catch (error) {
    return Promise.resolve(false);
  }
  if (!localIp) return Promise.resolve(false);

  var excluded = Object.create(null);
  function excludeAddress(value) {
    if (typeof value !== 'string') return;
    var direct = normalizeAutoWolIPv4(value);
    if (direct) excluded[direct] = true;
    // Include IPv4 literals embedded in hostnames or HTTP(S) base URLs.
    var matches = value.match(/(?:[0-9]{1,3}\\.){3}[0-9]{1,3}/g);
    if (matches) matches.forEach(function(match) {
      var ip = normalizeAutoWolIPv4(match);
      if (ip) excluded[ip] = true;
    });
  }

  excludeAddress(localIp);
  excludeAddress(gatewayIp);
  excludeAddress('127.0.0.1');
  excludeAddress('0.0.0.0');
  Object.keys(hosts || {}).forEach(function(uid) {
    var knownHost = hosts[uid];
    if (!knownHost) return;
    excludeAddress(knownHost.address);
    excludeAddress(knownHost.localAddress);
    excludeAddress(knownHost.externalIP);
    excludeAddress(knownHost.userEnteredAddress);
    excludeAddress(knownHost.hostname);
    excludeAddress(knownHost._baseUrlHttp);
    excludeAddress(knownHost._baseUrlHttps);
  });

  var subnetParts = localIp.split('.');
  var subnet = subnetParts[0] + '.' + subnetParts[1] + '.' + subnetParts[2];
  var candidates = [];
  for (var i = 1; i <= 254; i++) {
    var candidate = subnet + '.' + i;
    if (!excluded[candidate]) candidates.push(candidate);
  }

  var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  operation.abortController = controller;
  var pendingChecks = [];
  var nextIndex = 0;
  var activeRequests = 0;
  var targetFound = false;
  var settled = false;

  function isActive() {
    return operation.cancelled !== true && isInGame !== true &&
      operation.abortController === controller;
  }

  function checkTargetAtAddress(ip) {
    return new Promise(function(resolve) {
      var completed = false;
      function finish(found) {
        if (completed) return;
        completed = true;
        resolve(found === true);
      }
      if (!isActive() || targetFound) {
        finish(false);
        return;
      }

      try {
        var candidateHost = new NvHTTP(ip, myUniqueid);
        candidateHost.httpPort = 47989;
        candidateHost.httpsPort = 47984;
        // _parseServerInfo rejects any response whose UID differs from this
        // expected identity, so another known or unknown host cannot be adopted.
        candidateHost.serverUid = targetHost.serverUid;
        candidateHost.pollServer(function(returnedHost) {
          if (!isActive() || targetFound || !returnedHost.online ||
              returnedHost.serverUid !== targetHost.serverUid) {
            finish(false);
            return;
          }

          targetFound = true;
          var applyTargetAddress = function() {
            if (!isActive()) {
              finish(false);
              return;
            }
            // Serialize the address change after any already-running poll of
            // the registered object, preventing that older poll from restoring
            // its stale address after this discovery completes.
            targetHost.address = returnedHost.address;
            targetHost.localAddress = returnedHost.localAddress;
            if (returnedHost.externalIP) targetHost.externalIP = returnedHost.externalIP;
            targetHost.httpPort = returnedHost.httpPort;
            targetHost.httpsPort = returnedHost.httpsPort;
            targetHost.externalPort = returnedHost.externalPort;
            targetHost._baseUrlHttp = returnedHost._baseUrlHttp;
            targetHost._baseUrlHttps = returnedHost._baseUrlHttps;
            if (returnedHost.macAddress && returnedHost.macAddress !== '00:00:00:00:00:00') {
              targetHost.macAddress = returnedHost.macAddress;
            }
            targetHost.online = true;
            targetHost._statusVerified = true;
            targetHost._consecutivePollFailures = 0;
            updateHostStatusIndicator(targetHost);
            saveHosts();
            finish(true);
          };

          if (targetHost._pollInProgress) {
            targetHost.pollServer(applyTargetAddress);
          } else {
            applyTargetAddress();
          }
        });
      } catch (error) {
        finish(false);
      }
    });
  }

  var scanPromise = new Promise(function(resolve) {
    function finishScan() {
      if (settled || activeRequests !== 0 ||
          (isActive() && !targetFound && nextIndex < candidates.length)) return;
      settled = true;
      Promise.all(pendingChecks).then(function(results) {
        resolve(isActive() && results.some(function(found) { return found === true; }));
      }, function() {
        resolve(false);
      });
    }

    function scanNext() {
      if (!isActive() || targetFound || nextIndex >= candidates.length) {
        finishScan();
        return;
      }

      var ip = candidates[nextIndex++];
      activeRequests++;
      var requestController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var requestSettled = false;
      var timeoutId = window.setTimeout(function() {
        if (requestController) requestController.abort();
        completeRequest(null);
      }, 1000);

      function completeRequest(response) {
        if (requestSettled) return;
        requestSettled = true;
        window.clearTimeout(timeoutId);
        if (controller) controller.signal.removeEventListener('abort', onOperationAbort);
        if (response && response.ok && isActive() && !targetFound) {
          pendingChecks.push(checkTargetAtAddress(ip));
        }
        activeRequests--;
        if (isActive() && !targetFound && nextIndex < candidates.length) scanNext();
        finishScan();
      }

      function onOperationAbort() {
        if (requestController) requestController.abort();
      }
      if (controller) {
        controller.signal.addEventListener('abort', onOperationAbort, { once: true });
      }

      try {
        fetch('http://' + ip + ':47989/serverinfo',
          requestController ? { signal: requestController.signal } : {})
          .then(completeRequest, function() { completeRequest(null); });
      } catch (error) {
        completeRequest(null);
      }
    }

    if (candidates.length === 0) {
      finishScan();
      return;
    }
    for (var slot = 0; slot < Math.min(64, candidates.length); slot++) scanNext();
  });

  operation.promise = scanPromise;
  scanPromise.then(function() {
    if (operation.promise === scanPromise) operation.promise = null;
    if (operation.abortController === controller) operation.abortController = null;
  }, function() {
    if (operation.promise === scanPromise) operation.promise = null;
    if (operation.abortController === controller) operation.abortController = null;
  });
  return scanPromise;
}

function findNewNvService(ipString, isScanActive) {
  var ip = ipString.replace('ipv4:', '');
  return new Promise(function(resolve) {
    var completed = false;
    function finish(isNew) {
      if (completed) return;
      completed = true;
      resolve(isNew === true);
    }
    if (typeof isScanActive !== 'function' || !isScanActive()) {
      finish(false);
      return;
    }
    try {
      var discoveredHost = new NvHTTP(ip, myUniqueid);
      discoveredHost.httpPort = 47989;
      discoveredHost.httpsPort = 47984;
      discoveredHost.pollServer(function(returnedHost) {
        try {
          // A cancelled scan or an existing server UID must never mutate a
          // known host. Only genuinely new identities are registered here.
          if (!isScanActive() || !returnedHost.online ||
              hosts[returnedHost.serverUid] != null) {
            finish(false);
            return;
          }
          addHostToGrid(returnedHost, true);
          beginBackgroundPollingOfHost(returnedHost, true);
          saveHosts();
          finish(true);
        } catch (error) {
          console.error('%c[main.js, findNewNvService]', 'color: red;', 'Could not register new host:', error);
          finish(false);
        }
      });
    } catch (error) {
      console.error('%c[main.js, findNewNvService]', 'color: red;', 'Could not check new host:', error);
      finish(false);
    }
  });
}

function startSubnetScanner(excludedIPs, trackDiscoveryResults) {
  // Do not begin a new subnet scan while the stream is active.
  if (isInGame === true) {
    console.log('%c[main.js, startSubnetScanner]', 'color: orange;', 'Skipping subnet scan while streaming.');
    return Promise.resolve();
  }

  if (window.subnetScanPromise) {
    console.log('%c[main.js, startSubnetScanner]', 'color: orange;', 'Subnet scan already in progress, skipping new scan.');
    return window.subnetScanPromise;
  }

  window.subnetScanPromise = new Promise(function(resolve) {
    var pendingDiscoveryChecks = [];
    var scanResolved = false;

    function finishScan() {
      if (scanResolved) return;
      scanResolved = true;
      function complete(result) {
        window.subnetScanPromise = null;
        resolve(result);
      }
      if (trackDiscoveryResults && pendingDiscoveryChecks.length > 0) {
        Promise.all(pendingDiscoveryChecks).then(function(results) {
          complete(results.filter(function(isNewHost) { return isNewHost; }).length);
        }, function() {
          complete(0);
        });
      } else {
        complete(0);
      }
    }

    try {
      var localIp = (typeof webapis !== 'undefined' && webapis.network) ? webapis.network.getIp() : null;
      // If the local IP cannot be determined, skip the subnet scan to avoid unnecessary network traffic
      if (!localIp) {
        window.subnetScanPromise = null;
        return resolve();
      }
      
      var parts = localIp.split('.');
      // Check if the IP address is in the expected IPv4 format
      if (parts.length !== 4) {
        console.warn('%c[main.js, startSubnetScanner]', 'color: orange;', 'Unexpected IP format:', localIp);
        window.subnetScanPromise = null;
        return resolve();
      }
      
      var subnet = parts[0] + '.' + parts[1] + '.' + parts[2];
      console.log('%c[main.js, startSubnetScanner]', 'color: green;', 'Starting chunked subnet /24 scan on', subnet + '.0/24');
      
      if (window.subnetScanAbortCtrl) {
        window.subnetScanAbortCtrl.abort();
      }
      window.subnetScanAbortCtrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      
      // Startup and Auto WOL scans exclude the TV, gateway, and the known
      // host addresses supplied here. Manual refresh uses its own stricter
      // scanner and does not enter this shared discovery lifecycle.
      var excludedIPSet = Object.create(null);
      function addExcludedIPv4(ip) {
        if (typeof ip !== 'string' ||
            !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) return;
        var octets = ip.split('.');
        if (octets.some(function(octet) {
          return Number(octet) < 0 || Number(octet) > 255;
        })) return;
        excludedIPSet[ip] = true;
      }

      addExcludedIPv4(localIp);
      try {
        if (typeof webapis !== 'undefined' && webapis.network &&
            typeof webapis.network.getGateway === 'function') {
          addExcludedIPv4(webapis.network.getGateway());
        }
      } catch (gatewayError) {
        console.warn('%c[main.js, startSubnetScanner]', 'color: orange;', 'Could not determine the network gateway; continuing without excluding it:', gatewayError);
      }

      if (Array.isArray(excludedIPs)) {
        excludedIPs.forEach(addExcludedIPv4);
      }
      if (typeof hosts !== 'undefined' && hosts) {
        Object.keys(hosts).forEach(function(hostUID) {
          var host = hosts[hostUID];
          if (host) {
            addExcludedIPv4(host.address);
            addExcludedIPv4(host.externalIP);
          }
        });
      }

      var IPs = [];
      for (var i = 1; i <= 254; i++) {
        var candidateIP = subnet + '.' + i;
        if (!excludedIPSet[candidateIP]) IPs.push(candidateIP);
      }
      console.log('%c[main.js, startSubnetScanner]', 'color: green;', 'Subnet scan will probe', IPs.length, 'of 254 addresses; excluded', 254 - IPs.length, 'addresses (TV, gateway, known hosts, and previously checked IPs).');

      if (IPs.length === 0) {
        finishScan();
        return;
      }

      var index = 0;
      var activeCount = 0;
      var concurrency = 64; // Throttle to 64 to save Tizen's ARP queue
      
      function scanNext() {
        // Let requests already in flight finish, but do not launch further addresses
        // after streaming starts. Resolve the scan once those requests have drained.
        if (isInGame === true) {
          if (activeCount === 0) {
            finishScan();
          }
          return;
        }

        if (!window.subnetScanAbortCtrl || index >= IPs.length) {
          if (activeCount === 0) {
            finishScan();
          }
          return;
        }
        
        var ip = IPs[index++];
        activeCount++;
        
        var localAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var requestSettled = false;
        var timeoutId = null;

        // Some Tizen WebKit builds do not reliably reject fetch() after abort().
        // Always release the scan slot on timeout so the /24 scan can finish.
        function finishRequest(res) {
          if (requestSettled) return;
          requestSettled = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
          if (window.subnetScanAbortCtrl) {
            window.subnetScanAbortCtrl.signal.removeEventListener('abort', onGlobalAbort);
          }
          if (res && res.ok && isInGame !== true) {
            console.log('%c[main.js, startSubnetScanner]', 'color: green;', 'Found host with IP address:', ip);
            var discoveryCheck = findNvService('ipv4:' + ip);
            if (trackDiscoveryResults) pendingDiscoveryChecks.push(discoveryCheck);
          }
          activeCount--;
          scanNext();
        }

        var onGlobalAbort = function() {
          if (localAbort) localAbort.abort();
          // The fetch rejection or the 1-second fallback will release this slot.
          // Avoid advancing the scan synchronously before abortSubnetScan clears
          // the global controller reference.
        };

        if (window.subnetScanAbortCtrl) {
          window.subnetScanAbortCtrl.signal.addEventListener('abort', onGlobalAbort);
        }

        timeoutId = setTimeout(function() {
          if (localAbort) localAbort.abort();
          finishRequest(null);
        }, 1000);

        try {
          fetch('http://' + ip + ':47989/serverinfo', localAbort ? { signal: localAbort.signal } : {})
            .then(function(res) {
              finishRequest(res);
            })
            .catch(function() {
              finishRequest(null);
            });
        } catch (error) {
          finishRequest(null);
        }
      }
      
      // Kick off the initial batch of 64 concurrent scans
      for (var c = 0; c < Math.min(concurrency, IPs.length); c++) {
        scanNext();
      }
    } catch (e) {
      console.error('%c[main.js, startSubnetScanner]', 'color: red;', 'Subnet scanner failed:', e);
      finishScan();
    }
  });
  return window.subnetScanPromise;
}

/**
 * Construct a new ServiceFinder. This is a single-use object that does a DNS
 * multicast search on creation.
 * @constructor
 * @param {function} callback The callback to be invoked when this object is
 *                            updated, or when an error occurs (passes string).
 */
// var ServiceFinder = function(callback) {
//   this.callback_ = callback;
//   this.byIP_ = {};
//   this.byService_ = {};

//  // Set up receive handlers
//   this.onReceiveListener_ = this.onReceive_.bind(this);
//   chrome.sockets.udp.onReceive.addListener(this.onReceiveListener_);
//   this.onReceiveErrorListener_ = this.onReceiveError_.bind(this);
//   chrome.sockets.udp.onReceiveError.addListener(this.onReceiveErrorListener_);

//   ServiceFinder.forEachAddress_(function(address, error) {
//     if (error) {
//       this.callback_(error);
//       return true;
//     }
//     if (address.indexOf(':') != -1) {
//      // TODO: Support IPv6
//       console.log('%c[main.js, ServiceFinder]', 'color: gray;', 'IPv6 address unsupported: ' + address);
//       return true;
//     }
//     console.log('%c[main.js, ServiceFinder]', 'color: gray;', 'Broadcasting to address: ' + address);

//     ServiceFinder.bindToAddress_(address, function(socket) {
//       if (!socket) {
//         this.callback_('could not bind UDP socket');
//         return true;
//       }
//      // Broadcast on it
//       this.broadcast_(socket, address);
//     }.bind(this));
//   }.bind(this));

//  // After a short time, if our database is empty, report an error
//   setTimeout(function() {
//     if (!Object.keys(this.byIP_).length) {
//       this.callback_('no mDNS services found!');
//     }
//   }.bind(this), 10 * 1000);
// };

/**
 * Invokes the callback for every local network address on the system.
 * @private
 * @param {function} callback to invoke
 */
// ServiceFinder.forEachAddress_ = function(callback) {
//   chrome.system.network.getNetworkInterfaces(function(networkInterfaces) {
//     if (!networkInterfaces.length) {
//       callback(null, 'no network available!');
//       return true;
//     }
//     networkInterfaces.forEach(function(networkInterface) {
//       callback(networkInterface['address'], null);
//     });
//   });
// };

/**
 * Creates UDP socket bound to the specified address, passing it to the
 * callback. Passes null on failure.
 * @private
 * @param {string} address to bind to
 * @param {function} callback to invoke when done
 */
// ServiceFinder.bindToAddress_ = function(address, callback) {
//   chrome.sockets.udp.create({}, function(createInfo) {
//     chrome.sockets.udp.bind(createInfo['socketId'], address, 0, function(result) {
//       callback((result >= 0) ? createInfo['socketId'] : null);
//     });
//   });
// };

/**
 * Sorts the passed list of string IPs in-place.
 * @private
 */
// ServiceFinder.sortIps_ = function(arg) {
//   arg.sort(ServiceFinder.sortIps_.sort);
//   return arg;
// };

// ServiceFinder.sortIps_.sort = function(l, r) {
//  // TODO: Support IPv6
//   var lp = l.split('.').map(ServiceFinder.sortIps_.toInt_);
//   var rp = r.split('.').map(ServiceFinder.sortIps_.toInt_);
//   for (var i = 0; i < Math.min(lp.length, rp.length); ++i) {
//     if (lp[i] < rp[i]) {
//       return -1;
//     } else if (lp[i] > rp[i]) {
//       return +1;
//     }
//   }
//   return 0;
// };

// ServiceFinder.sortIps_.toInt_ = function(i) { 
//   return +i
// };

/**
 * Returns the services found by this ServiceFinder, optionally filtered by IP.
 */
// ServiceFinder.prototype.services = function(opt_ip) {
//   var k = Object.keys(opt_ip ? this.byIP_[opt_ip] : this.byService_);
//   k.sort();
//   return k;
// };

/**
 * Returns the IPs found by this ServiceFinder, optionally filtered by service.
 */
// ServiceFinder.prototype.ips = function(opt_service) {
//   var k = Object.keys(opt_service ? this.byService_[opt_service] : this.byIP_);
//   return ServiceFinder.sortIps_(k);
// };

/**
 * Handles an incoming UDP packet.
 * @private
 */
// ServiceFinder.prototype.onReceive_ = function(info) {
//   var getDefault_ = function(o, k, def) {
//     (k in o) || false == (o[k] = def);
//     return o[k];
//   };

//  // Update our local database
//  // TODO: Resolve IPs using the DNS extension
//   var packet = DNSPacket.parse(info.data);
//   var byIP = getDefault_(this.byIP_, info.remoteAddress, {});

//   packet.each('an', 12, function(rec) {
//     var ptr = rec.asName();
//     var byService = getDefault_(this.byService_, ptr, {})
//     byService[info.remoteAddress] = true;
//     byIP[ptr] = true;
//   }.bind(this));

//  // Ping! Something new is here. Only update every 500ms
//   if (!this.callback_pending_) {
//     this.callback_pending_ = true;
//     setTimeout(function() {
//       this.callback_pending_ = undefined;
//       this.callback_();
//     }.bind(this), 500);
//   }
// };

/**
 * Handles network error occurred while waiting for data.
 * @private
 */
// ServiceFinder.prototype.onReceiveError_ = function(info) {
//   this.callback_(info.resultCode);
//   return true;
// };

/**
 * Broadcasts for services on the given socket/address.
 * @private
 */
// ServiceFinder.prototype.broadcast_ = function(sock, address) {
//   var packet = new DNSPacket();
//   packet.push('qd', new DNSRecord('_services._dns-sd._udp.local', 12, 1));

//   var raw = packet.serialize();
//   chrome.sockets.udp.send(sock, raw, '224.0.0.251', 5353, function(sendInfo) {
//     if (sendInfo.resultCode < 0) {
//       this.callback_('Could not send data to:' + address);
//     }
//   });
// };

// ServiceFinder.prototype.shutdown = function() {
//  // Remove event listeners
//   chrome.sockets.udp.onReceive.removeListener(this.onReceiveListener_);
//   chrome.sockets.udp.onReceiveError.removeListener(this.onReceiveErrorListener_);
//  // Close opened sockets
//   chrome.sockets.udp.getSockets(function(sockets) {
//     sockets.forEach(function(sock) {
//       chrome.sockets.udp.close(sock.socketId);
//     });
//   });
// };

// var finder = null;
// function findNvService(callback) {
//   finder && finder.shutdown();
//   finder = new ServiceFinder(function(opt_error) {
//     callback(finder, opt_error);
//   });
// }
