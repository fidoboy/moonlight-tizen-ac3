#include "moonlight_wasm.hpp"

#include <iostream>
#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <string>
#include <vector>
#include <utility>
#include <sstream>
#include <chrono>
#include <thread>
#include <cmath>
#include <map>
#include <mutex>

#include <Limelight.h>
#include <emscripten/emscripten.h>

namespace gamepad_identity {
constexpr unsigned kMaxControllers = 16;

inline uint8_t controllerType(std::string id) {
  std::transform(id.begin(), id.end(), id.begin(), [](unsigned char c) {
    return static_cast<char>(std::tolower(c));
  });
  const auto contains = [&id](const char* value) {
    return id.find(value) != std::string::npos;
  };
  if (contains("vendor: 054c") || contains("vendor:054c") || id.find("054c-") == 0 ||
      contains("dualsense") || contains("dualshock") || contains("playstation") ||
      contains("sony interactive entertainment") || contains("sony computer entertainment")) {
    return LI_CTYPE_PS;
  }
  if (contains("vendor: 045e") || contains("vendor:045e") || id.find("045e-") == 0 || contains("xbox")) {
    return LI_CTYPE_XBOX;
  }
  if (contains("vendor: 057e") || contains("vendor:057e") || id.find("057e-") == 0 ||
      contains("nintendo") || contains("joy-con")) {
    return LI_CTYPE_NINTENDO;
  }
  return LI_CTYPE_UNKNOWN;
}

inline uint32_t supportedButtons(int count, bool flipAB = false, bool flipXY = false) {
  static constexpr uint32_t buttons[] = {
    A_FLAG, B_FLAG, X_FLAG, Y_FLAG, LB_FLAG, RB_FLAG, 0, 0,
    BACK_FLAG, PLAY_FLAG, LS_CLK_FLAG, RS_CLK_FLAG,
    UP_FLAG, DOWN_FLAG, LEFT_FLAG, RIGHT_FLAG, SPECIAL_FLAG, MISC_FLAG
  };
  uint32_t flags = 0;
  for (int i = 0; i < count && i < 18; ++i) {
    auto flag = buttons[i];
    if (flipAB && i < 2) {
      flag = buttons[1 - i];
    } else if (flipXY && i >= 2 && i < 4) {
      flag = buttons[5 - i];
    }
    flags |= flag;
  }
  return flags;
}

struct Sample {
  bool connected = false;
  double timestamp = 0;
  std::string id;
};

struct Changes {
  uint16_t mask = 0;
  std::vector<unsigned> removed;
  std::vector<unsigned> arrived;
};

// Browser arrays contain null slots and Tizen placeholder devices. Preserve
// physical indices, and announce each real device before its first input packet.
class Tracker {
 public:
  Changes update(const std::array<Sample, kMaxControllers>& samples) {
    Changes changes;
    for (unsigned i = 0; i < kMaxControllers; ++i) {
      const auto& sample = samples[i];
      auto& state = states_[i];
      const bool sameDevice = state.id == sample.id;
      const bool real = sample.connected &&
                        (sample.timestamp != 0 || (sameDevice && state.seenTimestamp));
      if (state.announced && (!real || !sameDevice)) {
        changes.removed.push_back(i);
        state.announced = false;
      }
      if (!real) {
        state = {};
        continue;
      }
      state.id = sample.id;
      state.seenTimestamp = true;
      changes.mask |= static_cast<uint16_t>(1u << i);
      if (!state.announced) {
        changes.arrived.push_back(i);
      }
    }
    return changes;
  }

  void announced(unsigned i) { states_.at(i).announced = true; }
  bool isAnnounced(unsigned i) const { return states_.at(i).announced; }
  // Announcements are scoped to a stream. Retain timestamp knowledge like the
  // browser-side mask until a disconnect or replacement invalidates the slot.
  void reset() {
    for (auto& state : states_) {
      state.announced = false;
    }
  }

 private:
  struct State {
    bool seenTimestamp = false;
    bool announced = false;
    std::string id;
  };
  std::array<State, kMaxControllers> states_{};
};
}  // namespace gamepad_identity


// The streaming menu owns all remote input while it is visible.
std::atomic<bool> streamMenuInputBlocked{false};

// Bitmask for gamepad combo buttons to stop the streaming session
const short STOP_STREAM_BUTTONS = BACK_FLAG | PLAY_FLAG | LB_FLAG | RB_FLAG;

