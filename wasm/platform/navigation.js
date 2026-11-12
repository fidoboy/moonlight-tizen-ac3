const hoveredClassName = 'hovered';

// Dedicated Web Audio engine for short interface effects. The MP3 is fetched and decoded
// once while the application starts, then played from an AudioBuffer without per-click
// network, media-element or decoder initialization.
let navigationSoundEnabled = false;
let navigationSoundContext = null;
let navigationSoundBuffer = null;
let navigationSoundData = null;
let navigationSoundLoadPromise = null;
let navigationSoundInitializationPromise = null;
let navigationSoundSources = [];
// Invalidates late audio lifecycle completions when the preference changes again.
let navigationSoundLifecycleId = 0;

function loadNavigationSoundData() {
  if (navigationSoundData) return Promise.resolve(navigationSoundData);
  if (navigationSoundLoadPromise) return navigationSoundLoadPromise;

  var loadPromise = fetch('static/res/click.mp3').then(function(response) {
    if (!response.ok) throw new Error('HTTP ' + response.status + ' while loading click.mp3');
    return response.arrayBuffer();
  }).then(function(data) {
    navigationSoundData = data;
    return data;
  }).finally(function() {
    // A stale fetch must not clear a newer request started after audio shutdown.
    if (navigationSoundLoadPromise === loadPromise) {
      navigationSoundLoadPromise = null;
    }
  });

  navigationSoundLoadPromise = loadPromise;
  return loadPromise;
}

