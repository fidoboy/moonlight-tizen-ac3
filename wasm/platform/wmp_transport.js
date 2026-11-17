/*
 * Moonlight ESPlusPlayer native control channel.
 *
 * Control messages use trusted Tizen MessagePorts. This channel is for small
 * commands and status replies only; encoded audio/video packets must use a
 * separate data path.
 */
(function(global) {
  'use strict';

  // Keep the legacy service application ID, MessagePort names, and protocol stable
  // so an app update can continue using the already-registered native service.
  var SERVICE_APP_ID = 'MoonLightS.WmpService';
  var SUPERVISOR_APP_ID = 'MoonLightS.WmpSupervisor';
  var SUPERVISOR_CONTROL_PORT = 'MoonlightWmpSupervisorControl';
  var CONTROL_PORT = 'MoonlightWmpControl';
  var REPLY_PORT = 'MoonlightWmpReply';
  var PROTOCOL = 'moonlight-wmp/1';

  var localPort = null;
  var remotePort = null;
  var supervisorRemotePort = null;
  var listenerId = null;
  var connectPromise = null;
  var connectionReady = false;
  var nextRequestId = 0;
  var pending = Object.create(null);
  var startupDiagnosticPollTimer = null;
  var startupDiagnosticPollCount = 0;
  var startupDiagnosticPollStartedAt = 0;
  var startupDiagnosticPollDelayMs = 1000;
  var startupDiagnosticPollingActive = false;
  var startupDiagnosticPollInFlight = null;
  var startupDiagnosticFinalSnapshotRequested = false;
  var startupDiagnosticTerminalEventSeen = false;
  var nativeTerminationEventSeen = false;
  var appStatusListenerId = null;
  var serviceStatusWasActive = false;
  var startSessionPending = false;
  var startSessionAccepted = false;
  var serviceExitObservedDuringStart = false;
  var unexpectedServiceExitReported = false;
  var supervisorTerminationObserved = false;
  var supervisorTerminationDetail = null;

  // Passive log retrieval only: this never changes stream state, readiness,
  // recovery, or termination. It keeps diagnostics flowing while the native
  // StartSessionV2 call is still in progress. The service owns session state.

  function debugLog(stage, details) {
    // The runtime log policy also filters console.debug, but keep this guard
    // here so ESPlusPlayer diagnostics can never leak into a non-Debug build.
    if (global.DEBUG_MODE !== true ||
        !global.console ||
        typeof global.console.debug !== 'function') return;
    try {
      global.console.debug('[esplusplayer]', stage, details === undefined ? '' : details);
    } catch (error) {}
  }

  function errorDetails(error) {
    if (!error) return {message: String(error)};
    return {
      name: error.name || null,
      message: error.message || String(error),
      code: error.code !== undefined ? error.code : null,
      domain: error.domain !== undefined ? error.domain : null
    };
  }

  function summarizePayload(command, payload) {
    if (!payload || typeof payload !== 'object' || command !== 'start_session') return {};
    return {
      hostProvided: !!payload.host,
      resolution: payload.w && payload.h ? String(payload.w) + 'x' + String(payload.h) : null,
      fps: payload.fps,
      bitrateKbps: payload.bitrate,
      codecMode: payload.codecMode,
      audioEnabled: payload.audioEnabled === true,
      audioConfig: payload.audioConfig,
      opticalOutputEnabled: !!payload.opticalOutputEnabled,
      videoCodec: payload.videoCodec,
      hdr: !!payload.hdr,
      fullRange: !!payload.fullRange,
      gameMode: payload.gameMode === true,
      debugMode: payload.debugMode === true
    };
  }

  function makeError(message) {
    return new Error('ESPlusPlayer transport: ' + message);
  }

  // Every stream starts from a new ServiceApplication process. MessagePort
  // names are process-scoped, so a previous process must be fully gone before
  // the new process is launched and its ports are requested.
  var SERVICE_STOP_VERIFY_ATTEMPTS = 30;
  var SERVICE_STOP_VERIFY_DELAY_MS = 100;
  var SERVICE_LIFECYCLE_CALLBACK_TIMEOUT_MS = 5000;

  function getRunningServiceContexts(applicationId) {
    applicationId = applicationId || SERVICE_APP_ID;
    return new Promise(function(resolve, reject) {
      try {
        if (!global.tizen || !tizen.application ||
            typeof tizen.application.getAppsContext !== 'function') {
          throw makeError('Tizen running-application inspection is unavailable');
        }
        var settled = false;
        var timeoutId = global.setTimeout(function() {
          if (settled) return;
          settled = true;
          reject(makeError('checking the native service state timed out'));
        }, SERVICE_LIFECYCLE_CALLBACK_TIMEOUT_MS);
        tizen.application.getAppsContext(function(contexts) {
          if (settled) return;
          settled = true;
          global.clearTimeout(timeoutId);
          contexts = Array.isArray(contexts) ? contexts : [];
          resolve(contexts.filter(function(context) {
            return context && context.appId === applicationId;
          }));
        }, function(error) {
          if (settled) return;
          settled = true;
          global.clearTimeout(timeoutId);
          reject(makeError('could not inspect running native services: ' +
            (error && error.message ? error.message : String(error))));
        });
      } catch (error) {
        reject(error && error.message && error.message.indexOf('ESPlusPlayer transport:') === 0
          ? error
          : makeError('could not inspect running native services: ' +
            (error && error.message ? error.message : String(error))));
      }
    });
  }

  function waitForServiceStopped(applicationId, attempt) {
    return getRunningServiceContexts(applicationId).then(function(contexts) {
      if (contexts.length === 0) return true;
      if (attempt >= SERVICE_STOP_VERIFY_ATTEMPTS) {
        throw makeError('previous native service did not stop completely');
      }
      return new Promise(function(resolve) {
        global.setTimeout(resolve, SERVICE_STOP_VERIFY_DELAY_MS);
      }).then(function() {
        return waitForServiceStopped(applicationId, attempt + 1);
      });
    });
  }

  function stopExistingApplication(applicationId, label) {
    return getRunningServiceContexts(applicationId).then(function(contexts) {
      if (contexts.length === 0) {
        debugLog('no previous native application process is running', {
          serviceAppId: applicationId
        });
        return true;
      }
      if (!tizen.application || typeof tizen.application.kill !== 'function') {
        throw makeError('Tizen application termination is unavailable; cannot guarantee a clean service start');
      }

      debugLog('stopping previous native application process', {
        serviceAppId: applicationId,
        runningInstances: contexts.length
      });

      return contexts.reduce(function(chain, context) {
        return chain.then(function() {
          return new Promise(function(resolve, reject) {
            var settled = false;
            var timeoutId = global.setTimeout(function() {
              if (settled) return;
              settled = true;
              reject(makeError('stopping the previous native service timed out'));
            }, SERVICE_LIFECYCLE_CALLBACK_TIMEOUT_MS);
            function finish(error) {
              if (settled) return;
              settled = true;
              global.clearTimeout(timeoutId);
              if (error) reject(error);
              else resolve();
            }
            try {
              tizen.application.kill(context.id, function() {
                debugLog('previous native application process termination requested', {
                  serviceAppId: applicationId,
                  contextId: context.id
                });
                finish();
              }, function(error) {
                // The process may have exited between getAppsContext and kill.
                // The mandatory verification below decides whether it is gone.
                if (error && error.name === 'NotFoundError') {
                  finish();
                  return;
                }
                finish(makeError('could not stop previous native service: ' +
                  (error && error.message ? error.message : String(error))));
              });
            } catch (error) {
              finish(makeError('could not stop previous native service: ' +
                (error && error.message ? error.message : String(error))));
            }
          });
        });
      }, Promise.resolve()).then(function() {
        return waitForServiceStopped(applicationId, 0);
      });
    });
  }

  function stopExistingService() {
    return stopExistingApplication(SERVICE_APP_ID, 'ESPlusPlayer');
  }

  function stopExistingSupervisor() {
    return stopExistingApplication(SUPERVISOR_APP_ID, 'WMP supervisor');
  }

  function launchSupervisorAndWait() {
    return new Promise(function(resolve, reject) {
      if (!global.tizen || !tizen.application ||
          typeof tizen.application.launch !== 'function' ||
          !tizen.messageport ||
          typeof tizen.messageport.requestTrustedRemoteMessagePort !== 'function') {
        reject(makeError('Tizen APIs required by the independent WMP supervisor are unavailable'));
        return;
      }

      var attempt = 0;
      var maxAttempts = 30;
      function openSupervisorPort() {
        attempt++;
        try {
          var candidate = tizen.messageport.requestTrustedRemoteMessagePort(
            SUPERVISOR_APP_ID, SUPERVISOR_CONTROL_PORT
          );
          if (!candidate || candidate.isTrusted !== true) {
            throw makeError('trusted WMP supervisor control port is unavailable');
          }
          supervisorRemotePort = candidate;
          debugLog('independent WMP process supervisor is ready', {
            supervisorAppId: SUPERVISOR_APP_ID,
            controlPort: SUPERVISOR_CONTROL_PORT,
            attempts: attempt
          });
          resolve(true);
        } catch (error) {
          var notReady = error && (error.name === 'NotFoundError' ||
            /port.{0,80}not found|not found.{0,80}port/i.test(error.message || ''));
          if (notReady && attempt < maxAttempts) {
            global.setTimeout(openSupervisorPort, 100);
            return;
          }
          reject(makeError('independent WMP supervisor did not publish its trusted control port: ' +
            (error && error.message ? error.message : String(error))));
        }
      }

      try {
        debugLog('launching independent WMP process supervisor', {
          supervisorAppId: SUPERVISOR_APP_ID
        });
        tizen.application.launch(SUPERVISOR_APP_ID, function() {
          debugLog('independent WMP supervisor launch callback succeeded', {
            supervisorAppId: SUPERVISOR_APP_ID
          });
          openSupervisorPort();
        }, function(error) {
          debugLog('independent WMP supervisor launch failed', {
            supervisorAppId: SUPERVISOR_APP_ID,
            error: errorDetails(error)
          });
          reject(makeError('could not launch independent WMP supervisor: ' +
            (error && error.message ? error.message : String(error))));
        });
      } catch (error) {
        reject(makeError('could not launch independent WMP supervisor: ' +
          (error && error.message ? error.message : String(error))));
      }
    });
  }

  // Tizen reports application activation/deactivation directly. This is an
  // OS lifecycle notification, not a JavaScript stream watchdog or a session
  // state inference. It lets the UI report a native process that vanished
  // without sending its streamTerminated event.
  function registerServiceStatusListener() {
    if (!global.tizen || !tizen.application ||
        typeof tizen.application.addAppStatusChangeListener !== 'function' ||
        typeof tizen.application.removeAppStatusChangeListener !== 'function') {
      throw makeError('Tizen native service status notifications are unavailable');
    }

    serviceStatusWasActive = false;
    startSessionPending = false;
    startSessionAccepted = false;
    serviceExitObservedDuringStart = false;
    unexpectedServiceExitReported = false;
    nativeTerminationEventSeen = false;
    supervisorTerminationObserved = false;
    supervisorTerminationDetail = null;

    appStatusListenerId = tizen.application.addAppStatusChangeListener(
      function(appId, isActive) {
        if (appId !== SERVICE_APP_ID) return;
        if (isActive) {
          serviceStatusWasActive = true;
          debugLog('Tizen reports the native service as active', {serviceAppId: SERVICE_APP_ID});
          return;
        }

        if (!serviceStatusWasActive) return;
        serviceStatusWasActive = false;
        debugLog('Tizen reports the native service as inactive; verifying its process context', {
          serviceAppId: SERVICE_APP_ID,
          startSessionPending: startSessionPending,
          startSessionAccepted: startSessionAccepted,
          nativeTerminationEventSeen: nativeTerminationEventSeen
        });
        if (nativeTerminationEventSeen || unexpectedServiceExitReported) return;

        try {
          tizen.application.getAppsContext(function(contexts) {
            contexts = Array.isArray(contexts) ? contexts : [];
            var stillRunning = contexts.some(function(context) {
              return context && context.appId === SERVICE_APP_ID;
            });
            if (stillRunning) {
              // An inactive application can still have a live process. Do not
              // turn an activation-state change into a stream failure.
              serviceStatusWasActive = true;
              debugLog('native service became inactive but its process is still running', {
                serviceAppId: SERVICE_APP_ID
              });
              return;
            }

            if (nativeTerminationEventSeen || unexpectedServiceExitReported) return;
            if (startSessionPending) {
              serviceExitObservedDuringStart = true;
              var startError = makeError('native service exited unexpectedly while starting the stream');
              Object.keys(pending).forEach(function(id) {
                var pendingRequest = pending[id];
                if (!pendingRequest || pendingRequest.command !== 'start_session') return;
                delete pending[id];
                if (pendingRequest.timeoutId !== null && pendingRequest.timeoutId !== undefined) {
                  global.clearTimeout(pendingRequest.timeoutId);
                }
                pendingRequest.reject(startError);
              });
              return;
            }
            if (startSessionAccepted) reportUnexpectedServiceExit();
          }, function(error) {
            var details = errorDetails(error);
            var reason = 'Tizen reported the ESPlusPlayer service as inactive, but its process status could not be verified: ' +
              details.message;
            if (global.console && typeof global.console.error === 'function') {
              global.console.error('[esplusplayer] Could not verify native service process after Tizen status change', {
                serviceAppId: SERVICE_APP_ID,
                error: details
              });
            }
            if (startSessionPending) {
              serviceExitObservedDuringStart = true;
              var verificationError = makeError(reason);
              Object.keys(pending).forEach(function(id) {
                var pendingRequest = pending[id];
                if (!pendingRequest || pendingRequest.command !== 'start_session') return;
                delete pending[id];
                if (pendingRequest.timeoutId !== null && pendingRequest.timeoutId !== undefined) {
                  global.clearTimeout(pendingRequest.timeoutId);
                }
                pendingRequest.reject(verificationError);
              });
            } else if (startSessionAccepted) {
              reportUnexpectedServiceExit(reason);
            }
          });
        } catch (error) {
          var details = errorDetails(error);
          var reason = 'Tizen reported the ESPlusPlayer service as inactive, but process verification failed: ' +
            details.message;
          if (global.console && typeof global.console.error === 'function') {
            global.console.error('[esplusplayer] Native service status verification failed', {
              serviceAppId: SERVICE_APP_ID,
              error: details
            });
          }
          if (startSessionPending) {
            serviceExitObservedDuringStart = true;
            var verificationError = makeError(reason);
            Object.keys(pending).forEach(function(id) {
              var pendingRequest = pending[id];
              if (!pendingRequest || pendingRequest.command !== 'start_session') return;
              delete pending[id];
              if (pendingRequest.timeoutId !== null && pendingRequest.timeoutId !== undefined) {
                global.clearTimeout(pendingRequest.timeoutId);
              }
              pendingRequest.reject(verificationError);
            });
          } else if (startSessionAccepted) {
            reportUnexpectedServiceExit(reason);
          }
        }
      },
      SERVICE_APP_ID
    );
    debugLog('Tizen native service status listener registered', {
      serviceAppId: SERVICE_APP_ID,
      listenerId: appStatusListenerId
    });
  }

  function reportUnexpectedServiceExit(reason) {
    if (unexpectedServiceExitReported || nativeTerminationEventSeen) return;
    unexpectedServiceExitReported = true;
    var message = reason || 'The ESPlusPlayer native service exited unexpectedly without reporting stream termination.';
    if (global.console && typeof global.console.error === 'function') {
      global.console.error('[esplusplayer] Native service process exited unexpectedly', {
        serviceAppId: SERVICE_APP_ID,
        message: message
      });
    }
    global.pendingStreamApiMessage = message;
    stopStartupDiagnosticPolling('native_service_exited_unexpectedly');
    close();
    if (typeof global.handleMessage === 'function') {
      global.handleMessage('streamTerminated: -1');
    }
  }

  function delay(milliseconds) {
    return new Promise(function(resolve) {
      global.setTimeout(resolve, milliseconds);
    });
  }

  function readMessage(items) {
    var result = {};
    if (!Array.isArray(items)) return result;
    items.forEach(function(item) {
      if (!item || typeof item.key !== 'string') return;
      var value = item.value;
      result[item.key] = Array.isArray(value) ? value[0] : value;
    });
    return result;
  }

  function handleMessage(items) {
    var message = readMessage(items);
    if (message.protocol !== PROTOCOL) {
      debugLog('ignored MessagePort message with unexpected protocol', {
        receivedProtocol: message.protocol || null
      });
      return;
    }

    if (message.type === 'event') {
      if (/^streamTerminated:/.test(String(message.event || ''))) {
        nativeTerminationEventSeen = true;
        if (unexpectedServiceExitReported) return;
      }
      if (message.event === 'wmpSupervisorTerminated') {
        supervisorTerminationObserved = true;
        supervisorTerminationDetail = message.detail || 'Tizen ApplicationManager reported WMP termination';
        debugLog('independent Tizen supervisor reported WMP process termination', {
          detail: supervisorTerminationDetail,
          startSessionPending: startSessionPending,
          startSessionAccepted: startSessionAccepted
        });
        if (nativeTerminationEventSeen || unexpectedServiceExitReported) return;
        if (startSessionPending) {
          serviceExitObservedDuringStart = true;
          var supervisorStartError = makeError('native service process terminated during startup: ' +
            supervisorTerminationDetail);
          Object.keys(pending).forEach(function(id) {
            var supervisorPending = pending[id];
            if (!supervisorPending || supervisorPending.command !== 'start_session') return;
            delete pending[id];
            if (supervisorPending.timeoutId !== null && supervisorPending.timeoutId !== undefined) {
              global.clearTimeout(supervisorPending.timeoutId);
            }
            supervisorPending.reject(supervisorStartError);
          });
        } else if (startSessionAccepted) {
          reportUnexpectedServiceExit('Independent Tizen supervisor confirmed native process termination: ' +
            supervisorTerminationDetail);
        }
        return;
      }
      if (message.event === 'wmpDiagnosticReady') {
        // This event marks the StartSessionV2 call boundary, not video readiness.
        // Incremental polling already retrieves the buffered startup trace; avoid
        // a full snapshot here, which would flood MessagePort during initialization.
        debugLog('native StartSessionV2 call returned; incremental diagnostics remain active', {});
      } else if (message.event === 'displayVideo') {
        // The native host emits displayVideo after confirming that video output is ready.
        startupDiagnosticTerminalEventSeen = true;
        stopStartupDiagnosticPolling('video_ready');
        startupDiagnosticFinalSnapshotRequested = false;
        requestFinalStartupDiagnosticSnapshot('video_ready');
      } else if (/^streamTerminated:/.test(String(message.event || ''))) {
        startupDiagnosticTerminalEventSeen = true;
        stopStartupDiagnosticPolling('stream_terminated');
        // Take a second snapshot after native teardown; StartSessionV2's
        // return snapshot may predate its final error/cleanup records.
        startupDiagnosticFinalSnapshotRequested = false;
        requestFinalStartupDiagnosticSnapshot('stream_terminated');
      }
      if (message.event === 'Connection Established') {
        nativeGamepadMask = 0;
      }
      if (message.event && /^wmpInputCapabilities: \d+$/.test(String(message.event))) {
        nativeInputCapabilities = Number(String(message.event).slice('wmpInputCapabilities: '.length)) | 0;
        debugLog('native evdev input capabilities received', {
          capabilities: nativeInputCapabilities,
          keyboard: !!(nativeInputCapabilities & 1),
          mouse: !!(nativeInputCapabilities & 2),
          gamepad: !!(nativeInputCapabilities & 4)
        });
        return;
      }
      if (message.event === 'wmpDiagnosticReady') {
        return;
      }
      if (message.event === 'wmpNativeDiag') {
        if (global.DEBUG_MODE === true && global.console &&
            typeof global.console.info === 'function') {
          global.console.info('[esplusplayer/diag]', message.detail || '');
        }
        return;
      }
      if (message.event === 'wmpNativeLog') {
        if (global.DEBUG_MODE === true && global.console &&
            typeof global.console.info === 'function') {
          global.console.info('[esplusplayer/native]', message.detail || '');
        }
        return;
      }
      if (message.event === 'wmpHostDiagnostic') {
        if (global.DEBUG_MODE === true && global.console &&
            typeof global.console.info === 'function') {
          global.console.info('[esplusplayer/host]', message.detail || '');
        }
        return;
      }
      if (message.event === 'wmpDiagnostic') {
        // This snapshot is also forwarded through the host diagnostic log.
        // Keep the event for lifecycle/UI consumers without printing it twice.
        return;
      }
      // Forward performance samples to the WebApp overlay, but keep their
      // high-frequency payloads out of the transport diagnostic log.
      var isPerformanceStatsSample = /^(StatMsg: |GraphMsg: |HostLatencyMsg: |ProgressMsg: )/.test(String(message.event || ''));
      if (!isPerformanceStatsSample) {
        debugLog('native event received', {
          event: message.event || null,
          detail: message.detail || null
        });
      }
      if (message.event && /^wmpPlayerError: /.test(String(message.event))) {
        var playerErrorCode = String(message.event).slice('wmpPlayerError: '.length);
        global.pendingStreamApiMessage = message.detail || ('ESPlus player error ' + playerErrorCode);
        debugLog('native player error reported', {
          code: playerErrorCode,
          detail: message.detail || null
        });
        // A fatal player error is followed by streamTerminated from the native
        // host. Do not show the transient connection-warning overlay here:
        // the shared stream-termination path owns the closing transition and
        // the final error dialog for both ESPlusPlayer and EMSS.
        return;
      }
      if (message.event && /^wmpAudioCodec: (PENDING|OPUS|AC-3|E-AC-3)$/.test(String(message.event))) {
        var activeCodec = String(message.event).slice('wmpAudioCodec: '.length);
        global._esplusActiveAudioCodec = activeCodec === 'PENDING' ? null : activeCodec;
        if (typeof global.refreshPerformanceStatsEngineStatus === 'function') {
          global.refreshPerformanceStatsEngineStatus();
        }
        return;
      }
      if (message.detail) global.pendingStreamApiMessage = String(message.detail);
      if (typeof global.handleMessage === 'function' && message.event) {
        global.handleMessage(String(message.event));
      }
      if (message.event === 'Connection Established') {
        syncNativeGamepads();
      }
      return;
    }
    if (message.type !== 'response') return;

    var id = String(message.id || '');
    var pendingRequest = pending[id];
    if (!pendingRequest) {
      debugLog('ignored response without a pending request', {
        id: id,
        status: message.status || null
      });
      return;
    }

    delete pending[id];
    if (pendingRequest.timeoutId !== null && pendingRequest.timeoutId !== undefined) {
      global.clearTimeout(pendingRequest.timeoutId);
    }

    var response = {
      id: id,
      status: String(message.status || 'error'),
      payload: {}
    };

    try {
      response.payload = JSON.parse(String(message.payload || '{}'));
    } catch (error) {
      debugLog('native response contained invalid JSON', {
        id: id,
        command: pendingRequest.command,
        error: errorDetails(error),
        rawPayloadLength: String(message.payload || '').length
      });
      pendingRequest.reject(makeError('native service returned invalid JSON'));
      return;
    }

    debugLog('native response received', {
      id: id,
      command: pendingRequest.command,
      status: response.status,
      elapsedMs: Date.now() - pendingRequest.startedAt,
      payload: response.payload
    });

    if (response.status === 'ok') {
      pendingRequest.resolve(response);
    } else {
      var errorMessage = response.payload.error || 'native command failed';
      if (response.payload.field) errorMessage += ': ' + String(response.payload.field);
      var error = makeError(errorMessage);
      if (response.payload.code !== undefined) error.code = Number(response.payload.code);
      error.nativePayload = response.payload;
      pendingRequest.reject(error);
    }
  }

  function connect(forceFreshStart) {
    if (connectPromise) {
      // Concurrent callers share an in-progress launch. Once a connection is
      // established, a new start_session explicitly requests a fresh process.
      if (!forceFreshStart || !connectionReady) {
        debugLog('reusing in-progress ESPlusPlayer service connection', {
          serviceAppId: SERVICE_APP_ID
        });
        return connectPromise;
      }
      close();
    } else {
      // Drop all references/listeners from the previous transport before
      // touching the service process. This also rejects stale pending calls.
      close();
    }

    var connectStartedAt = Date.now();
    debugLog('preparing a clean ESPlusPlayer native service start', {
      serviceAppId: SERVICE_APP_ID,
      controlPort: CONTROL_PORT,
      replyPort: REPLY_PORT,
      tizenAvailable: !!global.tizen,
      messagePortApiAvailable: !!(global.tizen && global.tizen.messageport),
      applicationLaunchApiAvailable: !!(global.tizen && global.tizen.application &&
        typeof global.tizen.application.launch === 'function')
    });

    connectPromise = stopExistingSupervisor().then(stopExistingService).then(function() {
      return new Promise(function(resolve, reject) {
        try {
          registerServiceStatusListener();
          if (!global.tizen ||
              !tizen.messageport ||
              !tizen.application ||
              typeof tizen.application.launch !== 'function') {
            throw makeError('required Tizen APIs are unavailable');
          }

          debugLog('requesting fresh trusted local reply MessagePort', {replyPort: REPLY_PORT});
          localPort = tizen.messageport.requestTrustedLocalMessagePort(REPLY_PORT);
          if (!localPort) throw makeError('trusted local reply MessagePort is unavailable');
          debugLog('trusted local reply MessagePort acquired', {
            replyPort: REPLY_PORT,
            portAvailable: true
          });
          listenerId = localPort.addMessagePortListener(handleMessage);
          debugLog('fresh local MessagePort listener registered', {listenerId: listenerId});

          launchSupervisorAndWait().then(function() {
            debugLog('launching fresh ESPlusPlayer ServiceApp', {
              serviceAppId: SERVICE_APP_ID,
              supervisorAppId: SUPERVISOR_APP_ID
            });
            tizen.application.launch(SERVICE_APP_ID, function() {
            debugLog('ESPlusPlayer ServiceApp launch callback succeeded', {
              serviceAppId: SERVICE_APP_ID,
              elapsedMs: Date.now() - connectStartedAt
            });
            var remotePortAttempt = 0;
            var maxRemotePortAttempts = 30;
            var remotePortRetryDelayMs = 100;

            function openRemoteControlPort(lastError) {
              remotePortAttempt++;
              try {
                debugLog('requesting trusted remote control MessagePort', {
                  serviceAppId: SERVICE_APP_ID,
                  controlPort: CONTROL_PORT,
                  attempt: remotePortAttempt,
                  maxAttempts: maxRemotePortAttempts
                });
                var candidatePort = tizen.messageport.requestTrustedRemoteMessagePort(
                  SERVICE_APP_ID, CONTROL_PORT
                );
                if (!candidatePort) {
                  var unavailableError = new Error('trusted remote control port is not available yet');
                  unavailableError.portNotReady = true;
                  throw unavailableError;
                }
                if (candidatePort.isTrusted !== true) {
                  throw makeError('native control port is not trusted');
                }

                remotePort = candidatePort;
                connectionReady = true;
                debugLog('fresh remote control MessagePort acquired', {
                  serviceAppId: SERVICE_APP_ID,
                  controlPort: CONTROL_PORT,
                  portAvailable: true,
                  trusted: true,
                  attempts: remotePortAttempt,
                  elapsedMs: Date.now() - connectStartedAt
                });
                resolve({
                  serviceAppId: SERVICE_APP_ID,
                  controlPort: CONTROL_PORT,
                  trusted: true
                });
              } catch (error) {
                var errorMessage = error && error.message ? error.message : String(error);
                var portNotReady = !!(error && error.portNotReady) ||
                  !!(error && error.name === 'NotFoundError') ||
                  /port.{0,80}not found|not found.{0,80}port/i.test(errorMessage);

                if (portNotReady && remotePortAttempt < maxRemotePortAttempts) {
                  debugLog('fresh trusted remote control MessagePort is not registered yet; retrying', {
                    serviceAppId: SERVICE_APP_ID,
                    controlPort: CONTROL_PORT,
                    attempt: remotePortAttempt,
                    maxAttempts: maxRemotePortAttempts,
                    retryInMs: remotePortRetryDelayMs,
                    elapsedMs: Date.now() - connectStartedAt,
                    error: errorDetails(error)
                  });
                  global.setTimeout(function() {
                    openRemoteControlPort(error);
                  }, remotePortRetryDelayMs);
                  return;
                }

                debugLog('could not open fresh trusted remote control MessagePort', {
                  serviceAppId: SERVICE_APP_ID,
                  controlPort: CONTROL_PORT,
                  attempts: remotePortAttempt,
                  elapsedMs: Date.now() - connectStartedAt,
                  previousError: lastError ? errorDetails(lastError) : null,
                  error: errorDetails(error)
                });
                close();
                reject(makeError('native control port is unavailable: ' + errorMessage));
              }
            }

            openRemoteControlPort(null);
          }, function(error) {
            debugLog('ESPlusPlayer ServiceApp launch failed', {
              serviceAppId: SERVICE_APP_ID,
              elapsedMs: Date.now() - connectStartedAt,
              error: errorDetails(error)
            });
            close();
            reject(makeError('could not launch native service: ' +
              (error && error.message ? error.message : String(error))));
            });
          }).catch(function(error) {
            close();
            reject(error);
          });
        } catch (error) {
          debugLog('ESPlusPlayer clean service startup failed synchronously', {
            serviceAppId: SERVICE_APP_ID,
            elapsedMs: Date.now() - connectStartedAt,
            error: errorDetails(error)
          });
          close();
          reject(error && error.message && error.message.indexOf('ESPlusPlayer transport:') === 0
            ? error
            : makeError(error.message || String(error)));
        }
      });
    }).catch(function(error) {
      close();
      // If launch succeeded but the reply port never appeared, do not leave
      // the half-started ServiceApplication behind for the next attempt.
      return stopExistingSupervisor().catch(function(cleanupError) {
        debugLog('native supervisor cleanup after startup failure was unsuccessful', {
          serviceAppId: SUPERVISOR_APP_ID,
          error: errorDetails(cleanupError)
        });
      }).then(function() {
        return stopExistingService().catch(function(cleanupError) {
          debugLog('native service cleanup after startup failure was unsuccessful', {
            serviceAppId: SERVICE_APP_ID,
            error: errorDetails(cleanupError)
          });
        });
      }).then(function() {
        connectPromise = null;
        throw error;
      });
    });

    return connectPromise;
  }

  function sendConnectedRequest(command, serializedPayload, payload, timeoutMs) {
    return new Promise(function(resolve, reject) {
      var id = String(++nextRequestId);
      var timeoutId = timeoutMs > 0 ? global.setTimeout(function() {
        if (!pending[id]) return;
        delete pending[id];
        reject(makeError(command + ' response timed out'));
      }, timeoutMs) : null;
      pending[id] = {
        resolve: resolve,
        reject: reject,
        command: command,
        startedAt: Date.now(),
        timeoutId: timeoutId
      };

      try {
        var items = [
          {key: 'protocol', value: PROTOCOL},
          {key: 'id', value: id},
          {key: 'command', value: command},
          {key: 'payload', value: serializedPayload}
        ];
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          Object.keys(payload).forEach(function(key) {
            if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) return;
            var value = payload[key];
            if (value === undefined || value === null) return;
            items.push({key: 'arg_' + key, value: String(value)});
          });
        }
        debugLog('sending native command over fresh MessagePort', {
          id: id,
          command: command,
          itemCount: items.length
        });
        remotePort.sendMessage(items, localPort);
      } catch (error) {
        delete pending[id];
        if (timeoutId !== null) global.clearTimeout(timeoutId);
        debugLog('native command send failed', {
          id: id,
          command: command,
          error: errorDetails(error)
        });
        reject(makeError('could not send command: ' + error.message));
      }
    });
  }

  function waitForServiceReady(attempt) {
    return sendConnectedRequest('ping', '{}', {}, SERVICE_LIFECYCLE_CALLBACK_TIMEOUT_MS).then(function(response) {
      var state = response && response.payload ? response.payload.service : null;
      if (state === 'ready') return true;
      if (state !== 'initializing') {
        throw makeError('native service returned an invalid readiness state');
      }
      if (attempt >= 100) {
        throw makeError('native service did not finish initialization');
      }
      return delay(100).then(function() {
        return waitForServiceReady(attempt + 1);
      });
    });
  }

  function stopStartupDiagnosticPolling(reason) {
    if (!startupDiagnosticPollingActive && startupDiagnosticPollTimer === null)
      return;
    if (startupDiagnosticPollTimer !== null) {
      global.clearTimeout(startupDiagnosticPollTimer);
      startupDiagnosticPollTimer = null;
    }
    startupDiagnosticPollingActive = false;
    var elapsedMs = startupDiagnosticPollStartedAt
      ? Date.now() - startupDiagnosticPollStartedAt : 0;
    debugLog('passive startup log polling stopped', {
      reason: reason || 'unspecified',
      polls: startupDiagnosticPollCount,
      elapsedMs: elapsedMs
    });
  }

  function requestFinalStartupDiagnosticSnapshot(reason) {
    if (global.DEBUG_MODE !== true || startupDiagnosticFinalSnapshotRequested)
      return;
    startupDiagnosticFinalSnapshotRequested = true;
    debugLog('draining final incremental native diagnostics', {reason: reason});

    // get_logs replays the complete retained ring buffer. Native log events
    // have already streamed most of those entries through wmpNativeLog, so a
    // full snapshot duplicates old lines and places them at the snapshot time.
    // Drain only entries not yet consumed by the incremental get_new_logs API.
    var pendingPoll = startupDiagnosticPollInFlight || Promise.resolve();
    pendingPoll.then(function() {
      return sendConnectedRequest('get_new_logs', '{}', {}, 5000);
    }).then(function(response) {
      var payload = response && response.payload ? response.payload : {};
      if (global.console && typeof global.console.info === 'function') {
        global.console.info('[esplusplayer] final incremental native diagnostic drain: ' +
          Number(payload.sent || 0) + ' native lines, sequence=' +
          Number(payload.sequence || 0) + ', buffered=' +
          Number(payload.buffered || 0) + ', dropped=' +
          Number(payload.dropped || 0) + ', independent markers=' +
          Number(payload.markerSent || 0) + ', marker sequence=' +
          Number(payload.markerSequence || 0) + ', marker buffered=' +
          Number(payload.markerBuffered || 0) + ', marker dropped=' +
          Number(payload.markerDropped || 0) + ', Gate busy=' +
          (payload.gateBusy === true));
      }
    }).catch(function(error) {
      debugLog('could not drain final incremental native diagnostics', errorDetails(error));
    });
  }

  function pollStartupDiagnosticLogs() {
    if (global.DEBUG_MODE !== true || !startupDiagnosticPollingActive)
      return;
    startupDiagnosticPollTimer = global.setTimeout(function() {
      startupDiagnosticPollTimer = null;
      if (!startupDiagnosticPollingActive) return;
      startupDiagnosticPollCount++;
      var pollRequest = sendConnectedRequest('get_new_logs', '{}', {}, 5000).then(function(response) {
        var payload = response && response.payload ? response.payload : {};
        if (startupDiagnosticPollCount === 1 || startupDiagnosticPollCount % 10 === 0) {
          debugLog('passive startup log poll completed', {
            poll: startupDiagnosticPollCount,
            sent: Number(payload.sent || 0),
            sequence: Number(payload.sequence || 0),
            buffered: Number(payload.buffered || 0),
            dropped: Number(payload.dropped || 0),
            gateBusy: payload.gateBusy === true,
            markerSent: Number(payload.markerSent || 0),
            markerSequence: Number(payload.markerSequence || 0),
            markerBuffered: Number(payload.markerBuffered || 0),
            markerDropped: Number(payload.markerDropped || 0),
            elapsedMs: Date.now() - startupDiagnosticPollStartedAt
          });
        }
        startupDiagnosticPollDelayMs = 1000;
      }).catch(function(error) {
        var details = errorDetails(error);
        startupDiagnosticPollDelayMs = 2000;
        debugLog('startup diagnostic log poll failed; will retry', {
          poll: startupDiagnosticPollCount,
          errorName: details.name,
          errorMessage: details.message,
          errorCode: details.code,
          errorDomain: details.domain
        });
      });
      var trackedPollRequest = pollRequest.then(function() {
        if (startupDiagnosticPollInFlight === trackedPollRequest) {
          startupDiagnosticPollInFlight = null;
        }
        pollStartupDiagnosticLogs();
      });
      startupDiagnosticPollInFlight = trackedPollRequest;
    }, startupDiagnosticPollDelayMs);
  }

  function startStartupDiagnosticPolling() {
    stopStartupDiagnosticPolling('restarted');
    if (global.DEBUG_MODE !== true || startupDiagnosticTerminalEventSeen) return;
    startupDiagnosticPollCount = 0;
    startupDiagnosticPollDelayMs = 1000;
    startupDiagnosticPollStartedAt = Date.now();
    startupDiagnosticPollingActive = true;
    debugLog('passive startup log polling started; continues until video is ready or the session terminates', {});
    pollStartupDiagnosticLogs();
  }

  function request(command, payload) {
    if (typeof command !== 'string' || !command) {
      return Promise.reject(makeError('command must be a non-empty string'));
    }

    var serializedPayload;
    try {
      serializedPayload = JSON.stringify(payload === undefined ? {} : payload);
    } catch (error) {
      debugLog('request payload serialization failed', {
        command: command,
        error: errorDetails(error)
      });
      return Promise.reject(makeError('payload is not JSON serializable'));
    }

    if (serializedPayload.length > 2048) {
      debugLog('request rejected because payload is too large', {
        command: command,
        payloadLength: serializedPayload.length,
        maximumLength: 2048
      });
      return Promise.reject(makeError('control payload exceeds 2048 characters'));
    }

    debugLog('native command queued', {
      command: command,
      payloadLength: serializedPayload.length,
      parameters: summarizePayload(command, payload)
    });

    return connect(command === 'start_session').then(function() {
      if (command === 'start_session') {
        startSessionPending = true;
        startSessionAccepted = false;
        serviceExitObservedDuringStart = supervisorTerminationObserved;
      }
      // The service publishes its control port before loading libmlengine.so
      // and probing ESPlus. Do not submit a stream request until initialization
      // has explicitly completed.
      if (command === 'start_session' && serviceExitObservedDuringStart) {
        throw makeError('native service process terminated during startup: ' +
          (supervisorTerminationDetail || 'supervisor notification received'));
      }
      return command === 'start_session' ? waitForServiceReady(0) : true;
    }).then(function() {
      if (command === 'start_session' && supervisorTerminationObserved) {
        throw makeError('native service process terminated during startup: ' +
          (supervisorTerminationDetail || 'supervisor notification received'));
      }
      return sendConnectedRequest(command, serializedPayload, payload);
    }).then(function(response) {
      if (command === 'start_session' && response.status === 'ok' &&
          response.payload && response.payload.accepted === true) {
        startSessionPending = false;
        startSessionAccepted = true;
        if (serviceExitObservedDuringStart) {
          reportUnexpectedServiceExit();
        } else {
          startStartupDiagnosticPolling();
        }
      }
      return response;
    }).catch(function(error) {
      if (command === 'start_session') {
        startSessionPending = false;
        if (serviceExitObservedDuringStart || supervisorTerminationObserved) {
          error = makeError('native service exited unexpectedly while starting the stream: ' +
            (supervisorTerminationDetail || 'Tizen process termination notification received'));
          serviceExitObservedDuringStart = false;
        }
        if (global.console && typeof global.console.error === 'function') {
          global.console.error('[esplusplayer] Native stream startup failed', {
            serviceAppId: SERVICE_APP_ID,
            error: errorDetails(error)
          });
        }
      }
      debugLog('native command failed before receiving a response', {
        command: command,
        error: errorDetails(error)
      });
      if (command !== 'start_session') throw error;

      // A failed readiness check or rejected start request must not leave the
      // just-launched service process behind as a partial startup.
      close();
      return stopExistingSupervisor().catch(function(cleanupError) {
        debugLog('native supervisor cleanup after rejected stream startup was unsuccessful', {
          serviceAppId: SUPERVISOR_APP_ID,
          error: errorDetails(cleanupError)
        });
      }).then(function() {
        return stopExistingService().catch(function(cleanupError) {
          debugLog('native service cleanup after rejected stream startup was unsuccessful', {
            serviceAppId: SERVICE_APP_ID,
            error: errorDetails(cleanupError)
          });
        });
      }).then(function() {
        throw error;
      });
    });
  }

  // Input is high-frequency and does not need a response. Keep it on the
  // trusted control port without creating one pending request per sample.
  function sendInputNow(command, payload) {
    if (!remotePort || !localPort) return false;
    var items = [
      {key: 'protocol', value: PROTOCOL},
      {key: 'id', value: ''},
      {key: 'command', value: command},
      {key: 'payload', value: '{}'}
    ];
    Object.keys(payload).forEach(function(key) {
      if (/^[A-Za-z][A-Za-z0-9]*$/.test(key) &&
          payload[key] !== undefined && payload[key] !== null) {
        items.push({key: 'arg_' + key, value: String(payload[key])});
      }
    });
    remotePort.sendMessage(items, localPort);
    return true;
  }

  function sendInput(command, payload) {
    if (!command || !payload || typeof payload !== 'object') return Promise.resolve(false);

    // MessagePort is synchronous once both trusted ports are open. Do not add
    // a Promise continuation to every keyboard, mouse or gamepad sample.
    if (remotePort && localPort) {
      try {
        return sendInputNow(command, payload);
      } catch (error) {
        debugLog('native input forwarding failed', {
          command: command,
          error: errorDetails(error)
        });
        return false;
      }
    }

    return connect().then(function() {
      return sendInputNow(command, payload);
    }).catch(function(error) {
      debugLog('native input forwarding failed', {
        command: command,
        error: errorDetails(error)
      });
      return false;
    });
  }

  function sendKey(keyCode, keyAction, modifiers) {
    return sendInput('input_key', {
      keyCode: keyCode,
      keyAction: keyAction,
      modifiers: modifiers || 0
    });
  }

  function sendMouseMove(deltaX, deltaY) {
    if (!deltaX && !deltaY) return Promise.resolve(false);
    return sendInput('mouse_move', {deltaX: deltaX, deltaY: deltaY});
  }

  function sendMouseButton(button, pressed) {
    return sendInput('mouse_button', {button: button, pressed: pressed ? 1 : 0});
  }

  function sendMouseScroll(amount) {
    if (!amount) return Promise.resolve(false);
    return sendInput('mouse_scroll', {amount: amount});
  }

  function sendGamepadArrival(index, activeMask, type, supportedButtons, capabilities) {
    return sendInput('gamepad_arrival', {
      index: index, activeMask: activeMask, type: type,
      supportedButtons: supportedButtons, capabilities: capabilities || 0
    });
  }

  function sendGamepadState(index, activeMask, buttons, leftTrigger, rightTrigger,
                            lsX, lsY, rsX, rsY) {
    return sendInput('gamepad_state', {
      index: index, activeMask: activeMask, buttons: buttons,
      leftTrigger: leftTrigger, rightTrigger: rightTrigger,
      lsX: lsX, lsY: lsY, rsX: rsX, rsY: rsY
    });
  }

  function close() {
    stopStartupDiagnosticPolling('transport_closed');
    if (appStatusListenerId !== null && global.tizen && tizen.application &&
        typeof tizen.application.removeAppStatusChangeListener === 'function') {
      try {
        tizen.application.removeAppStatusChangeListener(appStatusListenerId);
      } catch (error) {
        debugLog('failed to remove Tizen native service status listener', {
          listenerId: appStatusListenerId,
          error: errorDetails(error)
        });
      }
    }
    appStatusListenerId = null;
    serviceStatusWasActive = false;
    startSessionPending = false;
    startSessionAccepted = false;
    serviceExitObservedDuringStart = false;
    Object.keys(gamepadSendTimers).forEach(function(index) {
      global.clearTimeout(gamepadSendTimers[index]);
      delete gamepadSendTimers[index];
    });
    pendingGamepadStates = Object.create(null);
    lastSentGamepadAxes = Object.create(null);
    lastSentGamepadTriggers = Object.create(null);
    lastSentGamepadFlags = Object.create(null);
    nativeGamepadMask = 0;
    nativeInputCapabilities = 0;
    var pendingCount = Object.keys(pending).length;
    debugLog('closing ESPlusPlayer transport', {
      localPortAvailable: !!localPort,
      remotePortAvailable: !!remotePort,
      listenerRegistered: listenerId !== null,
      pendingRequests: pendingCount
    });
    if (localPort && listenerId !== null) {
      try {
        localPort.removeMessagePortListener(listenerId);
      } catch (error) {
        debugLog('failed to remove local MessagePort listener', {
          listenerId: listenerId,
          error: errorDetails(error)
        });
      }
    }
    localPort = null;
    remotePort = null;
    supervisorRemotePort = null;
    listenerId = null;
    connectionReady = false;
    connectPromise = null;

    Object.keys(pending).forEach(function(id) {
      if (pending[id].timeoutId !== null && pending[id].timeoutId !== undefined) {
        global.clearTimeout(pending[id].timeoutId);
      }
      pending[id].reject(makeError('reply channel closed'));
      delete pending[id];
    });
  }

  var nativeGamepadMask = 0;
  var nativeInputCapabilities = 0;
  // The browser gamepad API is polled every 5 ms. Forwarding every tiny axis
  // fluctuation through Tizen MessagePort can build a queue in the ServiceApp.
  // Keep button transitions immediate, but coalesce analog state to 60 Hz.
  var GAMEPAD_SEND_INTERVAL_MS = 16;
  var pendingGamepadStates = Object.create(null);
  var gamepadSendTimers = Object.create(null);
  var lastSentGamepadAxes = Object.create(null);
  var lastSentGamepadTriggers = Object.create(null);
  var lastSentGamepadFlags = Object.create(null);
  var streamMenuInputBlocked = false;
  var gamepadNeutralRequired = Object.create(null);
  var mouseEmulationEnabled = false;
  var selectHoldStreamMenuEnabled = false;
  var mouseEmulationActive = false;
  var mouseEmulationOwner = null;
  var mouseEmulationTimer = null;
  var mouseEmulationLastState = null;
  var selectHoldTimers = Object.create(null);
  var selectHoldTriggered = Object.create(null);
  var startHoldTimers = Object.create(null);
  var startHoldTriggered = Object.create(null);
  var startHoldSuppress = Object.create(null);
  var mouseButtonsState = {left: false, middle: false, right: false};


  function isNeutralGamepadState(flags, buttons, axes) {
    if (flags !== 0) return false;
    for (var i = 0; i < buttons.length; i++) {
      if (Number(buttons[i]) > 0.05) return false;
    }
    for (var j = 0; j < axes.length; j++) {
      if (Math.abs(Number(axes[j] || 0)) > 0.15) return false;
    }
    return true;
  }

  function setStreamMenuInputBlocked(blocked) {
    var nextState = blocked === true;
    if (streamMenuInputBlocked === nextState) return;
    streamMenuInputBlocked = nextState;

    if (nextState) {
      for (var shortcutIndex = 0; shortcutIndex < 16; shortcutIndex++) clearGamepadShortcutTimers(shortcutIndex);
      if (mouseEmulationActive) setMouseEmulationActive(false);
      // Release every browser-forwarded input before the menu takes ownership.
      releasePressedKeys();
      lastMouseX = null;
      lastMouseY = null;
      wheelRemainder = 0;

      for (var index = 0; index < 16; index++) {
        if (!(nativeGamepadMask & (1 << index))) continue;
        gamepadNeutralRequired[index] = true;
        if (gamepadSendTimers[index] !== undefined) {
          global.clearTimeout(gamepadSendTimers[index]);
          delete gamepadSendTimers[index];
        }
        delete pendingGamepadStates[index];
        if (browserGamepadInputActive()) {
          sendGamepadState(index, nativeGamepadMask, 0, 0, 0, 0, 0, 0, 0);
        }
        lastSentGamepadFlags[index] = 0;
        lastSentGamepadAxes[index] = [0, 0, 0, 0];
        lastSentGamepadTriggers[index] = [0, 0];
      }
    } else {
      // Do not replay controls that were held while the menu was visible.
      // Each controller must first return to neutral before host input resumes.
      for (var gamepadIndex = 0; gamepadIndex < 16; gamepadIndex++) {
        if (nativeGamepadMask & (1 << gamepadIndex)) {
          gamepadNeutralRequired[gamepadIndex] = true;
        }
      }
    }
  }

  function transmitGamepadState(index, state) {
    sendGamepadState(index, nativeGamepadMask, state.flags,
      state.leftTrigger, state.rightTrigger,
      state.lsX, state.lsY, state.rsX, state.rsY);
    lastSentGamepadFlags[index] = state.flags;
    lastSentGamepadAxes[index] = [state.lsX, state.lsY, state.rsX, state.rsY];
    lastSentGamepadTriggers[index] = [state.leftTrigger, state.rightTrigger];
  }

  function queueGamepadState(index, state, immediate) {
    if (streamMenuInputBlocked || !browserGamepadInputActive()) return;
    var previousAxes = lastSentGamepadAxes[index];
    var previousTriggers = lastSentGamepadTriggers[index];
    var axesChanged = !previousAxes;
    var triggersChanged = !previousTriggers;
    if (previousAxes) {
      var axes = [state.lsX, state.lsY, state.rsX, state.rsY];
      for (var i = 0; i < axes.length; i++) {
        // Ignore sub-0.1% quantization noise from resting analog sticks.
        if (Math.abs(axes[i] - previousAxes[i]) >= 32) axesChanged = true;
      }
    }
    if (previousTriggers) {
      triggersChanged = Math.abs(state.leftTrigger - previousTriggers[0]) >= 2 ||
        Math.abs(state.rightTrigger - previousTriggers[1]) >= 2;
    }

    var buttonsChanged = lastSentGamepadFlags[index] !== state.flags;
    if (immediate || buttonsChanged) {
      if (gamepadSendTimers[index] !== undefined) {
        global.clearTimeout(gamepadSendTimers[index]);
        delete gamepadSendTimers[index];
      }
      delete pendingGamepadStates[index];
      transmitGamepadState(index, state);
      return;
    }

    if (!axesChanged && !triggersChanged) {
      // If the stick returns to its last transmitted position before the
      // coalescing timer fires, discard the stale intermediate sample.
      if (gamepadSendTimers[index] !== undefined) {
        global.clearTimeout(gamepadSendTimers[index]);
        delete gamepadSendTimers[index];
        delete pendingGamepadStates[index];
      }
      return;
    }
    pendingGamepadStates[index] = state;
    if (gamepadSendTimers[index] !== undefined) return;

    gamepadSendTimers[index] = global.setTimeout(function() {
      delete gamepadSendTimers[index];
      var latest = pendingGamepadStates[index];
      delete pendingGamepadStates[index];
      if (latest && !streamMenuInputBlocked && browserGamepadInputActive() && (nativeGamepadMask & (1 << index))) {
        transmitGamepadState(index, latest);
      }
    }, GAMEPAD_SEND_INTERVAL_MS);
  }

  function clearGamepadShortcutTimers(index) {
    if (selectHoldTimers[index] !== undefined) {
      global.clearTimeout(selectHoldTimers[index]);
      delete selectHoldTimers[index];
    }
    if (startHoldTimers[index] !== undefined) {
      global.clearTimeout(startHoldTimers[index]);
      delete startHoldTimers[index];
    }
    delete selectHoldTriggered[index];
    delete startHoldTriggered[index];
    delete startHoldSuppress[index];
  }

  function resetGamepadShortcutState() {
    for (var index = 0; index < 16; index++) clearGamepadShortcutTimers(index);
    if (mouseEmulationActive) setMouseEmulationActive(false);
  }

  function releaseMouseEmulationButtons() {
    if (mouseButtonsState.left) sendMouseButton(0, false);
    if (mouseButtonsState.middle) sendMouseButton(1, false);
    if (mouseButtonsState.right) sendMouseButton(2, false);
    mouseButtonsState = {left: false, middle: false, right: false};
  }

  function setMouseEmulationActive(active, owner) {
    if (active === mouseEmulationActive) return;
    if (active) {
      if (!mouseEmulationEnabled || streamMenuInputBlocked ||
          typeof global.isGamepadMouseEmulationReady !== 'function' ||
          !global.isGamepadMouseEmulationReady()) return false;
      mouseEmulationActive = true;
      mouseEmulationOwner = owner;
      if (browserGamepadInputActive() && owner !== null &&
          (nativeGamepadMask & (1 << owner))) {
        if (gamepadSendTimers[owner] !== undefined) {
          global.clearTimeout(gamepadSendTimers[owner]);
          delete gamepadSendTimers[owner];
        }
        delete pendingGamepadStates[owner];
        sendGamepadState(owner, nativeGamepadMask, 0, 0, 0, 0, 0, 0, 0);
        lastSentGamepadFlags[owner] = 0;
        lastSentGamepadAxes[owner] = [0, 0, 0, 0];
        lastSentGamepadTriggers[owner] = [0, 0];
      }
      scheduleMouseEmulationTick();
      if (global.handleMessage) global.handleMessage('mouseEmulationOn');
      return true;
    } else {
      mouseEmulationActive = false;
      mouseEmulationOwner = null;
      if (mouseEmulationTimer !== null) {
        global.clearTimeout(mouseEmulationTimer);
        mouseEmulationTimer = null;
      }
      mouseEmulationLastState = null;
      releaseMouseEmulationButtons();
      if (global.handleMessage) global.handleMessage('mouseEmulationOff');
      return true;
    }
  }

  function scheduleMouseEmulationTick() {
    if (!mouseEmulationActive || streamMenuInputBlocked || mouseEmulationTimer !== null) return;
    mouseEmulationTimer = global.setTimeout(function() {
      mouseEmulationTimer = null;
      if (!mouseEmulationActive || streamMenuInputBlocked) return;
      if (!nativeInputActive() ||
          typeof global.isGamepadMouseEmulationReady !== 'function' ||
          !global.isGamepadMouseEmulationReady()) {
        setMouseEmulationActive(false);
        return;
      }
      if (mouseEmulationLastState) updateMouseEmulation(mouseEmulationLastState);
      scheduleMouseEmulationTick();
    }, 16);
  }

  function updateMouseEmulation(state) {
    var leftX = state.lsX / 32767;
    var leftY = state.lsY / 32767;
    var leftMagnitude = Math.min(1, Math.sqrt(leftX * leftX + leftY * leftY));
    var mouseSpeed = 10 * leftMagnitude;
    var deltaX = Math.round(leftX * mouseSpeed);
    var deltaY = Math.round(-leftY * mouseSpeed);
    if (deltaX || deltaY) sendMouseMove(deltaX, deltaY);

    var rightX = state.rsX / 32767;
    var rightY = state.rsY / 32767;
    var scrollMagnitude = Math.min(1, Math.sqrt(rightX * rightX + rightY * rightY));
    var scroll = Math.round(-rightY * scrollMagnitude);
    if (scroll) sendMouseScroll(scroll);

    var nextButtons = {
      left: !!(state.flags & (0x1000 | 0x0100)),
      middle: !!(state.flags & (0x4000 | 0x8000)),
      right: !!(state.flags & (0x2000 | 0x0200))
    };
    if (nextButtons.left !== mouseButtonsState.left) sendMouseButton(0, nextButtons.left);
    if (nextButtons.middle !== mouseButtonsState.middle) sendMouseButton(1, nextButtons.middle);
    if (nextButtons.right !== mouseButtonsState.right) sendMouseButton(2, nextButtons.right);
    mouseButtonsState = nextButtons;
  }

  function handleGamepadShortcuts(index, buttons, state) {
    var selectPressed = Number(buttons[8] || 0) > 0.5;
    var startPressed = Number(buttons[9] || 0) > 0.5;

    if (selectHoldStreamMenuEnabled) {
      if (selectPressed && selectHoldTimers[index] === undefined &&
          !selectHoldTriggered[index]) {
        selectHoldTimers[index] = global.setTimeout(function() {
          delete selectHoldTimers[index];
          selectHoldTriggered[index] = true;
          if (!streamMenuInputBlocked && typeof global.openStreamMenuFromGamepad === 'function') {
            global.openStreamMenuFromGamepad();
          }
        }, 1000);
      } else if (!selectPressed && selectHoldTimers[index] !== undefined) {
        global.clearTimeout(selectHoldTimers[index]);
        delete selectHoldTimers[index];
        if (!selectHoldTriggered[index] && browserGamepadInputActive()) {
          var pulseState = Object.assign({}, state, {flags: state.flags | 0x0020});
          queueGamepadState(index, pulseState, true);
          global.setTimeout(function() {
            if (!streamMenuInputBlocked && browserGamepadInputActive()) {
              queueGamepadState(index, state, true);
            }
          }, 50);
        }
      } else if (!selectPressed && selectHoldTriggered[index]) {
        delete selectHoldTriggered[index];
      }
      if (selectPressed) state.flags &= ~0x0020;
    }

    if (mouseEmulationEnabled) {
      if (startPressed && startHoldTimers[index] === undefined &&
          !startHoldTriggered[index]) {
        startHoldTimers[index] = global.setTimeout(function() {
          delete startHoldTimers[index];
          startHoldTriggered[index] = true;
          startHoldSuppress[index] = setMouseEmulationActive(!mouseEmulationActive, index);
        }, 1000);
      } else if (!startPressed && startHoldTimers[index] !== undefined) {
        global.clearTimeout(startHoldTimers[index]);
        delete startHoldTimers[index];
      } else if (!startPressed && startHoldTriggered[index]) {
        delete startHoldTriggered[index];
        delete startHoldSuppress[index];
      }
      if (startPressed && startHoldSuppress[index]) state.flags &= ~0x0010;
    }
  }

  function nativeInputActive() {
    var state = global.getStreamingEngineState && global.getStreamingEngineState();
    return !!state && state.active === 'ESPLUSPLAYER' && state.confirmed === true;
  }

  function browserKeyboardInputActive() {
    return nativeInputActive() && !(nativeInputCapabilities & 1);
  }

  function browserMouseInputActive() {
    return nativeInputActive() && !(nativeInputCapabilities & 2);
  }

  function browserGamepadInputActive() {
    return nativeInputActive() && !(nativeInputCapabilities & 4);
  }

  function controllerType(id) {
    id = String(id || '').toLowerCase();
    if (id.indexOf('054c') !== -1 || /dualsense|dualshock|playstation|sony/.test(id)) return 2;
    if (id.indexOf('045e') !== -1 || id.indexOf('xbox') !== -1) return 1;
    if (id.indexOf('057e') !== -1 || /nintendo|joy-con/.test(id)) return 3;
    return 0;
  }

  function supportedButtons(count) {
    var flags = [0x1000, 0x2000, 0x4000, 0x8000, 0x0100, 0x0200,
      0, 0, 0x0020, 0x0010, 0x0040, 0x0080, 0x0001, 0x0002,
      0x0004, 0x0008, 0x0400, 0x200000];
    var result = 0;
    for (var i = 0; i < count && i < flags.length; i++) result |= flags[i];
    return result;
  }

  function onGamepadConnected(event) {
    if (!nativeInputActive()) return;
    var detail = event.detail || {};
    var index = Number(detail.gamepadIndex);
    if (!Number.isInteger(index) || index < 0 || index > 15) return;
    nativeGamepadMask |= (1 << index);
    lastSentGamepadFlags[index] = undefined;
    lastSentGamepadAxes[index] = undefined;
    lastSentGamepadTriggers[index] = undefined;
    if (browserGamepadInputActive() && !streamMenuInputBlocked) {
      sendGamepadArrival(index, nativeGamepadMask, controllerType(detail.id),
        supportedButtons(Number(detail.buttonCount) || 0),
        Number(detail.buttonCount) > 7 ? 1 : 0);
    }
  }

  function onGamepadDisconnected(event) {
    if (!nativeInputActive()) return;
    var detail = event.detail || {};
    var index = Number(detail.gamepadIndex);
    if (!Number.isInteger(index) || index < 0 || index > 15) return;
    nativeGamepadMask &= ~(1 << index);
    clearGamepadShortcutTimers(index);
    if (mouseEmulationActive) setMouseEmulationActive(false);
    if (gamepadSendTimers[index] !== undefined) {
      global.clearTimeout(gamepadSendTimers[index]);
      delete gamepadSendTimers[index];
    }
    delete pendingGamepadStates[index];
    delete lastSentGamepadFlags[index];
    delete lastSentGamepadAxes[index];
    delete lastSentGamepadTriggers[index];
    if (browserGamepadInputActive()) {
      sendGamepadState(index, nativeGamepadMask, 0, 0, 0, 0, 0, 0, 0);
    }
  }

  function onGamepadState(event) {
    if (!nativeInputActive()) return;
    var detail = event.detail || {};
    var index = Number(detail.gamepadIndex);
    if (!Number.isInteger(index) || index < 0 || index > 15 ||
        !(nativeGamepadMask & (1 << index))) return;
    var buttons = Array.isArray(detail.buttons) ? detail.buttons : [];
    var axes = Array.isArray(detail.axes) ? detail.axes : [];
    var map = [0x1000, 0x2000, 0x4000, 0x8000, 0x0100, 0x0200,
      0, 0, 0x0020, 0x0010, 0x0040, 0x0080, 0x0001, 0x0002,
      0x0004, 0x0008, 0x0400, 0x200000];
    var flags = 0;
    for (var i = 0; i < buttons.length && i < map.length; i++) {
      if (Number(buttons[i]) > 0.5) flags |= map[i];
    }
    var normalizedAxes = Array.isArray(axes) ? axes : [];
    if (streamMenuInputBlocked) {
      if (isNeutralGamepadState(flags, buttons, normalizedAxes)) {
        delete gamepadNeutralRequired[index];
      }
      return;
    }

    if (flags === (0x0020 | 0x0010 | 0x0100 | 0x0200)) {
      if (typeof global.requestManualStreamStop === 'function') {
        global.requestManualStreamStop();
      }
      return;
    }
    if (gamepadNeutralRequired[index]) {
      if (!isNeutralGamepadState(flags, buttons, normalizedAxes)) return;
      delete gamepadNeutralRequired[index];
    }

    function axis(axisIndex) {
      var value = Number(axes[axisIndex] || 0);
      return Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    }
    var gamepadState = {
      flags: flags,
      leftTrigger: Math.round(Math.max(0, Math.min(1, Number(buttons[6] || 0))) * 255),
      rightTrigger: Math.round(Math.max(0, Math.min(1, Number(buttons[7] || 0))) * 255),
      lsX: axis(0),
      lsY: -axis(1),
      rsX: axis(2),
      rsY: -axis(3)
    };
    mouseEmulationLastState = gamepadState;
    handleGamepadShortcuts(index, buttons, gamepadState);
    if (mouseEmulationActive) {
      updateMouseEmulation(gamepadState);
      return;
    }
    if (!streamMenuInputBlocked && browserGamepadInputActive()) {
      queueGamepadState(index, gamepadState, false);
    }
  }

  function syncNativeGamepads() {
    if (!nativeInputActive() || !global.navigator) return;
    var pads = [];
    var list = null;
    if (global.navigator.getGamepads) {
      try { list = global.navigator.getGamepads(); } catch (error) {}
    }
    if (!list && global.navigator.webkitGetGamepads) {
      try { list = global.navigator.webkitGetGamepads(); } catch (error) {}
    }
    try {
      pads = Array.prototype.slice.call(list || []);
    } catch (error) {
      debugLog('could not enumerate gamepads for native synchronization', errorDetails(error));
      return;
    }
    for (var i = 0; i < pads.length && i < 16; i++) {
      var pad = pads[i];
      if (!pad || !pad.connected) continue;
      onGamepadConnected({detail: {
        gamepadIndex: pad.index, id: pad.id, buttonCount: pad.buttons.length
      }});
      onGamepadState({detail: {
        gamepadIndex: pad.index, id: pad.id,
        buttons: pad.buttons.map(function(button) { return button.value; }),
        axes: Array.prototype.slice.call(pad.axes)
      }});
    }
  }

  var pressedKeys = Object.create(null);
  var wheelRemainder = 0;
  var lastMouseX = null;
  var lastMouseY = null;

  function inputUiBlocked() {
    return global.isDialogOpen === true ||
      global.isPairingInProgress === true ||
      global.isGamepadTestDialogOpen === true;
  }

  function keyboardInputUiBlocked() {
    // Ordinary keyboard input belongs to the local menu while it is visible.
    // Explicit Stream Menu shortcuts call sendKey() directly and remain allowed.
    var streamMenuOpen = !!(global.document &&
      global.document.getElementById('streamMenuDialogOverlay'));
    return streamMenuInputBlocked || streamMenuOpen ||
      global.isDialogOpen === true ||
      global.isPairingInProgress === true ||
      global.isGamepadTestDialogOpen === true;
  }

  function inputModifiers(event) {
    return (event.shiftKey ? 0x01 : 0) |
      (event.ctrlKey ? 0x02 : 0) |
      (event.altKey ? 0x04 : 0) |
      (event.metaKey ? 0x08 : 0);
  }

  function isEditableTarget(target) {
    if (!target) return false;
    var tag = String(target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
      target.isContentEditable === true;
  }

  function onPhysicalKeyboard(event) {
    if (!nativeInputActive()) return;
    var code = Number(event.keyCode || event.which || 0);
    if (!code || code > 0xFFFF) return;
    // Samsung remote keys are already translated by remote_controller.js.
    var isSamsungRemoteKey = global.tvKey && (
      code === global.tvKey.KEY_UP || code === global.tvKey.KEY_DOWN ||
      code === global.tvKey.KEY_LEFT || code === global.tvKey.KEY_RIGHT ||
      code === global.tvKey.KEY_ENTER || code === global.tvKey.KEY_REMOTE_ENTER ||
      code === global.tvKey.KEY_RETURN
    );
    // DOM keyboard events carry a physical KeyboardEvent.code; Samsung's
    // platform remote callback is handled separately by remote_controller.js.
    if (isSamsungRemoteKey && (!event.code || event.code === 'Unidentified')) return;

    // The visible Stream Menu owns physical keyboard input. Its explicit
    // host-shortcut buttons use sendKey() directly and bypass this event gate.
    if (keyboardInputUiBlocked()) return;

    // Reserve Ctrl+Alt+Shift+Q for Moonlight while WMP owns the stream.
    // It must never be forwarded as a host keyboard shortcut.
    if (event.type === 'keydown' && code === 81 &&
        event.ctrlKey && event.altKey && event.shiftKey) {
      if (event.cancelable) event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      [16, 17, 18, 160, 161, 162, 163, 164, 165].forEach(function(modifierCode) {
        var modifierKey = String(modifierCode);
        if (pressedKeys[modifierKey]) {
          delete pressedKeys[modifierKey];
          sendKey(modifierCode, 4, 0);
        }
      });
      if (typeof global.requestManualStreamStop === 'function') {
        global.requestManualStreamStop();
      }
      return;
    }

    if (keyboardInputUiBlocked() || isEditableTarget(event.target)) return;
    if (!browserKeyboardInputActive()) return;

    var key = String(code);
    if (event.type === 'keydown') {
      if (pressedKeys[key]) {
        if (event.cancelable) event.preventDefault();
        return;
      }
      pressedKeys[key] = true;
      sendKey(code, 3, inputModifiers(event));
    } else {
      if (!pressedKeys[key]) return;
      delete pressedKeys[key];
      sendKey(code, 4, inputModifiers(event));
    }
    if (event.cancelable) event.preventDefault();
  }

  function releasePressedKeys() {
    lastMouseX = null;
    lastMouseY = null;
    Object.keys(pressedKeys).forEach(function(key) {
      sendKey(Number(key), 4, 0);
      delete pressedKeys[key];
    });
  }

  function onMouseMove(event) {
    if (!nativeInputActive()) return;
    if (inputUiBlocked()) {
      lastMouseX = null;
      lastMouseY = null;
      return;
    }
    var locked = global.document &&
      (global.document.pointerLockElement || global.document.webkitPointerLockElement);
    var dx = 0;
    var dy = 0;
    if (locked) {
      dx = Number(event.movementX || event.webkitMovementX || 0);
      dy = Number(event.movementY || event.webkitMovementY || 0);
    } else {
      var x = Number(event.clientX);
      var y = Number(event.clientY);
      if (lastMouseX !== null && lastMouseY !== null) {
        dx = x - lastMouseX;
        dy = y - lastMouseY;
      }
      lastMouseX = x;
      lastMouseY = y;
    }
    if ((dx || dy) && browserMouseInputActive())
      sendMouseMove(Math.round(dx), Math.round(dy));
  }

  function acquireStreamPointerLock() {
    var doc = global.document;
    if (!doc || doc.pointerLockElement || doc.webkitPointerLockElement) return;
    var video = doc.getElementById('wasm_module');
    if (!video) return;
    var request = video.requestPointerLock || video.webkitRequestPointerLock;
    if (typeof request !== 'function') return;
    try {
      request.call(video);
    } catch (error) {
      // Pointer lock is best-effort on older Tizen Chromium builds. Mouse
      // forwarding remains available even if the browser rejects the lock.
    }
  }

  function onMouseButton(event) {
    if (!nativeInputActive() || inputUiBlocked()) return;
    if (event.button < 0 || event.button > 2) return;
    if (event.type === 'mousedown') {
      /*
       * ESPlusPlayer receives physical mouse input through the native evdev
       * service, so the browser fallback may be disabled. Pointer Lock is
       * still required to hide Tizen's local cursor; it does not replace the
       * native input path that forwards movement to the host.
       */
      acquireStreamPointerLock();
    }
    if (browserMouseInputActive())
      sendMouseButton(event.button, event.type === 'mousedown');
    // Do not cancel mousedown: the video surface still needs the user gesture
    // to acquire pointer lock for relative mouse movement.
  }

  function onMouseContextMenu(event) {
    if (!nativeInputActive() || inputUiBlocked()) return;
    if (event.cancelable) event.preventDefault();
  }

  function onMouseWheel(event) {
    if (!nativeInputActive() || inputUiBlocked()) return;
    var wheelDelta = Number(event.deltaY || 0);
    if (event.deltaMode === 1) wheelDelta *= 33;
    else if (event.deltaMode === 2) wheelDelta *= 100;
    wheelRemainder += -wheelDelta / 100;
    var amount = wheelRemainder < 0 ? Math.ceil(wheelRemainder) : Math.floor(wheelRemainder);
    if (amount !== 0) {
      wheelRemainder -= amount;
      if (browserMouseInputActive()) sendMouseScroll(amount);
      if (event.cancelable) event.preventDefault();
    }
  }

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('keydown', onPhysicalKeyboard, true);
    global.document.addEventListener('keyup', onPhysicalKeyboard, true);
    global.document.addEventListener('mousemove', onMouseMove, true);
    global.document.addEventListener('mousedown', onMouseButton, true);
    global.document.addEventListener('mouseup', onMouseButton, true);
    global.document.addEventListener('contextmenu', onMouseContextMenu, true);
    global.document.addEventListener('wheel', onMouseWheel, {capture: true, passive: false});
  }
  global.addEventListener('blur', releasePressedKeys);
  global.addEventListener('pagehide', releasePressedKeys);
  if (global.document) {
    global.document.addEventListener('pointerlockchange', function() {
      lastMouseX = null;
      lastMouseY = null;
    });
    global.document.addEventListener('webkitpointerlockchange', function() {
      lastMouseX = null;
      lastMouseY = null;
    });
    global.document.addEventListener('mouseleave', function() {
      lastMouseX = null;
      lastMouseY = null;
    });
  }

  global.addEventListener('esplusgamepadconnected', onGamepadConnected);
  global.addEventListener('esplusgamepaddisconnected', onGamepadDisconnected);
  global.addEventListener('esplusgamepadstate', onGamepadState);

  global.ESPlusPlayerTransport = {
    connect: connect,
    request: request,
    ping: function() { return request('ping'); },
    getStatus: function() { return request('get_status'); },
    getLogs: function() { return request('get_new_logs'); },
    toggleStats: function() { return request('toggle_stats'); },
    probeEsplus: function() { return request('probe_esplus'); },
    startStream: function(parameters) {
      var requestParameters = {};
      if (mouseEmulationActive) setMouseEmulationActive(false);
      if (mouseEmulationTimer !== null) {
        global.clearTimeout(mouseEmulationTimer);
        mouseEmulationTimer = null;
      }
      mouseEmulationLastState = null;
      nativeInputCapabilities = 0;
      nativeGamepadMask = 0;
      mouseEmulationEnabled = parameters && parameters.mouseEmulation === true;
      selectHoldStreamMenuEnabled = parameters && parameters.selectHoldStreamMenu === true;
      mouseEmulationActive = false;
      mouseEmulationOwner = null;
      mouseButtonsState = {left: false, middle: false, right: false};
      for (var shortcutIndex = 0; shortcutIndex < 16; shortcutIndex++) clearGamepadShortcutTimers(shortcutIndex);
      if (parameters && typeof parameters === 'object') {
        Object.keys(parameters).forEach(function(key) {
          requestParameters[key] = parameters[key];
        });
      }
      requestParameters.debugMode = global.DEBUG_MODE === true;
      startupDiagnosticTerminalEventSeen = false;
      startupDiagnosticFinalSnapshotRequested = false;
      return request('start_session', requestParameters);
    },
    stopStream: function() {
      resetGamepadShortcutState();
      return request('stop_session');
    },
    sendKey: sendKey,
    setStreamMenuInputBlocked: setStreamMenuInputBlocked,
    sendMouseMove: sendMouseMove,
    sendMouseButton: sendMouseButton,
    sendMouseScroll: sendMouseScroll,
    sendGamepadArrival: sendGamepadArrival,
    sendGamepadState: sendGamepadState,
    syncGamepads: syncNativeGamepads,
    close: function() {
      resetGamepadShortcutState();
      close();
    }
  };
})(window);