// Bitmask for gamepad combo buttons to toggle the performance stats overlay
const short PERF_STATS_BUTTONS = BACK_FLAG | LB_FLAG | RB_FLAG | X_FLAG;

// Flag for gamepad to track controller rumble state
bool rumbleFeedbackSwitch = false;

// Flags for gamepad to track mouse emulation state
bool mouseEmulationSwitch = false;
bool mouseEmulationActive = false;
bool selectHoldStreamMenuSwitch = false;
std::map<int, std::chrono::steady_clock::time_point> selectPressTimes;
std::map<int, bool> selectMenuTriggered;
std::map<int, bool> selectButtonConsumed;
std::map<int, std::chrono::steady_clock::time_point> selectClickPulseUntil;
std::map<int, bool> comboTriggered;
std::map<int, std::chrono::steady_clock::time_point> activatePressTimes;

// Flags for gamepad to track face buttons state
bool flipABfaceButtonsSwitch = false;
bool flipXYfaceButtonsSwitch = false;

// For explanation on ordering, see: https://www.w3.org/TR/gamepad/#remapping
// Enumeration for gamepad buttons
enum GamepadButton {
  A, B, X, Y,
  LeftBumper, RightBumper,
  LeftTrigger, RightTrigger,
  Back, Play,
  LeftStick, RightStick,
  Up, Down, Left, Right,
  Special, Share,
  Count,
};

// For explanation on ordering, see: https://www.w3.org/TR/gamepad/#remapping
// Enumeration for gamepad axis
enum GamepadAxis {
  LeftX = 0,
  LeftY = 1,
  RightX = 2,
  RightY = 3,
};

static gamepad_identity::Tracker controllerTracker;
static std::mutex streamMenuInputMutex;
static std::atomic<bool> gamepadResetPending{false};
static uint16_t lastActiveGamepadMask = 0;
static std::array<bool, gamepad_identity::kMaxControllers> gamepadNeutralRequired{};

extern "C" EMSCRIPTEN_KEEPALIVE void setStreamMenuInputBlocked(int blocked) {
  // Serialize the complete ownership transition, including the reset, against
  // the final native gamepad dispatch. Publish the reset before releasing input.
  std::lock_guard<std::mutex> lock(streamMenuInputMutex);
  const bool newState = blocked != 0;
  if (streamMenuInputBlocked.load(std::memory_order_acquire) == newState) {
    return;
  }

  // The polling thread owns gamepad state; it consumes this flag and discards
  // any sample captured before the new input epoch.
  gamepadResetPending.store(true, std::memory_order_release);
  ResetStreamInputState();
  streamMenuInputBlocked.store(newState, std::memory_order_release);
}

static bool IsGamepadNeutral(const EmscriptenGamepadEvent& gamepad) {
  for (int i = 0; i < gamepad.numButtons; ++i) {
    if (gamepad.digitalButton[i] == EM_TRUE ||
        std::abs(gamepad.analogButton[i]) > 0.05f) {
      return false;
    }
  }
  for (int i = 0; i < gamepad.numAxes; ++i) {
    if (std::abs(gamepad.axis[i]) > 0.15f) {
      return false;
    }
  }
  return true;
}

