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
  if (window.subnetScanAbortCtrl) {
    console.log('%c[main.js]', 'color: orange;', 'User initiated action: Aborting background subnet scan to free network stack.');
    window.subnetScanAbortCtrl.abort();
    window.subnetScanAbortCtrl = null;
  }
};

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
      
      // Every scan excludes the TV itself, the configured gateway, and
      // every already-known host. Startup may additionally pass addresses
      // checked in phase 2; the same baseline exclusions apply to manual
      // refresh and Auto WOL scans as well.
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
            window.subnetScanPromise = null;
            resolve();
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
