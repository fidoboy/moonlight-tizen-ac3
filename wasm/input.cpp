#include "moonlight_wasm.hpp"

#include <Limelight.h>
#include <map>
#include <atomic>

#define KEY_PREFIX 0x80

namespace {
std::map<uint32_t, char> forwardedKeys;
bool forwardedMouseButtons[3] = {};
std::atomic<bool> mouseMovementResetPending{false};
}

void ResetStreamInputState() {
  // Release every key that was forwarded before the menu took ownership.
  for (const auto& key : forwardedKeys) {
    LiSendKeyboardEvent(KEY_PREFIX << 8 | key.first, KEY_ACTION_UP, key.second);
  }
  forwardedKeys.clear();

  // Mouse buttons can also be held by gamepad mouse emulation, so release all
  // three regardless of which input path originally pressed them.
  LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, BUTTON_LEFT);
  LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, BUTTON_MIDDLE);
  LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, BUTTON_RIGHT);
  forwardedMouseButtons[0] = false;
  forwardedMouseButtons[1] = false;
  forwardedMouseButtons[2] = false;

  // The movement accumulator is consumed by the input thread.
  mouseMovementResetPending.store(true, std::memory_order_release);
}

static int ConvertButtonToLiButton(unsigned short button) {
  switch (button) {
    case 0:
      return BUTTON_LEFT;
    case 1:
      return BUTTON_MIDDLE;
    case 2:
      return BUTTON_RIGHT;
    default:
      return 0;
  }
}

static char GetModifierFlags(const EmscriptenKeyboardEvent &event) {
  char flags = 0;

  if (event.ctrlKey == true) {
    flags |= MODIFIER_CTRL;
  }
  if (event.altKey == true) {
    flags |= MODIFIER_ALT;
  }
  if (event.shiftKey == true) {
    flags |= MODIFIER_SHIFT;
  }

  return flags;
}

EM_BOOL MoonlightInstance::HandleMouseDown(const EmscriptenMouseEvent &event) {
  if (streamMenuInputBlocked.load(std::memory_order_acquire)) return EM_TRUE;
  if (!m_MouseLocked) {
    LockMouse();
    m_MouseLastPosX = event.screenX;
    m_MouseLastPosY = event.screenY;
    return EM_TRUE;
  }

  const int button = ConvertButtonToLiButton(event.button);
  if (button != 0) {
    LiSendMouseButtonEvent(BUTTON_ACTION_PRESS, button);
    if (event.button < 3) forwardedMouseButtons[event.button] = true;
  }
  return EM_TRUE;
}

EM_BOOL MoonlightInstance::HandleMouseMove(const EmscriptenMouseEvent &event) {
  if (streamMenuInputBlocked.load(std::memory_order_acquire)) return EM_TRUE;
  if (!m_MouseLocked) {
    return EM_FALSE;
  }

  m_MouseDeltaX += event.movementX;
  m_MouseDeltaY += event.movementY;

  m_MouseLastPosX = event.screenX;
  m_MouseLastPosY = event.screenY;

  return EM_TRUE;
}

EM_BOOL MoonlightInstance::HandleMouseUp(const EmscriptenMouseEvent &event) {
  if (streamMenuInputBlocked.load(std::memory_order_acquire)) return EM_TRUE;
  if (!m_MouseLocked) {
    return EM_FALSE;
  }

  const int button = ConvertButtonToLiButton(event.button);
  if (button != 0 && event.button < 3 && forwardedMouseButtons[event.button]) {
    forwardedMouseButtons[event.button] = false;
    LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, button);
  }
  return EM_TRUE;
}

EM_BOOL MoonlightInstance::HandleWheel(const EmscriptenWheelEvent &event) {
  if (streamMenuInputBlocked.load(std::memory_order_acquire)) return EM_TRUE;
  if (!m_MouseLocked) {
    return EM_FALSE;
  }

  // Inverted delta y-axis to restore correct wheel direction
  m_AccumulatedTicks -= event.deltaY;
  return EM_TRUE;
}

EM_BOOL MoonlightInstance::HandleKeyDown(const EmscriptenKeyboardEvent &event) {
  const bool menuInputBlocked = streamMenuInputBlocked.load(std::memory_order_acquire);
  if (event.keyCode == 53) {
    ClLogMessage("[InputDiag][HandleKeyDown] keyCode=%u (0x%X) blocked=%d mouseLocked=%d\\n",
                 event.keyCode, event.keyCode, menuInputBlocked ? 1 : 0, m_MouseLocked ? 1 : 0);
  }
  if (menuInputBlocked) return EM_TRUE;
  if (!m_MouseLocked) {
    return EM_FALSE;
  }

  char modifiers = GetModifierFlags(event);
  uint32_t keyCode = event.keyCode;

  // Check if the current modifier flags match the defined key combination on the keyboard
  if (modifiers == (MODIFIER_CTRL | MODIFIER_ALT | MODIFIER_SHIFT)) {
    if (keyCode == 0x51) { // Q key
      // Terminate the connection
      stopStream();
      return EM_TRUE;
    } else if (keyCode == 0x53) { // S key
      // Toggle performance stats overlay
      toggleStats();
      return EM_TRUE;
    } else {
      // Wait until these keys come up to unlock the mouse
      m_WaitingForAllModifiersUp = true;
    }
  }

  forwardedKeys[keyCode] = modifiers;
  LiSendKeyboardEvent(KEY_PREFIX << 8 | keyCode, KEY_ACTION_DOWN, modifiers);
  return EM_TRUE;
}