// Function to map gamepad buttons to flags
static int GetButtonFlags(const EmscriptenGamepadEvent& gamepad) {
  // Triggers are considered analog buttons in the "Emscripten API", however they need
  // to be passed in separate arguments for "Limelight" (it even lacks flags for them).

  const int* buttonMasks = nullptr;
  int buttonMasksSize = 0;

  // Define button mapping with A/B and X/Y swapped
  static const int buttonMasksABXY[] = {
    B_FLAG, A_FLAG, Y_FLAG, X_FLAG,
    LB_FLAG, RB_FLAG,
    0 /* LT_FLAG */, 0 /* RT_FLAG */,
    BACK_FLAG, PLAY_FLAG,
    LS_CLK_FLAG, RS_CLK_FLAG,
    UP_FLAG, DOWN_FLAG, LEFT_FLAG, RIGHT_FLAG,
    SPECIAL_FLAG, MISC_FLAG,
  };
  // Define button mapping with A/B swapped
  static const int buttonMasksAB[] = {
    B_FLAG, A_FLAG, X_FLAG, Y_FLAG,
    LB_FLAG, RB_FLAG,
    0 /* LT_FLAG */, 0 /* RT_FLAG */,
    BACK_FLAG, PLAY_FLAG,
    LS_CLK_FLAG, RS_CLK_FLAG,
    UP_FLAG, DOWN_FLAG, LEFT_FLAG, RIGHT_FLAG,
    SPECIAL_FLAG, MISC_FLAG,
  };
  // Define button mapping with X/Y swapped
  static const int buttonMasksXY[] = {
    A_FLAG, B_FLAG, Y_FLAG, X_FLAG,
    LB_FLAG, RB_FLAG,
    0 /* LT_FLAG */, 0 /* RT_FLAG */,
    BACK_FLAG, PLAY_FLAG,
    LS_CLK_FLAG, RS_CLK_FLAG,
    UP_FLAG, DOWN_FLAG, LEFT_FLAG, RIGHT_FLAG,
    SPECIAL_FLAG, MISC_FLAG,
  };
  // Define default button mapping
  static const int buttonMasksDefault[] = {
    A_FLAG, B_FLAG, X_FLAG, Y_FLAG,
    LB_FLAG, RB_FLAG,
    0 /* LT_FLAG */, 0 /* RT_FLAG */,
    BACK_FLAG, PLAY_FLAG,
    LS_CLK_FLAG, RS_CLK_FLAG,
    UP_FLAG, DOWN_FLAG, LEFT_FLAG, RIGHT_FLAG,
    SPECIAL_FLAG, MISC_FLAG,
  };

  // Check if the A/B or X/Y face buttons switches are checked
  if (flipABfaceButtonsSwitch && flipXYfaceButtonsSwitch) {
    // Swap both A/B and X/Y buttons
    buttonMasks = buttonMasksABXY;
    buttonMasksSize = sizeof(buttonMasksABXY) / sizeof(buttonMasksABXY[0]);
  } else if (flipABfaceButtonsSwitch) { // Check if the A/B face buttons switch is checked
    // Swap A and B buttons
    buttonMasks = buttonMasksAB;
    buttonMasksSize = sizeof(buttonMasksAB) / sizeof(buttonMasksAB[0]);
  } else if (flipXYfaceButtonsSwitch) { // Check if the X/Y face buttons switch is checked
    // Swap X and Y buttons
    buttonMasks = buttonMasksXY;
    buttonMasksSize = sizeof(buttonMasksXY) / sizeof(buttonMasksXY[0]);
  } else {
    // Default buttons layout
    buttonMasks = buttonMasksDefault;
    buttonMasksSize = sizeof(buttonMasksDefault) / sizeof(buttonMasksDefault[0]);
  }

  int result = 0;
  
  for (int i = 0; i < gamepad.numButtons && i < buttonMasksSize; ++i) {
    if (gamepad.digitalButton[i] == EM_TRUE) {
      result |= buttonMasks[i];
    }
  }

  return result;
}

// Function to handle the gamepad input state
void MoonlightInstance::HandleGamepadInputState(bool rumbleFeedback, bool mouseEmulation, bool selectHoldStreamMenu, bool flipABfaceButtons, bool flipXYfaceButtons) {
  controllerTracker.reset();
  selectPressTimes.clear();
  selectMenuTriggered.clear();
  selectButtonConsumed.clear();
  selectClickPulseUntil.clear();
  rumbleFeedbackSwitch = rumbleFeedback;
  mouseEmulationSwitch = mouseEmulation;
  selectHoldStreamMenuSwitch = selectHoldStreamMenu;
  flipABfaceButtonsSwitch = flipABfaceButtons;
  flipXYfaceButtonsSwitch = flipXYfaceButtons;
}