function decodeNavigationSound(context, data) {
  return new Promise(function(resolve, reject) {
    try {
      var result = context.decodeAudioData(data.slice(0), resolve, reject);
      if (result && typeof result.then === 'function') result.then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

function initializeNavigationAudioEngine() {
  if (!navigationSoundEnabled) return Promise.resolve(false);
  if (navigationSoundContext && navigationSoundBuffer) return Promise.resolve(true);
  if (navigationSoundInitializationPromise) return navigationSoundInitializationPromise;

  var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return Promise.reject(new Error('The Web Audio API is not available on this device.'));
  }

  try {
    navigationSoundContext = new AudioContextConstructor({ latencyHint: 'interactive' });
  } catch (error) {
    console.warn('%c[navigation.js, audio]', 'color: gray;', 'Could not request interactive audio latency; using default options:', error);
    navigationSoundContext = new AudioContextConstructor();
  }

  var context = navigationSoundContext;
  var initializationPromise = loadNavigationSoundData().then(function(data) {
    return decodeNavigationSound(context, data);
  }).then(function(buffer) {
    if (navigationSoundContext !== context || !navigationSoundEnabled) return false;
    navigationSoundBuffer = buffer;
    console.log('%c[navigation.js, audio]', 'color: gray;', 'Local audio engine ready; click.mp3 decoded (' +
      buffer.duration.toFixed(3) + ' s, ' + buffer.sampleRate + ' Hz).');
    return true;
  }).catch(function(error) {
    if (navigationSoundContext === context) {
      navigationSoundContext = null;
      navigationSoundBuffer = null;
      try { context.close(); } catch (closeError) {}
    }
    console.error('%c[navigation.js, audio]', 'color: red;', 'Could not initialize the local audio engine:', error);
    throw error;
  }).finally(function() {
    // An older initialization must not clear a newer attempt started after shutdown.
    if (navigationSoundInitializationPromise === initializationPromise) {
      navigationSoundInitializationPromise = null;
    }
  });

  navigationSoundInitializationPromise = initializationPromise;
  return initializationPromise;
}

function closeNavigationAudioEngine() {
  ++navigationSoundLifecycleId;
  navigationSoundEnabled = false;

  // Detach the current initialization immediately. Waiting for fetch/decode here
  // could leave the AudioContext alive forever if that work never settles.
  navigationSoundInitializationPromise = null;
  // Do not let a stalled fetch shared by the old initialization block a fresh
  // attempt when the UI audio engine is restored.
  navigationSoundLoadPromise = null;
  var context = navigationSoundContext;
  if (navigationSoundContext === context) {
    navigationSoundContext = null;
    navigationSoundBuffer = null;
  }

  // Detach the old sources before closing so a later re-enable can safely create
  // and track sources belonging to a new AudioContext.
  var sources = navigationSoundSources;
  navigationSoundSources = [];
  sources.forEach(function(source) {
    try { source.stop(0); } catch (error) {}
    try { source.disconnect(); } catch (error) {}
  });

  // The initialization promise is intentionally not awaited: its completion checks
  // the context identity and cannot publish a buffer for this now-detached context.
  if (!context || context.state === 'closed') return Promise.resolve(false);
  context.onstatechange = null;
  try {
    return Promise.resolve(context.close()).then(function() {
      console.log('%c[navigation.js, audio]', 'color: gray;', 'Local audio engine closed.');
      return true;
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

function setNavigationSoundEnabled(enabled) {
  if (enabled !== true) return closeNavigationAudioEngine();

  navigationSoundEnabled = true;
  var lifecycleId = ++navigationSoundLifecycleId;
  return initializeNavigationAudioEngine().then(function(ready) {
    if (lifecycleId !== navigationSoundLifecycleId || !navigationSoundEnabled) return false;
    // The context may be recreated outside a user gesture after streaming. Attempt to
    // resume it here; playNavigationSound() retries from the next genuine user gesture
    // if Tizen's autoplay policy keeps it suspended.
    if (navigationSoundContext && navigationSoundContext.state === 'suspended') {
      try {
        var resumeResult = navigationSoundContext.resume();
        if (resumeResult && typeof resumeResult.catch === 'function') {
          resumeResult.catch(function(error) {
            console.warn('%c[navigation.js, audio]', 'color: gray;', 'Audio engine is prepared but remains suspended until user interaction:', error);
          });
        }
      } catch (error) {
        console.warn('%c[navigation.js, audio]', 'color: gray;', 'Audio engine is prepared but could not be resumed yet:', error);
      }
    }
    return ready;
  }).catch(function(error) {
    console.error('%c[navigation.js, audio]', 'color: red;', 'Local audio engine could not be restored:', error);
    return false;
  });
}

function playNavigationSound() {
  if (!navigationSoundEnabled || isInGame === true) return;

  if (!navigationSoundContext || !navigationSoundBuffer) {
    initializeNavigationAudioEngine().then(function() {
      if (navigationSoundEnabled && isInGame !== true) playNavigationSound();
    }).catch(function() {});
    return;
  }

  var context = navigationSoundContext;
  if (context.state === 'closed') return;

  // A new focus movement must always produce feedback. Stop the previous short
  // effect before starting the next one instead of silently dropping this event.
  navigationSoundSources.forEach(function(activeSource) {
    activeSource.onended = null;
    try { activeSource.stop(0); } catch (error) {}
    try { activeSource.disconnect(); } catch (error) {}
  });
  navigationSoundSources = [];

  if (context.state === 'suspended') {
    try {
      var resumeResult = context.resume();
      if (resumeResult && typeof resumeResult.catch === 'function') {
        resumeResult.catch(function(error) {
          console.warn('%c[navigation.js, audio]', 'color: gray;', 'Could not resume the local audio engine from a navigation action:', error);
        });
      }
    } catch (error) {
      console.warn('%c[navigation.js, audio]', 'color: gray;', 'Could not resume the local audio engine:', error);
      return;
    }
  }

  try {
    var source = context.createBufferSource();
    source.buffer = navigationSoundBuffer;
    source.connect(context.destination);
    navigationSoundSources.push(source);
    source.onended = function() {
      var sourceIndex = navigationSoundSources.indexOf(source);
      if (sourceIndex !== -1) navigationSoundSources.splice(sourceIndex, 1);
      try { source.disconnect(); } catch (error) {}
    };
    source.start(0);
  } catch (error) {
    console.warn('%c[navigation.js, audio]', 'color: gray;', 'Navigation sound playback failed:', error);
  }
}

// The persisted preference is loaded by index.js before the audio engine is initialized.

// Check if the provided object is an HTML element
function isHtmlElement(el) {
  return (typeof HTMLElement !== 'undefined') && el instanceof HTMLElement;
}

// Check whether one of the text-only dialogs has content that can scroll.
function isDialogTextScrollable(textArea) {
  return !!textArea && textArea.scrollHeight > textArea.clientHeight + 2;
}

// Focus the text when it overflows; otherwise focus the only available Close button.
function focusDialogTextOrClose(textAreaId, closeButtonId) {
  const textArea = resolveElement(textAreaId);
  if (isDialogTextScrollable(textArea)) {
    unmark(closeButtonId);
    focusElement(textArea);
  } else {
    mark(closeButtonId);
    focusElement(closeButtonId);
  }
}

// Resolve various target types to an actual HTML element
function resolveElement(target) {
  // If no target is provided, return null
  if (!target) {
    console.error('%c[navigation.js, resolveElement]', 'color: gray;', 'No target element is provided!', target);
    return null;
  }
  // If the target is already an HTML element, return it directly
  if (isHtmlElement(target)) {
    return target;
  }
  // If the target is a string, treat it as an element ID
  if (typeof target === 'string') {
    return document.getElementById(target);
  }
  // If the target is an array-like object, return the first element
  if (target && target[0] && target[0].nodeType === 1) {
    return target[0];
  }
  // If the target is a DOM node, return it directly
  if (target && target.nodeType === 1) {
    return target;
  }
  // If the target is a wrapper object exposing an 'element' property, return that
  if (target && target.element && isHtmlElement(target.element)) {
    return target.element;
  }
  // If the target is a wrapper object exposing an 'el' property, return that
  if (target && target.el && isHtmlElement(target.el)) {
    return target.el;
  }
  // If the target is a string containing an element ID, retrieve the element by that ID
  if (target && typeof target.id === 'string') {
    return document.getElementById(target.id);
  }
  // If the target cannot be resolved to an element, return null
  console.warn('%c[navigation.js, resolveElement]', 'color: gray;', 'Target element cannot be resolved:', target);
  return null;
}

// Click the target element from the resolved element
function clickElement(target) {
  const element = resolveElement(target);
  // Check if the element exists before clicking
  if (!element) {
    console.error('%c[navigation.js, clickElement]', 'color: gray;', 'Cannot click the unresolved target:', target);
    return;
  }
  // Prevent clicking if the element is disabled based on common disabled states
  if (element.disabled || element.getAttribute('aria-disabled') === 'true' || element.classList.contains('is-disabled')) {
    console.warn('%c[navigation.js, clickElement]', 'color: gray;', 'Cannot click the disabled target element:', element);
    // Check if the disabled element is the Game Mode switch
    if (element.id === 'gameModeBtn' && parseFloat(platformVer) === 5.5) {
      // Show a warning message when attempting to enable game mode on Tizen 5.5 platform
      setTimeout(() => {
        warningDialog(t('Unsupported Feature'),
          t('Game Mode (Ultra Low Latency) is not supported on Tizen %1$s due to platform limitations and lack of support from the WASM player.', platformVer) + 
          t('Attempting to enable this option will have no effect, as the decoder will force a fallback to standard Low Latency mode to maintain streaming stability.<br><br>') + 
          t('Since the Game Mode cannot be enabled, you may experience slightly higher latency while streaming. To further reduce latency, it is highly recommended to open your TV\'s Picture Settings menu and disable post-processing features such as <b>Picture Clarity</b>, <b>Contrast Enhancer</b>, and other video enhancements.')
        );
      }, 250);
    }
    return;
  }
  // If inside an MDL menu, use the menu item itself for proper behavior
  const menuItem = element.closest ? element.closest('.mdl-menu__item') : null;
  // If a clickable menu item is found, use it instead of the container
  if (menuItem && typeof menuItem.click === 'function') {
    menuItem.click();
    return;
  }
  // Search for common toggle switch child elements within the target element
  const toggleSwitch = element.querySelector('input[type="checkbox"], .mdl-switch__input, [role="switch"], [aria-pressed]');
  // If a clickable child element is found, use it to trigger animations
  if (toggleSwitch && typeof toggleSwitch.click === 'function') {
    // Dispatching events for MDL ripple animations
    const eventOptions = { view: window, bubbles: true, cancelable: true };
    toggleSwitch.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    toggleSwitch.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    setTimeout(() => focusElement(toggleSwitch), 250);
  }
  // Click the resolved element itself if it supports click event
  if (typeof element.click === 'function') {
    element.click();
  }
}

// Mark an element based on various target types
// Mark one element, ensuring no previous selection remains highlighted anywhere.
function mark(target) {
  unmark();
  const element = resolveElement(target);
  if (element) {
    element.classList.add(hoveredClassName);
    element.dispatchEvent(new Event('mouseenter'));
  } else {
    console.error('%c[navigation.js, mark]', 'color: gray;', 'Cannot mark the unresolved target:', target);
  }
}

// Clear every highlighted element in the interface.
function unmark() {
  document.querySelectorAll('.' + hoveredClassName).forEach(function(element) {
    element.classList.remove(hoveredClassName);
    element.dispatchEvent(new Event('mouseleave'));
  });
}

function normalizeHostsViewIndex(view) {
  const cards = view.func();
  view.index = cards.length ? Math.max(0, Math.min(view.index, cards.length - 1)) : 0;
  return cards;
}

// Get the current ID of a target element
function elementId(target) {
  const element = resolveElement(target);
  // Check if the element exists and has an ID
  if (element && element.id) {
    return element.id;
  }
  // If the target is a string, return it directly
  return typeof target === 'string' ? target : '';
}

// Safely add focus to an element
// Reset the independently scrollable settings pane whenever navigation returns to the category list.
function resetSettingsRightPaneScroll() {
  const settingsPane = resolveElement('settings-right-pane');
  if (settingsPane) settingsPane.scrollTop = 0;
}

function focusElement(target) {
  const element = resolveElement(target);
  const listener = document.getElementById('listener');
  const previousActiveElement = document.activeElement;
  // Remove focus from the currently focused element first
  blurElement(previousActiveElement);
  // Check if the element exists before adding focus
  if (!element) {
    console.error('%c[navigation.js, focusElement]', 'color: gray;', 'Cannot focus the unresolved target:', target);
    return;
  }


  // Keep the entire focused setting row inside a safe viewport area. Use the
  // row as the anchor so switches, selects, sliders and buttons get identical
  // treatment, including SELECT controls that delegate actual focus to listener.
  const settingsPane = element.closest && element.closest('#settings-right-pane');
  if (settingsPane) {
    const settingRow = element.closest('.setting-option') || element;
    const activeOptions = Array.from(settingsPane.querySelectorAll('.settings-options'))
      .find(options => window.getComputedStyle(options).display !== 'none');
    const firstOption = activeOptions && activeOptions.querySelector('.setting-option');
    const isFirstOption = !!firstOption && settingRow === firstOption;

    if (isFirstOption) {
      settingsPane.scrollTop = 0;
    } else {
      const paneRect = settingsPane.getBoundingClientRect();
      const rowRect = settingRow.getBoundingClientRect();
      const visibleTop = paneRect.top + settingsPane.clientTop + 8;
      // Reserve at least 30% of the pane height below every focused control.
      // This leaves room for expanded option menus without control-specific rules.
      const bottomSafetyMargin = Math.max(240, Math.round(settingsPane.clientHeight * 0.30));
      const visibleBottom = paneRect.top + settingsPane.clientTop + settingsPane.clientHeight - bottomSafetyMargin;

      if (rowRect.top < visibleTop) {
        settingsPane.scrollTop = Math.max(0, settingsPane.scrollTop - (visibleTop - rowRect.top));
      } else if (rowRect.bottom > visibleBottom) {
        settingsPane.scrollTop += rowRect.bottom - visibleBottom;
      }
    }
  }

  // SELECT controls use the hidden listener for remote/gamepad navigation, but
  // their setting row must still be scrolled into the safe area above.
  if (element.tagName === 'SELECT') {
    if (listener && typeof listener.focus === 'function') listener.focus();
    return;
  }

  if (typeof element.focus === 'function') {
    if (settingsPane) {
      element.focus({ preventScroll: true });
    } else if (element.closest && element.closest('#host-grid')) {
      // Let the carousel control horizontal positioning without browser auto-scroll.
      element.focus({ preventScroll: true });
    } else {
      element.focus();
    }
  }
}

// Safely remove focus from an element
function blurElement(target) {
  const element = resolveElement(target);
  // Check if the element exists before removing focus
  if (!element) {
    console.error('%c[navigation.js, blurElement]', 'color: gray;', 'Cannot blur the unresolved target:', target);
    return;
  }
  // If the element supports blur, remove focus from it
  if (typeof element.blur === 'function') {
    element.blur();
  }
}

// Determine if a popup menu container is active
function isPopupMenuActive(id) {
  const element = resolveElement(id);
  const parent = element ? element.parentNode : null;
  const container = parent && parent.querySelector ? parent.querySelector('.mdl-menu__container') : null;
  // Check if the container exists and is visible
  return !!(container && container.classList.contains('is-visible'));
}

// Close any active visible menu containers
function closeActiveVisibleMenu() {
  const visibleMenuContainer = document.querySelectorAll('.mdl-menu__container.is-visible');
  // If no visible menus are found, return false
  if (!visibleMenuContainer || visibleMenuContainer.length === 0) {
    return false;
  }
  // Hide each visible menu using its MaterialMenu instance
  visibleMenuContainer.forEach((menu) => {
    const visibleMenu = menu.querySelector('.mdl-menu');
    // Ensure the menu and its MaterialMenu instance exist before hiding
    if (visibleMenu && visibleMenu.MaterialMenu && typeof visibleMenu.MaterialMenu.hide === 'function') {
      visibleMenu.MaterialMenu.hide();
    }
  });
  // Simulate an Escape key press to close menus that rely on it
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', keyCode: 27, which: 27, bubbles: true
  }));
  // Trigger a click on the body to ensure menus are closed
  if (document.body) {
    document.body.click();
  }
  Navigation.pop();
  return true;
}

// Close a specific popup menu container by its ID
function closePopupMenu(id) {
  // If the specified menu is active, click its opener to close it
  if (isPopupMenuActive(id)) {
    // Close the popup menu by clicking its opener element
    clickElement(id);
    return true;
  }
  return closeActiveVisibleMenu();
}

// Handle the state of the IP address text input field
function handleIpTextFieldState(enabled, inputId) {
  const listener = document.getElementById('listener');
  const textInput = document.getElementById(inputId || 'ipAddressTextInput');
  // Check if the element exists before modifying
  if (!textInput) {
    console.error('%c[navigation.js, handleIpTextFieldState]', 'color: gray;', 'Cannot find the IP address text input element:', inputId || 'ipAddressTextInput');
    return;
  }
  textInput.readOnly = !enabled;
  // Set or remove focus based on the enabled state
  if (enabled) {
    textInput.focus();
    // Trigger a click to open the virtual keyboard on Tizen devices
    if (typeof textInput.click === 'function') {
      textInput.click();
    }
  } else {
    textInput.blur();
    // In case of blur, set focus back to the hidden listener element
    if (typeof listener.focus === 'function') {
      listener.focus();
    }
  }
}

// Change the value of the IP address numeric field
function changeIpNumericFieldValue(adjust) {
  const currentItem = elementId(this.view.current());
  if (currentItem.startsWith('ipAddressField') || currentItem.startsWith('ambilightWledIpField')) {
    const digitElement = document.getElementById(currentItem);
    let currentValue = parseInt(digitElement.value, 10);
    currentValue = (currentValue + adjust + 256) % 256;
    digitElement.value = currentValue;
    digitElement.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function isDisabledNavigationTarget(target) {
  const element = resolveElement(target);
  if (!element || !element.getClientRects().length) return true;
  return !!(
    element.disabled ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.classList.contains('is-disabled') ||
    element.classList.contains('ui-disabled') ||
    element.classList.contains('mdl-button--disabled') ||
    element.classList.contains('mdl-menu__item--disabled')
  );
}

class ListView {
  constructor(func) {
    this.index = 0;
    this.func = func;
  }

  current() {
    const array = this.func();
    return array[this.index];
  }

  prev() {
    const array = this.func();
    if (this.index > 0) {
      unmark(array[this.index]);
      --this.index;
      mark(array[this.index]);
    }
    return array[this.index];
  }

  next() {
    const array = this.func();
    if (this.index < array.length - 1) {
      unmark(array[this.index]);
      ++this.index;
      mark(array[this.index]);
    }
    return array[this.index];
  }

  prevCategory() {
    const array = this.func();
    if (this.index > 0) {
      unmark(array[this.index]);
      --this.index;
      mark(array[this.index]);
      // Indicate that there are more categories
      return true;
    }
    // Indicate that there are no more categories
    return false;
  }

  nextCategory() {
    const array = this.func();
    if (this.index < array.length - 1) {
      unmark(array[this.index]);
      ++this.index;
      mark(array[this.index]);
      // Indicate that there are more categories
      return true;
    }
    // Indicate that there are no more categories
    return false;
  }

  prevOption() {
    const array = this.func();
    if (!array.length) return undefined;
    unmark(array[this.index]);
    for (let step = 1; step <= array.length; step++) {
      const candidateIndex = (this.index - step + array.length) % array.length;
      if (isDisabledNavigationTarget(array[candidateIndex])) continue;
      this.index = candidateIndex;
      mark(array[this.index]);
      return array[this.index];
    }
    return array[this.index];
  }

  nextOption() {
    const array = this.func();
    if (!array.length) return undefined;
    unmark(array[this.index]);
    for (let step = 1; step <= array.length; step++) {
      const candidateIndex = (this.index + step) % array.length;
      if (isDisabledNavigationTarget(array[candidateIndex])) continue;
      this.index = candidateIndex;
      mark(array[this.index]);
      return array[this.index];
    }
    return array[this.index];
  }

  prevCard(cardsPerRow) {
    const array = this.func();
    if (!array.length) return undefined;

    const currentRow = Math.floor(this.index / cardsPerRow);
    unmark(array[this.index]);
    this.index = (this.index - 1 + array.length) % array.length;
    const newRow = Math.floor(this.index / cardsPerRow);
    mark(array[this.index]);
    if (newRow !== currentRow) {
      this.scrollToCardRow(newRow, cardsPerRow);
    }
    return array[this.index];
  }

  nextCard(cardsPerRow) {
    const array = this.func();
    if (!array.length) return undefined;

    const currentRow = Math.floor(this.index / cardsPerRow);
    unmark(array[this.index]);
    this.index = (this.index + 1) % array.length;
    const newRow = Math.floor(this.index / cardsPerRow);
    mark(array[this.index]);
    if (newRow !== currentRow) {
      this.scrollToCardRow(newRow, cardsPerRow);
    }
    return array[this.index];
  }

  currentCardRow(cardsPerRow) {
    const array = this.func();
    // Check if there are any card in the current row
    if (!array || array.length === 0) {
      return;
    }
    // Determine the current row based on the index
    const currentRow = Math.floor(this.index / cardsPerRow);
    // Scroll to the row containing the current card
    this.scrollToCardRow(currentRow, cardsPerRow);
  }

  prevCardRow(cardsPerRow) {
    const array = this.func();
    const currentRow = Math.floor(this.index / cardsPerRow);
    // Check if a previous card row exists
    if (currentRow > 0) {
      unmark(array[this.index]);
      this.index = Math.max(0, this.index - cardsPerRow);
      mark(array[this.index]);
      this.scrollToCardRow(currentRow - 1, cardsPerRow);
      // Indicate that there are more card rows
      return true;
    }
    // Indicate that there are no more card rows
    return false;
  }

  nextCardRow(cardsPerRow) {
    const array = this.func();
    const rows = Math.ceil(array.length / cardsPerRow);
    const currentRow = Math.floor(this.index / cardsPerRow);
    // Check if a next card row exists
    if (currentRow < rows - 1) {
      unmark(array[this.index]);
      this.index = Math.min(array.length - 1, this.index + cardsPerRow);
      mark(array[this.index]);
      this.scrollToCardRow(currentRow + 1, cardsPerRow);
      // Indicate that there are more card rows
      return true;
    }
    // Indicate that there are no more card rows
    return false;
  }

  scrollToCardRow(row, cardsPerRow) {
    const array = this.func();
    const targetCard = array[row * cardsPerRow];
    if (targetCard) {
      requestAnimationFrame(() => {
        targetCard.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      });
    }
  }

  reset() {
    this.index = 0;
  }
};

// Select and highlight the option matching the value currently shown by a settings control.
function markSelectedMenuItem(view, triggerId) {
  const trigger = document.getElementById(triggerId);
  const selectedValue = trigger && trigger.getAttribute('data-value');
  const options = Array.from(view.func() || []);
  const selectedIndex = options.findIndex(option =>
    option && option.getAttribute && option.getAttribute('data-value') === selectedValue
  );

  if (selectedIndex >= 0) {
    view.index = selectedIndex;
  } else if (view.index >= options.length) {
    view.index = 0;
  }

  mark(view.current());
}

// Keep the Hosts view as a single horizontal carousel without changing Apps navigation.
function getHostsCarouselLayout(grid) {
  const cards = Array.from(grid.children).filter(card =>
    card.id === 'addHostContainer' || card.classList.contains('host-container')
  );
  if (!cards.length) return { cards, visibleCount: 0, step: 0, pageWidth: 0 };

  const firstCard = cards[0];
  const style = window.getComputedStyle(firstCard);
  const marginLeft = parseFloat(style.marginLeft) || 0;
  const marginRight = parseFloat(style.marginRight) || 0;
  const step = firstCard.offsetWidth + marginLeft + marginRight;

  // The outer viewport reserves fixed side gutters for the arrows. The
  // dedicated clip window is sized to one complete page of cards.
  const viewport = document.getElementById('hosts-carousel-viewport');
  const viewportStyle = window.getComputedStyle(viewport);
  const horizontalPadding =
    (parseFloat(viewportStyle.paddingLeft) || 0) +
    (parseFloat(viewportStyle.paddingRight) || 0);
  const usableWidth = Math.max(0, viewport.clientWidth - horizontalPadding);
  const visibleCount = Math.min(4, Math.max(1, Math.floor(usableWidth / step)));
  const pageWidth = Math.min(cards.length, visibleCount) * step;
  return { cards, visibleCount, step, pageWidth, usableWidth };
}

function updateHostsCarousel() {
  const grid = document.getElementById('host-grid');
  const clip = document.getElementById('hosts-carousel-clip');
  const viewport = document.getElementById('hosts-carousel-viewport');
  if (!grid || !clip || !viewport) return;

  const layout = getHostsCarouselLayout(grid);
  const { cards, visibleCount, step, pageWidth } = layout;
  if (!cards.length) {
    clip.style.width = '0px';
    grid.style.width = '0px';
    grid.style.transform = 'translate3d(4px, 0, 0)';
    viewport.classList.remove('host-grid-overflow-left', 'host-grid-overflow-right');
    return;
  }

  const hasOverflow = cards.length > visibleCount;
  const maxStart = Math.max(0, cards.length - visibleCount);
  const start = hasOverflow
    ? Math.min(maxStart, Math.max(0, parseInt(grid.dataset.carouselStart || '0', 10)))
    : 0;

  grid.dataset.carouselStart = String(start);

  // The clip window contains exactly one page plus 4px of zoom clearance
  // on each side. The full card row remains unclipped inside that window.
  clip.style.width = (pageWidth + 8) + 'px';
  grid.style.width = (cards.length * step) + 'px';
  grid.style.transform = 'translate3d(' + (4 - start * step) + 'px, 0, 0)';

  viewport.classList.toggle('host-grid-overflow-left', hasOverflow && start > 0);
  viewport.classList.toggle('host-grid-overflow-right', hasOverflow && start < maxStart);
}
function scrollHostCardIntoView(target) {
  const grid = document.getElementById('host-grid');
  const clip = document.getElementById('hosts-carousel-clip');
  const viewport = document.getElementById('hosts-carousel-viewport');
  const element = resolveElement(target);
  if (!grid || !clip || !viewport || !element || !element.closest || !element.closest('#host-grid')) return;

  const layout = getHostsCarouselLayout(grid);
  const index = layout.cards.indexOf(element);
  if (index < 0 || !layout.step) return;

  const maxStart = Math.max(0, layout.cards.length - layout.visibleCount);
  const start = layout.cards.length > layout.visibleCount
    ? Math.min(maxStart, Math.max(0, index - Math.floor(layout.visibleCount / 2)))
    : 0;

  grid.dataset.carouselStart = String(start);
  clip.style.width = (layout.pageWidth + 8) + 'px';
  grid.style.width = (layout.cards.length * layout.step) + 'px';
  grid.style.transform = 'translate3d(' + (4 - start * layout.step) + 'px, 0, 0)';

  viewport.classList.toggle('host-grid-overflow-left', start > 0);
  viewport.classList.toggle('host-grid-overflow-right', start < maxStart);
}
(function initializeHostsCarousel() {
  function bind() {
    const grid = document.getElementById('host-grid');
    if (!grid || grid.dataset.carouselBound === 'true') return;
    grid.dataset.carouselBound = 'true';
    window.addEventListener('resize', updateHostsCarousel);
    updateHostsCarousel();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();

function moveStreamMenuFocus(direction) {
  var view = Views.StreamMenuDialog.view;
  var items = view.func();
  var current = items[view.index];
  if (!current || !items.length) return;

  var currentRect = current.getBoundingClientRect();
  var currentX = currentRect.left + currentRect.width / 2;
  var currentY = currentRect.top + currentRect.height / 2;
  var bestIndex = -1;
  var bestScore = Infinity;

  items.forEach(function(item, index) {
    if (index === view.index || isDisabledNavigationTarget(item)) return;
    var rect = item.getBoundingClientRect();
    var deltaX = rect.left + rect.width / 2 - currentX;
    var deltaY = rect.top + rect.height / 2 - currentY;
    var primaryDistance;
    var secondaryDistance;

    if (direction === 'left' || direction === 'right') {
      if ((direction === 'left' && deltaX >= 0) || (direction === 'right' && deltaX <= 0)) return;
      primaryDistance = Math.abs(deltaX);
      secondaryDistance = Math.abs(deltaY);
    } else {
      if ((direction === 'up' && deltaY >= 0) || (direction === 'down' && deltaY <= 0)) return;
      primaryDistance = Math.abs(deltaY);
      secondaryDistance = Math.abs(deltaX);
    }

    var score = primaryDistance + secondaryDistance * 2;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex === -1) return;
  unmark(current);
  view.index = bestIndex;
  mark(items[bestIndex]);
  focusElement(items[bestIndex]);
}

const Views = {
  Hosts: {
    view: new ListView(() => Array.from(document.querySelectorAll('#host-grid > #addHostContainer, #host-grid > .host-container'))),
    up: function() {
      // The Hosts carousel has one row: Up leaves the row for the selected card's menu.
      const currentItem = resolveElement(this.view.current());
      if (currentItem && currentItem.id !== 'addHostContainer') {
        Navigation.change(Views.HostsMenuHighlight);
        focusElement(Views.HostsMenuHighlight.view.current());
      } else {
        Navigation.change(Views.HostsNav);
        focusElement(Views.HostsNav.view.current());
      }
    },
    down: function() {},
    left: function() {
      const cards = normalizeHostsViewIndex(this.view);
      if (!cards.length) return;

      this.view.index = (this.view.index - 1 + cards.length) % cards.length;
      const previousItem = cards[this.view.index];
      mark(previousItem);
      focusElement(previousItem);
      scrollHostCardIntoView(previousItem);
    },
    right: function() {
      const cards = normalizeHostsViewIndex(this.view);
      if (!cards.length) return;

      this.view.index = (this.view.index + 1) % cards.length;
      const nextItem = cards[this.view.index];
      mark(nextItem);
      focusElement(nextItem);
      scrollHostCardIntoView(nextItem);
    },
    accept: function() {
      const currentItem = resolveElement(this.view.current());
      // Check if the current item is the Add Host container
      if (currentItem && currentItem.id === 'addHostContainer') {
        // Click the Add Host container itself to open the Add Host dialog
        clickElement(currentItem);
      } else {
        // If the current item has children, click the first child element (the host card)
        const hostCard = currentItem.children ? currentItem.children[0] : null;
        clickElement(hostCard);
      }
    },
    back: function() {
      // Show the Exit Moonlight dialog and push the view
      exitAppDialog();
    },
    press: function() {
      const currentItem = resolveElement(this.view.current());
      // Check if the current item is not the Add Host container
      if (currentItem && currentItem.id !== 'addHostContainer') {
        // If the current item has children, set focus on the second child element (the menu button)
        const menuButton = currentItem.children ? currentItem.children[1] : null;
        focusElement(menuButton);
        // Click the Host Menu button, show the Host Menu dialog and push the view
        setTimeout(() => clickElement(menuButton), 250);
      }
    },
    switch: function() {
      const cards = normalizeHostsViewIndex(this.view);
      if (!cards.length) return;
      const currentItem = resolveElement(this.view.current());
      updateHostsCarousel();
      if (currentItem && currentItem.id === 'addHostContainer') {
        focusElement(currentItem);
        scrollHostCardIntoView(currentItem);
      } else if (currentItem) {
        const hostCard = currentItem.children ? currentItem.children[0] : null;
        focusElement(hostCard);
        scrollHostCardIntoView(currentItem);
      }
    },
    enter: function() {
      const cards = normalizeHostsViewIndex(this.view);
      mark(cards[this.view.index]);
      // Disable the IP address text input field when entering the Hosts view
      handleIpTextFieldState(false);
    },
    leave: function() {
      unmark();
    },
  },
  HostsNav: {
    view: new ListView(() => {
      const items = [];
      if (document.getElementById('updateAppBtn')) items.push('updateAppBtn');
      items.push('settingsBtn', 'refreshHostsBtn');
      const gamepadTestButton = document.getElementById('gamepadTestBtn');
      if (gamepadTestButton && !gamepadTestButton.hidden) items.push('gamepadTestBtn');
      items.push('supportBtn');
      return items;
    }),
    up: function() {},
    down: function() {
      // Navigate to the Hosts view
      Navigation.change(Views.Hosts);
      // Set focus on the first navigation item in Hosts view when transitioning from HostsNav view
      focusElement(Views.Hosts.view.current());
    },
    left: function() {
      this.view.prev();
      focusElement(this.view.current());
    },
    right: function() {
      this.view.next();
      focusElement(this.view.current());
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      // Navigate to the Hosts view
      Navigation.change(Views.Hosts);
      // Set focus on the first navigation item in Hosts view when transitioning from HostsNav view
      focusElement(Views.Hosts.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  HostsMenuHighlight: {
    view: new ListView(() => {
      // Return the menu button of the currently selected host
      const currentHost = resolveElement(Views.Hosts.view.current());
      if (currentHost && currentHost.id !== 'addHostContainer') {
        const menuButton = currentHost.children ? currentHost.children[1] : null;
        return menuButton ? [menuButton] : [];
      }
      return [];
    }),
    up: function() {
      // Navigate to the HostsNav view (Settings button)
      Navigation.change(Views.HostsNav);
      focusElement(Views.HostsNav.view.current());
    },
    down: function() {
      // Return to the Hosts view
      Navigation.change(Views.Hosts);
      focusElement(Views.Hosts.view.current());
    },
    left: function() {},
    right: function() {},
    accept: function() {
      // Open the host menu dialog (same behavior as CH+)
      const currentHost = resolveElement(Views.Hosts.view.current());
      if (currentHost && currentHost.id !== 'addHostContainer') {
        const menuButton = currentHost.children ? currentHost.children[1] : null;
        if (menuButton) {
          clickElement(menuButton);
        }
      }
    },
    back: function() {
      // Return to the Hosts view
      Navigation.change(Views.Hosts);
      focusElement(Views.Hosts.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  AddHostDialog: {
    view: new ListView(() => {
      if (document.getElementById('ipAddressFieldModeSwitch').checked) {
        return ['ipAddressField1', 'ipAddressField2', 'ipAddressField3', 'ipAddressField4', 'continueAddHost', 'cancelAddHost'];
      } else {
        return ['ipAddressTextInput', 'continueAddHost', 'cancelAddHost'];
      }
    }),
    up: function() {
      const currentItem = elementId(this.view.current());
      const ipAddressFieldModeSwitch = document.getElementById('ipAddressFieldModeSwitch');
      // If the IP address field mode is enabled and the current item is an IP address numeric field
      if (ipAddressFieldModeSwitch.checked && currentItem.startsWith('ipAddressField')) {
        // Increase the value of the current IP address numeric field
        changeIpNumericFieldValue.call(this, 1);
      } else {
        // Go to the first item in the list (ipAddressTextInput)
        this.view.index = 0;
        focusElement(this.view.current());
      }
    },
    down: function() {
      const currentItem = elementId(this.view.current());
      const ipAddressFieldModeSwitch = document.getElementById('ipAddressFieldModeSwitch');
      // If the IP address field mode switch is enabled and the current item is an IP address numeric field
      if (ipAddressFieldModeSwitch.checked && currentItem.startsWith('ipAddressField')) {
        // Decrease the value of the current IP address numeric field
        changeIpNumericFieldValue.call(this, -1);
      } else {
        // Go to the second item in the list (continueAddHost)
        this.view.index = 1;
        focusElement(this.view.current());
      }
    },
    left: function() {
      this.view.prev();
      focusElement(this.view.current());
    },
    right: function() {
      this.view.next();
      focusElement(this.view.current());
    },
    accept: function() {
      const currentItem = elementId(this.view.current());
      // Check if the current item is the IP address text input field
      if (currentItem === 'ipAddressTextInput') {
        // Enable the text input field and set focus to it to open the virtual keyboard
        handleIpTextFieldState(true);
        return;
      } else {
        // Disable the text input field and set focus back to the hidden listener element
        handleIpTextFieldState(false);
        clickElement(this.view.current());
      }
    },
    back: function() {
      const currentItem = document.activeElement;
      // Check if the current item is the IP address text input field and it is not read-only
      if (currentItem && currentItem.id === 'ipAddressTextInput' && !currentItem.readOnly) {
        // Disable the text input field and set focus back to the hidden listener element
        handleIpTextFieldState(false);
        return;
      } else {
        // Otherwise, click the Cancel button to close the dialog
        resolveElement('cancelAddHost').click();
      }
    },
    press: function() {},
    switch: function() {
      const currentItem = resolveElement(this.view.current());
      // Check if the current item is either the Continue or Cancel button
      if (currentItem && (currentItem.id === 'continueAddHost' || currentItem.id === 'cancelAddHost')) {
        // Set focus only on the Continue or Cancel button element
        focusElement(currentItem);
      } else {
        // Remove focus from any other focused item element
        blurElement(currentItem);
      }
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  PairingDialog: {
    view: new ListView(() => [
      'cancelPairing'
    ]),
    up: function() {
      blurElement('cancelPairing');
    },
    down: function() {
      focusElement('cancelPairing');
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('cancelPairing').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  AutoWolDialog: {
    view: new ListView(() => [
      'autoWolCheckboxSwitch',
      'cancelAutoWol'
    ]),
    up: function() {
      const currentItem = elementId(this.view.current());
      if (currentItem === 'cancelAutoWol') {
        this.view.prev();
        focusElement(this.view.current());
      }
    },
    down: function() {
      const currentItem = elementId(this.view.current());
      if (currentItem === 'autoWolCheckboxSwitch') {
        this.view.next();
        focusElement(this.view.current());
      }
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('cancelAutoWol').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  HostMenuDialog: {
    view: new ListView(() => {
      const actions = ['refreshApps', 'wakeHost', 'deleteHost', 'testNetwork', 'viewDetails', 'closeHostMenu'];
      return actions.map(action => action === 'closeHostMenu' ? action : action + '-' + Views.HostMenuDialog.hostname);
    }),
    up: function() {
      this.view.prevOption();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.nextOption();
      focusElement(this.view.current());
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('closeHostMenu').click();
    },
    press: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      // The host menu is removed immediately after Navigation.pop().
      // Blur its focused item before the DOM element is detached.
      blurElement(this.view.current());
    },
  },
  DeleteHostDialog: {
    view: new ListView(() => [
      'continueDeleteHost',
      'cancelDeleteHost'
    ]),
    up: function() {},
    down: function() {},
    left: function() {
      this.view.prev();
      focusElement('continueDeleteHost');
    },
    right: function() {
      this.view.next();
      focusElement('cancelDeleteHost');
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('cancelDeleteHost').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  NetworkTestDialog: {
    view: new ListView(() => [
      'closeHostNetworkTest'
    ]),
    up: function() {
      blurElement('closeHostNetworkTest');
    },
    down: function() {
      focusElement('closeHostNetworkTest');
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('closeHostNetworkTest').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      // The dialog is removed immediately after Navigation.pop(); blur before detachment.
      blurElement(this.view.current());
    },
  },
  HostDetailsDialog: {
    view: new ListView(() => [
      'closeHostDetails'
    ]),
    up: function() {
      blurElement('closeHostDetails');
    },
    down: function() {
      focusElement('closeHostDetails');
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('closeHostDetails').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  MoonlightSupportDialog: {
    view: new ListView(() => [
      'closeAppSupport'
    ]),
    up: function() {
      blurElement('closeAppSupport');
    },
    down: function() {
      focusElement('closeAppSupport');
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('closeAppSupport').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  Settings: {
    view: new ListView(() => document.querySelector('.settings-categories').children),
    up: function() {
      // If there are more categories behind, then go to the previous category
      if (this.view.prevCategory()) {
        focusElement(this.view.current());
      } else {
        // If there are no more categories, navigate to the SettingsNav view
        Navigation.change(Views.SettingsNav);
        // Set focus on the first navigation item in SettingsNav view when transitioning from Settings view
        focusElement(Views.SettingsNav.view.current());
      }
    },
    down: function() {
      // If there are more categories after, then go to the next category
      if (this.view.nextCategory()) {
        focusElement(this.view.current());
      }
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('goBackBtn').click();
      // Navigate to the HostsNav view
      Navigation.change(Views.HostsNav);
      focusElement('settingsBtn');
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SettingsNav: {
    view: new ListView(() => [
      'goBackBtn',
      'restoreDefaultsBtn'
    ]),
    up: function() {},
    down: function() {
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the first navigation item in Settings view when transitioning from SettingsNav view
      focusElement(Views.Settings.view.current());
    },
    left: function() {
      this.view.prev();
      focusElement(this.view.current());
    },
    right: function() {
      this.view.next();
      focusElement(this.view.current());
    },
    accept: function() {
      const currentItem = resolveElement(this.view.current());
      if (currentItem && currentItem.id === 'goBackBtn') {
        clickElement(currentItem);
        // Navigate to the HostsNav view
        Navigation.change(Views.HostsNav);
        // Set focus to the "Settings" button after navigating to the HostsNav view
        focusElement('settingsBtn');
      } else {
        clickElement(this.view.current());
      }
    },
    back: function() {
      resolveElement('goBackBtn').click();
      // Navigate to the HostsNav view
      Navigation.change(Views.HostsNav);
      // Set focus to the "Settings" button after navigating to the HostsNav view
      focusElement('settingsBtn');
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  BasicSettings: {
    view: new ListView(() => {
      const items = [
        'selectResolution',
        'selectFramerate',
        'selectBitrate',
        'framePacingBtn',
        'selectStreamingEngine',
        'ambilightBtn'
      ];
      if ($('#ambilightSwitch').prop('checked')) {
        if ($('#ipAddressFieldModeSwitch').prop('checked')) {
          items.push('ambilightWledIpField1', 'ambilightWledIpField2',
            'ambilightWledIpField3', 'ambilightWledIpField4');
        } else {
          items.push('ambilightWledIpTextInput');
        }
      }
      return items;
    }),
    up: function() {
      if (elementId(this.view.current()).startsWith('ambilightWledIpField')) {
        changeIpNumericFieldValue.call(this, 1);
      } else {
        this.view.prevOption();
        focusElement(this.view.current());
      }
    },
    down: function() {
      if (elementId(this.view.current()).startsWith('ambilightWledIpField')) {
        changeIpNumericFieldValue.call(this, -1);
      } else {
        this.view.nextOption();
        focusElement(this.view.current());
      }
    },
    left: function() {
      if (elementId(this.view.current()).startsWith('ambilightWledIpField')) {
        this.view.prev();
        focusElement(this.view.current());
      }
    },
    right: function() {
      if (elementId(this.view.current()).startsWith('ambilightWledIpField')) {
        this.view.next();
        focusElement(this.view.current());
      }
    },
    accept: function() {
      const currentItem = elementId(this.view.current());
      if (currentItem === 'ambilightWledIpTextInput') {
        handleIpTextFieldState(true, currentItem);
      } else {
        clickElement(this.view.current());
      }
    },
    back: function() {
      const currentItem = resolveElement(this.view.current());
      if (currentItem && currentItem.id === 'ambilightWledIpTextInput' && !currentItem.readOnly) {
        handleIpTextFieldState(false, currentItem.id);
        return;
      }
      // Remove focus from the current element before changing the view
      blurElement(this.view.current());
      // Reset the current settings view before navigating to the next settings view
      showSettingsOverview(lastSettingsCategory);
      resetSettingsRightPaneScroll();
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the category item in Settings view when transitioning from BasicSettings view
      focusElement(Views.Settings.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectStreamingEngineMenu: {
    isActive: () => isPopupMenuActive('streamingEngineMenu'),
    view: new ListView(() => document.querySelector('.streamingEngineMenu').children),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectStreamingEngine'), 250);
    },
    back: function() {
      closePopupMenu('selectStreamingEngine');
      closeActiveVisibleMenu();
      focusElement('selectStreamingEngine');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectStreamingEngine');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectResolutionMenu: {
    isActive: () => isPopupMenuActive('videoResolutionMenu'),
    view: new ListView(() => 
      document.getElementById('videoResolutionMenu')
      .parentNode.children[3].children[1].children),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectResolution'), 250);
    },
    back: function() {
      closePopupMenu('selectResolution');
      closeActiveVisibleMenu();
      focusElement('selectResolution');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectResolution');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectFramerateMenu: {
    isActive: () => isPopupMenuActive('videoFramerateMenu'),
    view: new ListView(() => 
      document.getElementById('videoFramerateMenu')
      .parentNode.children[3].children[1].children),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectFramerate'), 250);
    },
    back: function() {
      closePopupMenu('selectFramerate');
      closeActiveVisibleMenu();
      focusElement('selectFramerate');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectFramerate');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectBitrateMenu: {
    isActive: () => isPopupMenuActive('videoBitrateMenu'),
    view: new ListView(() => 
      document.getElementById('videoBitrateMenu')
      .parentNode.children[3].children[1].children),
    up: function() {},
    down: function() {},
    left: function() {
      bitrateSlider.stepDown();
      bitrateSlider.dispatchEvent(new Event('input'));
    },
    right: function() {
      bitrateSlider.stepUp();
      bitrateSlider.dispatchEvent(new Event('input'));
    },
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectBitrate'), 250);
    },
    back: function() {
      closePopupMenu('selectBitrate');
      closeActiveVisibleMenu();
      focusElement('selectBitrate');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  InterfaceSettings: {
    view: new ListView(() => [
      'selectLanguage',
      'themeSelector',
      'selectAmbientBackground',
      'selectConfigSummaryPosition',
      'navigationSoundBtn',
      'screensaverBtn',
      'streamTransitionBackgroundBtn',
      'ipAddressFieldModeBtn'
    ]),
    up: function() {
      this.view.prevOption();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.nextOption();
      focusElement(this.view.current());
    },
    left: function() {
      if (this.view.current() === 'themeSelector') moveColorThemeFocus(-1);
    },
    right: function() {
      if (this.view.current() === 'themeSelector') moveColorThemeFocus(1);
    },
    accept: function() {
      if (this.view.current() === 'themeSelector') {
        saveColorTheme(focusedColorTheme);
      } else {
        clickElement(this.view.current());
      }
    },
    back: function() {
      // Remove focus from the current element before changing the view
      blurElement(this.view.current());
      // Reset the current settings view before navigating to the next settings view
      showSettingsOverview(lastSettingsCategory);
      resetSettingsRightPaneScroll();
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the category item in Settings view when transitioning from InterfaceSettings view
      focusElement(Views.Settings.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  ConfigSummaryPositionMenu: {
    isActive: () => isPopupMenuActive('configSummaryPositionMenu'),
    view: new ListView(() => document.querySelectorAll('.configSummaryPositionMenu .mdl-menu__item')),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectConfigSummaryPosition'), 250);
    },
    back: function() {
      closePopupMenu('selectConfigSummaryPosition');
      closeActiveVisibleMenu();
      focusElement('selectConfigSummaryPosition');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectConfigSummaryPosition');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  AmbientBackgroundMenu: {
    isActive: () => isPopupMenuActive('ambientBackgroundMenu'),
    view: new ListView(() => document.querySelectorAll('.ambientBackgroundMenu .mdl-menu__item')),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectAmbientBackground'), 250);
    },
    back: function() {
      closePopupMenu('selectAmbientBackground');
      closeActiveVisibleMenu();
      focusElement('selectAmbientBackground');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectAmbientBackground');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectLanguageMenu: {
    isActive: () => isPopupMenuActive('languageMenu'),
    view: new ListView(() =>
      document.getElementById('languageMenu')
      .parentNode.children[3].children[1].children),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
	  clickElement(this.view.current());
	  closeActiveVisibleMenu();
	  setTimeout(() => focusElement('selectLanguage'), 250);
    },
    back: function() {
      closePopupMenu('selectLanguage');
      closeActiveVisibleMenu();
      focusElement('selectLanguage');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectLanguage');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  HostSettings: {
    view: new ListView(() => [
      'discoverNewHostsAtStartupBtn',
      'sortAppsListBtn',
      'sortAppsByUsageBtn',
      'optimizeGamesBtn',
      'quitAppAfterDisconnectBtn',
      'removeAllHostsBtn'
    ]),
    up: function() {
      this.view.prevOption();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.nextOption();
      focusElement(this.view.current());
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      // Remove focus from the current element before changing the view
      blurElement(this.view.current());
      // Reset the current settings view before navigating to the next settings view
      showSettingsOverview(lastSettingsCategory);
      resetSettingsRightPaneScroll();
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the category item in Settings view when transitioning from HostSettings view
      focusElement(Views.Settings.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  InputSettings: {
    view: new ListView(() => [
      'rumbleFeedbackBtn',
      'mouseEmulationBtn',
      'selectHoldStreamMenuBtn',
      'flipABfaceButtonsBtn',
      'flipXYfaceButtonsBtn'
    ]),
    up: function() {
      this.view.prevOption();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.nextOption();
      focusElement(this.view.current());
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      // Remove focus from the current element before changing the view
      blurElement(this.view.current());
      // Reset the current settings view before navigating to the next settings view
      showSettingsOverview(lastSettingsCategory);
      resetSettingsRightPaneScroll();
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the category item in Settings view when transitioning from InputSettings view
      focusElement(Views.Settings.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  AudioSettings: {
    view: new ListView(() => [
      'ac3AudioModeBtn',
      'selectAudioBackend',
      isAudioOutputDisabled() ? null : 'selectAudio',
      // Dolby controls are navigable only when their corresponding setting is available.
      ($('#ac3AudioModeSwitch').parent().hasClass('is-checked') &&
        $('#selectAudio').data('value') === '51Surround') ? 'selectDolbyChannelLayout' : null,
      ($('#ac3AudioModeSwitch').parent().hasClass('is-checked') &&
        $('#dolbyDecodingModeOption').is(':visible')) ? 'selectDolbyDecodingMode' : null,
      // At most one of these settings is shown at a time, as each one belongs to a single backend,
      // and neither is shown when the audio output is disabled
      isAudioOutputDisabled() ? null : isWebAudioBackendSelected() ? 'selectAudioJitter' : 'audioSyncBtn',
      'playHostAudioBtn',
      isAudioOutputDisabled() ? null : 'decryptHostAudioBtn'
    ].filter(Boolean)),
    up: function() {
      this.view.prevOption();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.nextOption();
      focusElement(this.view.current());
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      // Remove focus from the current element before changing the view
      blurElement(this.view.current());
      // Reset the current settings view before navigating to the next settings view
      showSettingsOverview(lastSettingsCategory);
      resetSettingsRightPaneScroll();
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the category item in Settings view when transitioning from AudioSettings view
      focusElement(Views.Settings.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectAudioBackendMenu: {
    isActive: () => isPopupMenuActive('audioBackendMenu'),
    view: new ListView(() =>
      document.getElementById('audioBackendMenu')
      .parentNode.children[3].children[1].children),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectAudioBackend'), 250);
    },
    back: function() {
      closePopupMenu('selectAudioBackend');
      closeActiveVisibleMenu();
      focusElement('selectAudioBackend');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectAudioBackend');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectAudioMenu: {
    isActive: () => isPopupMenuActive('audioConfigMenu'),
    view: new ListView(() => 
      document.getElementById('audioConfigMenu')
      .parentNode.children[3].children[1].children),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectAudio'), 250);
    },
    back: function() {
      closePopupMenu('selectAudio');
      closeActiveVisibleMenu();
      focusElement('selectAudio');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectAudio');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectDolbyChannelLayoutMenu: {
    isActive: () => isPopupMenuActive('dolbyChannelLayoutMenu'),
    view: new ListView(() => document.querySelectorAll('.dolbyChannelLayoutMenu .mdl-menu__item')),
    up: function() { this.view.prevOption(); }, down: function() { this.view.nextOption(); },
    left: function() {}, right: function() {},
    accept: function() { clickElement(this.view.current()); closeActiveVisibleMenu(); setTimeout(() => focusElement('selectDolbyChannelLayout'), 250); },
    back: function() { closePopupMenu('selectDolbyChannelLayout'); closeActiveVisibleMenu(); focusElement('selectDolbyChannelLayout'); },
    press: function() {}, switch: function() {},
    enter: function() { markSelectedMenuItem(this.view, 'selectDolbyChannelLayout'); }, leave: function() { unmark(this.view.current()); },
  },
  SelectDolbyDecodingModeMenu: {
    isActive: () => isPopupMenuActive('dolbyDecodingModeMenu'),
    view: new ListView(() => document.querySelectorAll('.dolbyDecodingModeMenu .mdl-menu__item')),
    up: function() { this.view.prevOption(); }, down: function() { this.view.nextOption(); },
    left: function() {}, right: function() {},
    accept: function() { clickElement(this.view.current()); closeActiveVisibleMenu(); setTimeout(() => focusElement('selectDolbyDecodingMode'), 250); },
    back: function() { closePopupMenu('selectDolbyDecodingMode'); closeActiveVisibleMenu(); focusElement('selectDolbyDecodingMode'); },
    press: function() {}, switch: function() {},
    enter: function() { markSelectedMenuItem(this.view, 'selectDolbyDecodingMode'); }, leave: function() { unmark(this.view.current()); },
  },
  SelectAudioJitterMenu: {
    isActive: () => isPopupMenuActive('audioJitterMenu'),
    view: new ListView(() =>
      document.getElementById('audioJitterMenu')
      .parentNode.children[3].children[1].children),
    up: function() {},
    down: function() {},
    left: function() {
      jitterSlider.stepDown();
      jitterSlider.dispatchEvent(new Event('input'));
    },
    right: function() {
      jitterSlider.stepUp();
      jitterSlider.dispatchEvent(new Event('input'));
    },
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectAudioJitter'), 250);
    },
    back: function() {
      closePopupMenu('selectAudioJitter');
      closeActiveVisibleMenu();
      focusElement('selectAudioJitter');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  VideoSettings: {
    view: new ListView(() => [
      'selectCodec',
      ...(document.getElementById('selectCodec') && document.getElementById('selectCodec').dataset.value === 'H264' ? ['selectH264Level'] : []),
      'hdrModeBtn',
      'fullRangeBtn',
      'gameModeBtn'
    ]),
    up: function() {
      this.view.prevOption();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.nextOption();
      focusElement(this.view.current());
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      // Remove focus from the current element before changing the view
      blurElement(this.view.current());
      // Reset the current settings view before navigating to the next settings view
      showSettingsOverview(lastSettingsCategory);
      resetSettingsRightPaneScroll();
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the category item in Settings view when transitioning from VideoSettings view
      focusElement(Views.Settings.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectCodecMenu: {
    isActive: () => isPopupMenuActive('videoCodecMenu'),
    view: new ListView(() => 
      document.getElementById('videoCodecMenu')
      .parentNode.children[3].children[1].children),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectCodec'), 250);
    },
    back: function() {
      closePopupMenu('selectCodec');
      closeActiveVisibleMenu();
      focusElement('selectCodec');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectCodec');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  SelectH264LevelMenu: {
    isActive: () => isPopupMenuActive('h264LevelMenu'),
    view: new ListView(() => document.querySelectorAll('.h264LevelMenu .mdl-menu__item')),
    up: function() { this.view.prevOption(); },
    down: function() { this.view.nextOption(); },
    left: function() {}, right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectH264Level'), 250);
    },
    back: function() {
      closePopupMenu('selectH264Level');
      closeActiveVisibleMenu();
      focusElement('selectH264Level');
    },
    press: function() {}, switch: function() {},
    enter: function() { markSelectedMenuItem(this.view, 'selectH264Level'); },
    leave: function() { unmark(this.view.current()); },
  },
  SelectPerformanceStatsPositionMenu: {
    isActive: () => isPopupMenuActive('performanceStatsPositionMenu'),
    view: new ListView(() =>
      document.getElementById('performanceStatsPositionMenu')
      .parentNode.children[3].children[1].children),
    up: function() {
      this.view.prevOption();
    },
    down: function() {
      this.view.nextOption();
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
      closeActiveVisibleMenu();
      setTimeout(() => focusElement('selectPerformanceStatsPosition'), 250);
    },
    back: function() {
      closePopupMenu('selectPerformanceStatsPosition');
      closeActiveVisibleMenu();
      focusElement('selectPerformanceStatsPosition');
    },
    press: function() {},
    switch: function() {},
    enter: function() {
      markSelectedMenuItem(this.view, 'selectPerformanceStatsPosition');
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  AdvancedSettings: {
    view: new ListView(() => [
      'unlockAllFpsBtn',
      'optimizeBitrateBtn',
      'disableWarningsBtn',
      'performanceStatsBtn',
      'selectPerformanceStatsPosition'
    ]),
    up: function() {
      this.view.prevOption();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.nextOption();
      focusElement(this.view.current());
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      // Remove focus from the current element before changing the view
      blurElement(this.view.current());
      // Reset the current settings view before navigating to the next settings view
      showSettingsOverview(lastSettingsCategory);
      resetSettingsRightPaneScroll();
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the category item in Settings view when transitioning from AdvancedSettings view
      focusElement(Views.Settings.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  AboutSettings: {
    view: new ListView(() => [
      'systemInfoBtn',
      'navigationGuideBtn',
      'automaticUpdateChecksBtn',
      'checkUpdatesBtn',
      'restartAppBtn'
    ]),
    up: function() {
      this.view.prevOption();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.nextOption();
      focusElement(this.view.current());
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      // Remove focus from the current element before changing the view
      blurElement(this.view.current());
      // Reset the current settings view before navigating to the next settings view
      showSettingsOverview(lastSettingsCategory);
      resetSettingsRightPaneScroll();
      // Navigate to the Settings view
      Navigation.change(Views.Settings);
      // Set focus on the category item in Settings view when transitioning from AboutSettings view
      focusElement(Views.Settings.view.current());
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  NavigationGuideDialog: {
    view: new ListView(() => [
      'closeNavGuide'
    ]),
    up: function() {
      const textArea = resolveElement('navGuideDialogContent');
      if (document.activeElement === textArea) {
        textArea.scrollTop = Math.max(0, textArea.scrollTop - Math.max(80, textArea.clientHeight * 0.65));
      } else if (isDialogTextScrollable(textArea)) {
        focusElement(textArea);
      }
    },
    down: function() {
      const textArea = resolveElement('navGuideDialogContent');
      if (document.activeElement === textArea) {
        const atBottom = textArea.scrollTop + textArea.clientHeight >= textArea.scrollHeight - 2;
        if (atBottom) {
          focusElement('closeNavGuide');
        } else {
          textArea.scrollTop = Math.min(
            textArea.scrollHeight - textArea.clientHeight,
            textArea.scrollTop + Math.max(80, textArea.clientHeight * 0.65)
          );
        }
      } else {
        focusElement('closeNavGuide');
      }
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('closeNavGuide').click();
    },
    press: function() {},
    switch: function() {
      focusDialogTextOrClose('navGuideDialogContent', 'closeNavGuide');
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusDialogTextOrClose('navGuideDialogContent', 'closeNavGuide'), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => {
        blurElement('navGuideDialogContent');
        blurElement('closeNavGuide');
      }, 100);
    },
  },
  UpdateMoonlightDialog: {
    view: new ListView(() => [
      'closeUpdateApp'
    ]),
    up: function() {
      const textArea = resolveElement('updateAppDialogContent');
      if (document.activeElement === textArea) {
        textArea.scrollTop = Math.max(0, textArea.scrollTop - Math.max(80, textArea.clientHeight * 0.65));
      } else if (isDialogTextScrollable(textArea)) {
        focusElement(textArea);
      }
    },
    down: function() {
      const textArea = resolveElement('updateAppDialogContent');
      if (document.activeElement === textArea) {
        const atBottom = textArea.scrollTop + textArea.clientHeight >= textArea.scrollHeight - 2;
        if (atBottom) {
          focusElement('closeUpdateApp');
        } else {
          textArea.scrollTop = Math.min(
            textArea.scrollHeight - textArea.clientHeight,
            textArea.scrollTop + Math.max(80, textArea.clientHeight * 0.65)
          );
        }
      } else {
        focusElement('closeUpdateApp');
      }
    },
    left: function() {},
    right: function() {},
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('closeUpdateApp').click();
    },
    press: function() {},
    switch: function() {
      focusDialogTextOrClose('updateAppDialogContent', 'closeUpdateApp');
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusDialogTextOrClose('updateAppDialogContent', 'closeUpdateApp'), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => {
        blurElement('updateAppDialogContent');
        blurElement('closeUpdateApp');
      }, 100);
    },
  },
  RestoreDefaultsDialog: {
    view: new ListView(() => [
      'continueRestoreDefaults',
      'cancelRestoreDefaults'
    ]),
    up: function() {},
    down: function() {},
    left: function() {
      this.view.prev();
      focusElement('continueRestoreDefaults');
    },
    right: function() {
      this.view.next();
      focusElement('cancelRestoreDefaults');
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('cancelRestoreDefaults').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  Apps: {
    view: new ListView(() => document.getElementById('game-grid').children),
    up: function() {
      // If there are more rows behind, then go to the previous row
      if (this.view.prevCardRow(6)) {
        focusElement(this.view.current());
      } else {
        // If there are no more rows, navigate to the AppsNav view
        Navigation.change(Views.AppsNav);
        // Set focus on the first navigation item in AppsNav view when transitioning from Apps view
        focusElement(Views.AppsNav.view.current());
      }
    },
    down: function() {
      // If there are more rows after, then go to the next row
      if (this.view.nextCardRow(6)) {
        focusElement(this.view.current());
      }
    },
    left: function() {
      this.view.prevCard(6);
      focusElement(this.view.current());
    },
    right: function() {
      this.view.nextCard(6);
      focusElement(this.view.current());
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('goBackBtn').click();
    },
    press: function() {},
    switch: function() {
      const cards = this.view.func();
      if (!cards.length) return;

      // The app list may have been rebuilt, so keep the saved index within its new bounds.
      this.view.index = Math.max(0, Math.min(this.view.index, cards.length - 1));
      this.view.currentCardRow(6);
      focusElement(this.view.current());
    },
    enter: function() {
      const cards = this.view.func();
      if (!cards || !cards.length) return;

      // The Apps view can be pushed before showApps() has populated the grid.
      // Keep the selected index valid before marking the current card.
      this.view.index = Math.max(0, Math.min(this.view.index, cards.length - 1));
      mark(cards[this.view.index]);
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  AppsNav: {
    view: new ListView(() => [
      'goBackBtn',
      'quitRunningAppBtn'
    ]),
    up: function() {},
    down: function() {
      // Navigate to the Apps view
      Navigation.change(Views.Apps);
      // Set focus on the first navigation item in Apps view when transitioning from AppsNav view
      focusElement(Views.Apps.view.current());
    },
    left: function() {
      this.view.prev();
      focusElement(this.view.current());
    },
    right: function() {
      this.view.next();
      focusElement(this.view.current());
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('goBackBtn').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
    },
    leave: function() {
      unmark(this.view.current());
    },
  },
  RunningAppDialog: {
    view: new ListView(() => [
      'resumeRunningApp',
      'stopRemoteApp'
    ]),
    up: function() {
      this.view.prev();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.next();
      focusElement(this.view.current());
    },
    left: function() {
      this.view.prev();
      focusElement(this.view.current());
    },
    right: function() {
      this.view.next();
      focusElement(this.view.current());
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      if (typeof window.cancelRunningAppDialog === 'function') {
        window.cancelRunningAppDialog();
      }
    },
    press: function() {},
    switch: function() {
      this.view.index = 0;
      focusElement(this.view.current());
    },
    enter: function() {
      this.view.index = 0;
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => {
        blurElement('resumeRunningApp');
        blurElement('stopRemoteApp');
      }, 100);
    },
  },
  RunningAppDialog: {
    view: new ListView(() => [
      'resumeRunningApp',
      'stopRemoteApp'
    ]),
    up: function() {
      this.view.prev();
      focusElement(this.view.current());
    },
    down: function() {
      this.view.next();
      focusElement(this.view.current());
    },
    left: function() {
      this.view.prev();
      focusElement(this.view.current());
    },
    right: function() {
      this.view.next();
      focusElement(this.view.current());
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      if (typeof window.cancelRunningAppDialog === 'function') {
        window.cancelRunningAppDialog();
      }
    },
    press: function() {},
    switch: function() {
      this.view.index = 0;
      focusElement(this.view.current());
    },
    enter: function() {
      this.view.index = 0;
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => {
        blurElement('resumeRunningApp');
        blurElement('stopRemoteApp');
      }, 100);
    },
  },
  QuitAppDialog: {
    view: new ListView(() => [
      'continueQuitApp',
      'cancelQuitApp'
    ]),
    up: function() {},
    down: function() {},
    left: function() {
      this.view.prev();
      focusElement('continueQuitApp');
    },
    right: function() {
      this.view.next();
      focusElement('cancelQuitApp');
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('cancelQuitApp').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  WarningDialog: {
    view: new ListView(() => {
      // Dynamically return the visible buttons
      var buttons = [];
      if ($('#continueWarning').is(':visible')) {
        buttons.push('continueWarning');
      }
      if ($('#closeWarning').is(':visible')) {
        buttons.push('closeWarning');
      }
      return buttons;
    }),
    up: function() {},
    down: function() {},
    left: function() {
      if ($('#continueWarning').is(':visible') && $('#closeWarning').is(':visible')) {
        this.view.prev();
        focusElement(this.view.current());
      }
    },
    right: function() {
      if ($('#continueWarning').is(':visible') && $('#closeWarning').is(':visible')) {
        this.view.next();
        focusElement(this.view.current());
      }
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('closeWarning').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      // Default to Continue button (index 0) when both buttons are visible
      // Otherwise default to the only visible Close button (index 0)
      this.view.index = 0;
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  RestartMoonlightDialog: {
    view: new ListView(() => [
      'continueRestartApp',
      'cancelRestartApp'
    ]),
    up: function() {},
    down: function() {},
    left: function() {
      this.view.prev();
      focusElement('continueRestartApp');
    },
    right: function() {
      this.view.next();
      focusElement('cancelRestartApp');
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('cancelRestartApp').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  ExitMoonlightDialog: {
    view: new ListView(() => [
      'continueExitApp',
      'cancelExitApp'
    ]),
    up: function() {},
    down: function() {},
    left: function() {
      this.view.prev();
      focusElement('continueExitApp');
    },
    right: function() {
      this.view.next();
      focusElement('cancelExitApp');
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('cancelExitApp').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      setTimeout(() => blurElement(this.view.current()), 100);
    },
  },
  StreamMenuDialog: {
    // Read options from the dialog so they match getStreamMenuOptions().
    view: new ListView(() => document.querySelectorAll('#streamMenuDialog button')),
    up: function() {
      moveStreamMenuFocus('up');
    },
    down: function() {
      moveStreamMenuFocus('down');
    },
    left: function() {
      moveStreamMenuFocus('left');
    },
    right: function() {
      moveStreamMenuFocus('right');
    },
    accept: function() {
      clickElement(this.view.current());
    },
    back: function() {
      resolveElement('closeStreamMenu').click();
    },
    press: function() {},
    switch: function() {
      focusElement(this.view.current());
    },
    enter: function() {
      mark(this.view.current());
      setTimeout(() => focusElement(this.view.current()), 100);
    },
    leave: function() {
      unmark(this.view.current());
      blurElement(this.view.current());
    },
  },
};

const Navigation = (function() {
  let hasFocus = false;

  function loseFocus() {
    if (hasFocus) {
      hasFocus = false;
      Stack.get().leave();
    }
  }

  function focus() {
    if (!hasFocus) {
      hasFocus = true;
      Stack.get().enter();
    }
  }

  function runOp(name) {
    return () => {
      if (!State.isRunning()) {
        return;
      }

      if (!hasFocus) {
        focus();
        // Back must never be consumed by focus restoration; users expect it to work immediately.
        if (!['up', 'down', 'left', 'right', 'back'].includes(name)) {
          return;
        }
      }

      const view = Stack.get();
      if (view[name]) {
        const isDirectional = ['up', 'down', 'left', 'right'].includes(name);
        const previousTarget = isDirectional ? document.querySelector('.hovered') : null;

        view[name]();

        if (isDirectional && previousTarget !== document.querySelector('.hovered') &&
            typeof playNavigationSound === 'function') {
          playNavigationSound();
        }
      }
    };
  }

  const Stack = (function() {
    const viewStack = [];

    function get() {
      return viewStack[viewStack.length - 1];
    }

    function push(view, hostname, restoreNavigationFocus) {
      if (get()) {
        get().leave();
      }
      if (hostname !== undefined) {
        view.hostname = hostname;
      }
      // Some modal dialogs must be immediately operable from the remote/gamepad,
      // even when the previous view had already lost navigation focus.
      if (restoreNavigationFocus) {
        // A previous streaming transition may have stopped Navigation entirely.
        // Restoring focus alone is insufficient because runOp() ignores input while
        // State is stopped. Re-enable input before entering this modal view.
        State.start();
        hasFocus = true;
      }
      viewStack.push(view);
      get().enter();
    }

    function change(view) {
      get().leave();
      viewStack[viewStack.length - 1] = view;
      get().enter();
    }

    function pop() {
      if (viewStack.length > 1) {
        get().leave();
        viewStack.pop();
        get().enter();
      }
    }

    return {
      get,
      push,
      change,
      pop
    };
  })();

  const State = (function() {
    let running = false;

    function start() {
      if (!running) {
        running = true;
        window.addEventListener('mousemove', loseFocus);
      }
    }

    function stop() {
      if (running) {
        running = false;
        window.removeEventListener('mousemove', loseFocus);
      }
    }

    function isRunning() {
      return running;
    }

    return {
      start,
      stop,
      isRunning
    };
  })();

  return {
    up: runOp('up'),
    down: runOp('down'),
    left: runOp('left'),
    right: runOp('right'),
    accept: runOp('accept'),
    back: runOp('back'),
    press: runOp('press'),
    switch: runOp('switch'),
    push: Stack.push,
    change: Stack.change,
    pop: Stack.pop,
    start: State.start,
    stop: State.stop,
  };
})();