EM_BOOL MoonlightInstance::HandleKeyUp(const EmscriptenKeyboardEvent &event) {
  if (streamMenuInputBlocked.load(std::memory_order_acquire)) return EM_TRUE;
  if (!m_MouseLocked) {
    return EM_FALSE;
  }

  char modifiers = GetModifierFlags(event);
  uint32_t keyCode = event.keyCode;

  // Check if all modifiers are up now
  if (m_WaitingForAllModifiersUp && modifiers == 0) {
    UnlockMouse();
    m_WaitingForAllModifiersUp = false;
  }

  // A key release is forwarded only when its matching press was sent to
  // the host. Menu navigation keys and releases after an input reset stay local.
  const auto forwardedKey = forwardedKeys.find(keyCode);
  if (forwardedKey != forwardedKeys.end()) {
    forwardedKeys.erase(forwardedKey);
    LiSendKeyboardEvent(KEY_PREFIX << 8 | keyCode, KEY_ACTION_UP, modifiers);
  }
  return EM_TRUE;
}

EM_BOOL handleKeyDown(int eventType, const EmscriptenKeyboardEvent *event, void *userData) {
  return g_Instance->HandleKeyDown(*event);
}

EM_BOOL handleKeyUp(int eventType, const EmscriptenKeyboardEvent *event, void *userData) {
  return g_Instance->HandleKeyUp(*event);
}

EM_BOOL handleMouseMove(int eventType, const EmscriptenMouseEvent *event, void *userData) {
  return g_Instance->HandleMouseMove(*event);
}

EM_BOOL handleMouseUp(int eventType, const EmscriptenMouseEvent *event, void *userData) {
  return g_Instance->HandleMouseUp(*event);
}

EM_BOOL handleMouseDown(int eventType, const EmscriptenMouseEvent *event, void *userData) {
  return g_Instance->HandleMouseDown(*event);
}

EM_BOOL handleWheel(int eventType, const EmscriptenWheelEvent *event, void *userData) {
  return g_Instance->HandleWheel(*event);
}

EM_BOOL handlePointerLockChange(int eventType, const EmscriptenPointerlockChangeEvent *pointerlockChangeEvent, void *userData) {
  if (!pointerlockChangeEvent) {
    return false;
  }

  if (pointerlockChangeEvent->isActive) {
    g_Instance->DidLockMouse(0);
  } else {
    g_Instance->MouseLockLost();
  }

  return true;
}

EM_BOOL handlePointerLockError(int eventType, const void *reserved, void *userData) {
  g_Instance->DidLockMouse(eventType);
  return true;
}

void MoonlightInstance::ReportMouseMovement() {
  if (mouseMovementResetPending.exchange(false, std::memory_order_acq_rel)) {
    m_MouseDeltaX = m_MouseDeltaY = 0;
    m_AccumulatedTicks = 0;
  }
  if (streamMenuInputBlocked.load(std::memory_order_acquire)) {
    m_MouseDeltaX = m_MouseDeltaY = 0;
    m_AccumulatedTicks = 0;
    return;
  }
  if (m_MouseDeltaX != 0 || m_MouseDeltaY != 0) {
    LiSendMouseMoveEvent(m_MouseDeltaX, m_MouseDeltaY);
    m_MouseDeltaX = m_MouseDeltaY = 0;
  }

  if (m_AccumulatedTicks != 0) {
    // We can have fractional ticks here, so multiply by WHEEL_DELTA
    // to get actual scroll distance and use the high-res variant.
    LiSendHighResScrollEvent(m_AccumulatedTicks * 5);
    m_AccumulatedTicks = 0;
  }
}

void MoonlightInstance::LockMouse() {
  emscripten_request_pointerlock(kCanvasName, false);
}

void MoonlightInstance::UnlockMouse() {
  emscripten_exit_pointerlock();
}

void MoonlightInstance::DidLockMouse(int32_t result) {
  if (result != 0) {
    ClLogMessage("Error locking mouse, event type: %d\n", result);
  }

  m_MouseLocked = (result == 0);
  if (m_MouseLocked) {
    // Request an IDR frame to dump the frame queue that may have
    // built up from the GL pipeline being stalled.
    LiRequestIdrFrame();
  }
}

void MoonlightInstance::MouseLockLost() {
  m_MouseLocked = false;
}

void sendKeyboardEvent(uint32_t keyCode, uint16_t action, char modifiers) {
  // Send a keyboard event to the host
  LiSendKeyboardEvent(KEY_PREFIX << 8 | keyCode, action, modifiers);
}

EMSCRIPTEN_BINDINGS(input) {
  emscripten::function("sendKeyboardEvent", &sendKeyboardEvent);
}