// Function to poll gamepad input
void MoonlightInstance::PollGamepads() {
  if (emscripten_sample_gamepad_data() != EMSCRIPTEN_RESULT_SUCCESS) {
    std::cerr << "Sample gamepad data failed!\n";
    return;
  }

  const auto numGamepads = emscripten_get_num_gamepads();
  if (numGamepads == EMSCRIPTEN_RESULT_NOT_SUPPORTED) {
    std::cerr << "Get num gamepads failed!\n";
    return;
  }

  std::array<EmscriptenGamepadEvent, gamepad_identity::kMaxControllers> events{};
  std::array<gamepad_identity::Sample, gamepad_identity::kMaxControllers> samples{};
  const auto limit = std::min<int>(numGamepads, gamepad_identity::kMaxControllers);
  for (int i = 0; i < limit; ++i) {
    if (emscripten_get_gamepad_status(i, &events[i]) == EMSCRIPTEN_RESULT_SUCCESS) {
      samples[i] = {events[i].connected != 0, events[i].timestamp, events[i].id};
    }
  }
  // Apply controller releases on the polling thread. This runs on both menu
  // transitions, so a button held before opening or closing cannot be replayed.
  if (gamepadResetPending.exchange(false, std::memory_order_acq_rel)) {
    for (unsigned i = 0; i < gamepad_identity::kMaxControllers; ++i) {
      if (controllerTracker.isAnnounced(i)) {
        LiSendMultiControllerEvent(i, lastActiveGamepadMask, 0, 0, 0, 0, 0, 0, 0);
      }
    }
    gamepadNeutralRequired.fill(true);
    selectPressTimes.clear();
    selectMenuTriggered.clear();
    selectButtonConsumed.clear();
    selectClickPulseUntil.clear();
    comboTriggered.clear();
    activatePressTimes.clear();
  }

  // Keep sampling paused at the native input boundary while the UI owns the controller.
  // Tracker changes are deferred until the menu has released ownership.
  if (streamMenuInputBlocked.load(std::memory_order_acquire)) {
    return;
  }

  const auto changes = controllerTracker.update(samples);
  const auto activeGamepadMask = changes.mask;
  lastActiveGamepadMask = activeGamepadMask;
  for (const auto i : changes.removed) {
    selectPressTimes.erase(i);
    selectMenuTriggered.erase(i);
    selectButtonConsumed.erase(i);
    selectClickPulseUntil.erase(i);
    LiSendMultiControllerEvent(i, activeGamepadMask & ~(1u << i), 0, 0, 0, 0, 0, 0, 0);
  }
  for (const auto i : changes.arrived) {
    const auto& gamepad = events[i];
    const auto type = gamepad_identity::controllerType(samples[i].id);
    const auto buttons = gamepad_identity::supportedButtons(
        gamepad.numButtons, flipABfaceButtonsSwitch, flipXYfaceButtonsSwitch);
    uint16_t capabilities = gamepad.numButtons > 7 ? LI_CCAP_ANALOG_TRIGGERS : 0;
    // The browser Gamepad API does not expose motion, battery, RGB or touchpad
    // data. Only advertise rumble when our existing feedback path can use it.
    if (rumbleFeedbackSwitch && MAIN_THREAD_EM_ASM_INT({
      var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      var gamepad = gamepads[$0];
      return !!(gamepad && gamepad.vibrationActuator &&
                typeof gamepad.vibrationActuator.playEffect === 'function');
    }, i)) {
      capabilities |= LI_CCAP_RUMBLE;
    }
    if (LiSendControllerArrivalEvent(i, activeGamepadMask, type, buttons, capabilities) == 0) {
      controllerTracker.announced(i);
      ClLogMessage("Controller %u announced with type %u\n", i, type);
    }
  }
  for (int gamepadID = 0; gamepadID < limit; ++gamepadID) {
    if (!(activeGamepadMask & (1u << gamepadID)) || !controllerTracker.isAnnounced(gamepadID)) {
      continue;
    }
    const auto& gamepad = events[gamepadID];

    // Require every controller to return to neutral after the menu closes.
    // This prevents held buttons/triggers/sticks from becoming fresh host input.
    if (gamepadNeutralRequired[gamepadID]) {
      if (!IsGamepadNeutral(gamepad)) {
        continue;
      }
      gamepadNeutralRequired[gamepadID] = false;
    }

    // Process input for active gamepad
    auto buttonFlags = GetButtonFlags(gamepad);
    const auto leftTrigger = gamepad.analogButton[GamepadButton::LeftTrigger]
      * std::numeric_limits<unsigned char>::max();
    const auto rightTrigger = gamepad.analogButton[GamepadButton::RightTrigger]
      * std::numeric_limits<unsigned char>::max();
    const auto leftStickX = gamepad.axis[GamepadAxis::LeftX]
      * std::numeric_limits<short>::max();
    const auto leftStickY = -gamepad.axis[GamepadAxis::LeftY]
      * std::numeric_limits<short>::max();
    const auto rightStickX = gamepad.axis[GamepadAxis::RightX]
      * std::numeric_limits<short>::max();
    const auto rightStickY = -gamepad.axis[GamepadAxis::RightY]
      * std::numeric_limits<short>::max();

    // Check if the current button flags match the defined button combination on the gamepad
    if (buttonFlags == STOP_STREAM_BUTTONS) {
      // Terminate the connection
      stopStream();
      return;
    } else if (buttonFlags == PERF_STATS_BUTTONS) {
      if (!comboTriggered[gamepadID]) {
        // Toggle performance stats overlay
        toggleStats();
        // Mark combo as triggered until buttons are released
        comboTriggered[gamepadID] = true;
      }
    } else {
      // Reset when buttons are released
      comboTriggered[gamepadID] = false;
    }

    // Hold Select locally until the gesture is known: a short press is replayed as a
    // brief button pulse, while a long press opens the stream menu without reaching the host.
    if (selectHoldStreamMenuSwitch) {
      const bool selectPressed = (buttonFlags & BACK_FLAG) != 0;
      if (selectPressed) selectClickPulseUntil.erase(gamepadID);
      const bool reservedCombo = buttonFlags == STOP_STREAM_BUTTONS || buttonFlags == PERF_STATS_BUTTONS;
      if (selectPressed && reservedCombo) {
        // Preserve the existing stop/statistics combinations; they take precedence over this shortcut.
        selectPressTimes.erase(gamepadID);
        if (!selectButtonConsumed[gamepadID]) {
          selectMenuTriggered[gamepadID] = false;
        }
      } else if (selectPressed) {
        const auto now = std::chrono::steady_clock::now();
        auto press = selectPressTimes.find(gamepadID);
        if (press == selectPressTimes.end()) {
          selectPressTimes[gamepadID] = now;
        } else if (!selectMenuTriggered[gamepadID] &&
                   std::chrono::duration_cast<std::chrono::milliseconds>(now - press->second).count() >= 1000) {
          selectMenuTriggered[gamepadID] = true;
          selectButtonConsumed[gamepadID] = true;
          PostToJs(std::string("openStreamMenu"));
        }
        // Do not expose a pending or consumed Select hold to the streamed game.
        buttonFlags &= ~BACK_FLAG;
      } else {
        const bool replayShortPress = selectPressTimes.find(gamepadID) != selectPressTimes.end() &&
                                      !selectMenuTriggered[gamepadID] &&
                                      !selectButtonConsumed[gamepadID];
        selectPressTimes.erase(gamepadID);
        selectMenuTriggered[gamepadID] = false;
        selectButtonConsumed[gamepadID] = false;
        if (replayShortPress) {
          // Deliver a normal Select click after the user releases it before the long-press threshold.
          selectClickPulseUntil[gamepadID] = std::chrono::steady_clock::now() + std::chrono::milliseconds(50);
        }
        const auto pulse = selectClickPulseUntil.find(gamepadID);
        if (pulse != selectClickPulseUntil.end()) {
          if (std::chrono::steady_clock::now() < pulse->second) {
            buttonFlags |= BACK_FLAG;
          } else {
            selectClickPulseUntil.erase(pulse);
          }
        }
      }
    } else {
      selectClickPulseUntil.erase(gamepadID);
      selectPressTimes.erase(gamepadID);
      selectMenuTriggered[gamepadID] = false;
      selectButtonConsumed[gamepadID] = false;
    }

    // Check if the mouse emulation switch is checked
    if (mouseEmulationSwitch) {
      // Toggle mouse emulation on and off based on how long the PLAY/START button is pressed
      if (buttonFlags & PLAY_FLAG) {
        if (activatePressTimes.find(gamepadID) == activatePressTimes.end()) {
          activatePressTimes[gamepadID] = std::chrono::steady_clock::now();
        }
        auto currentTime = std::chrono::steady_clock::now();
        // Calculate the duration in milliseconds since the PLAY/START button was pressed
        auto durationTime = std::chrono::duration_cast<std::chrono::milliseconds>(currentTime - activatePressTimes[gamepadID]).count();
        // If the button has been pressed for at least 1000 milliseconds (1 second)
        if (durationTime >= 1000) {
          // Toggle mouse emulation state
          if (!mouseEmulationActive) {
            // Activate mouse emulation and notify the user
            mouseEmulationActive = true;
            PostToJs(std::string("mouseEmulationOn"));
          } else {
            // Deactivate mouse emulation and notify the user
            mouseEmulationActive = false;
            PostToJs(std::string("mouseEmulationOff"));
          }
          // Reset the PLAY/START press time to the current time after toggling
          activatePressTimes[gamepadID] = std::chrono::steady_clock::now();
        }
      } else {
        // If the PLAY/START button is not pressed, reset PLAY/START press time to the current time
        activatePressTimes[gamepadID] = std::chrono::steady_clock::now();
      }
    } else {
      // Deactivate mouse emulation if the mouse emulation switch is unchecked
      mouseEmulationActive = false;
    }

    // Serialize the final dispatch with menu ownership changes. The opening
    // sample is discarded, and no gamepad packet can cross the block boundary.
    std::lock_guard<std::mutex> inputLock(streamMenuInputMutex);
    if (streamMenuInputBlocked.load(std::memory_order_acquire) ||
        gamepadResetPending.load(std::memory_order_acquire)) {
      return;
    }

    // If mouse emulation is active, then send mouse input to the desired handler (acts as a mouse)
    if (mouseEmulationActive) {
      // Left Stick values are mapped to horizontal and vertical mouse movements
      const float baseMouseSpeed = 10.0f;
      const float leftStickMagnitude = std::sqrt(leftStickX * leftStickX + leftStickY * leftStickY) / std::numeric_limits<short>::max();
      const float mouseSpeed = baseMouseSpeed * leftStickMagnitude;
      const float mouseXDelta = static_cast<float>(leftStickX) / std::numeric_limits<short>::max() * mouseSpeed;
      const float mouseYDelta = -static_cast<float>(leftStickY) / std::numeric_limits<short>::max() * mouseSpeed;
      
      // Send a mouse move event with the specified delta values for both horizontal (X-axis) and vertical (Y-axis) coordinates
      LiSendMouseMoveEvent(static_cast<int>(mouseXDelta), static_cast<int>(mouseYDelta));

      // Right Stick values are mapped to horizontal and vertical mouse scrolls
      const float baseScrollSpeed = 1.0f;
      const float rightStickMagnitude = std::sqrt(rightStickX * rightStickX + rightStickY * rightStickY) / std::numeric_limits<short>::max();
      const float scrollSpeed = baseScrollSpeed * rightStickMagnitude;
      const float scrollXDelta = static_cast<float>(rightStickX) / std::numeric_limits<short>::max() * scrollSpeed;
      const float scrollYDelta = static_cast<float>(rightStickY) / std::numeric_limits<short>::max() * scrollSpeed;
      
      // Send mouse scroll events with the specified delta values for both horizontal (X-axis) and vertical (Y-axis) coordinates
      LiSendHScrollEvent(static_cast<int>(scrollXDelta));
      LiSendScrollEvent(static_cast<int>(scrollYDelta));

      // Face Buttons values are mapped to control mouse buttons
      if (buttonFlags & (A_FLAG | LB_FLAG)) {
        // Send a mouse button press event for the left button
        LiSendMouseButtonEvent(BUTTON_ACTION_PRESS, BUTTON_LEFT);
      } else {
        // Send a mouse button release event for the left button
        LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, BUTTON_LEFT);
      }
      if (buttonFlags & (X_FLAG | Y_FLAG)) {
        // Send a mouse button press event for the Middle button
        LiSendMouseButtonEvent(BUTTON_ACTION_PRESS, BUTTON_MIDDLE);
      } else {
        // Send a mouse button release event for the Middle button
        LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, BUTTON_MIDDLE);
      }
      if (buttonFlags & (B_FLAG | RB_FLAG)) {
        // Send a mouse button press event for the Right button
        LiSendMouseButtonEvent(BUTTON_ACTION_PRESS, BUTTON_RIGHT);
      } else {
        // Send a mouse button release event for the Right button
        LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, BUTTON_RIGHT);
      }
    } else {
      // If mouse emulation is inactive, then send gamepad input to the desired handler (acts as a gamepad)
      LiSendMultiControllerEvent(
        gamepadID, activeGamepadMask, buttonFlags, leftTrigger,
        rightTrigger, leftStickX, leftStickY, rightStickX, rightStickY);
    }
  }
}

// Function to send controller rumble feedback for gamepad
void MoonlightInstance::ClControllerRumble(unsigned short controllerNumber, unsigned short lowFreqMotor, unsigned short highFreqMotor) {
  const float weakMagnitude = static_cast<float>(highFreqMotor) / static_cast<float>(UINT16_MAX);
  const float strongMagnitude = static_cast<float>(lowFreqMotor) / static_cast<float>(UINT16_MAX);
  
  // Check if the rumble feedback switch is checked
  if (rumbleFeedbackSwitch) {
    std::ostringstream ss;
    ss << controllerNumber << "," << weakMagnitude << "," << strongMagnitude;
    PostToJs(std::string("controllerRumble: ") + ss.str());
  }
}
