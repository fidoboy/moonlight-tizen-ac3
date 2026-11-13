/*
 * Native WMP input backend.
 *
 * Reads classified Linux evdev devices and forwards their events directly to
 * Moonlight Common C. Capability bits are exported to the WebApp so it can stop
 * forwarding the same physical input over MessagePort:
 *   bit 0: keyboard, bit 1: relative mouse, bit 2: gamepad.
 *
 * Devices are deliberately not EVIOCGRAB'ed: the TV/browser retains its normal
 * local input handling. The WebApp suppresses only its host-forwarding path for
 * device classes captured here.
 */
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <poll.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

#include "Limelight.h"

#ifndef BTN_SOUTH
#define BTN_SOUTH BTN_A
#define BTN_EAST  BTN_B
#define BTN_NORTH BTN_X
#define BTN_WEST  BTN_Y
#endif

#define MAX_DEV 32
#define INPUT_CAP_KEYBOARD 0x01
#define INPUT_CAP_MOUSE    0x02
#define INPUT_CAP_GAMEPAD  0x04

typedef struct {
    int fd;
    unsigned caps;
    char name[128];
    struct input_absinfo abs[ABS_MAX + 1];
    unsigned char abs_valid[ABS_MAX + 1];
} input_device;

static input_device s_devices[MAX_DEV];
static struct pollfd s_poll[MAX_DEV];
static int s_device_count;
static int s_run;
static int s_thread_started;
static pthread_t s_thread;
static unsigned s_capabilities;
static pthread_mutex_t s_state_lock = PTHREAD_MUTEX_INITIALIZER;

/* Gamepad state. This implementation exposes the first evdev gamepad as pad 0. */
static int s_pad_registered;
static int s_pad_buttons;
static short s_lx, s_ly, s_rx, s_ry;
static unsigned char s_lt, s_rt;
static char s_modifiers;
static int s_suppress_stop_key;
static int s_mouse_dx, s_mouse_dy, s_mouse_wheel;

static int bit_is_set(const unsigned long *bits, unsigned bit) {
    return (bits[bit / (8 * sizeof(unsigned long))] >>
            (bit % (8 * sizeof(unsigned long)))) & 1UL;
}

static short map_vk(int code) {
    if (code >= KEY_1 && code <= KEY_9) return (short)(0x31 + code - KEY_1);
    if (code == KEY_0) return 0x30;
    if (code >= KEY_F1 && code <= KEY_F12) return (short)(0x70 + code - KEY_F1);
    switch (code) {
    case KEY_A: return 0x41; case KEY_B: return 0x42; case KEY_C: return 0x43;
    case KEY_D: return 0x44; case KEY_E: return 0x45; case KEY_F: return 0x46;
    case KEY_G: return 0x47; case KEY_H: return 0x48; case KEY_I: return 0x49;
    case KEY_J: return 0x4A; case KEY_K: return 0x4B; case KEY_L: return 0x4C;
    case KEY_M: return 0x4D; case KEY_N: return 0x4E; case KEY_O: return 0x4F;
    case KEY_P: return 0x50; case KEY_Q: return 0x51; case KEY_R: return 0x52;
    case KEY_S: return 0x53; case KEY_T: return 0x54; case KEY_U: return 0x55;
    case KEY_V: return 0x56; case KEY_W: return 0x57; case KEY_X: return 0x58;
    case KEY_Y: return 0x59; case KEY_Z: return 0x5A;
    case KEY_ENTER: case KEY_KPENTER: return 0x0D;
    case KEY_ESC: return 0x1B; case KEY_BACKSPACE: return 0x08;
    case KEY_TAB: return 0x09; case KEY_SPACE: return 0x20;
    case KEY_UP: return 0x26; case KEY_DOWN: return 0x28;
    case KEY_LEFT: return 0x25; case KEY_RIGHT: return 0x27;
    case KEY_LEFTSHIFT: case KEY_RIGHTSHIFT: return 0xA0;
    case KEY_LEFTCTRL: case KEY_RIGHTCTRL: return 0xA2;
    case KEY_LEFTALT: case KEY_RIGHTALT: return 0xA4;
    case KEY_DELETE: return 0x2E; case KEY_HOME: return 0x24;
    case KEY_END: return 0x23; case KEY_PAGEUP: return 0x21;
    case KEY_PAGEDOWN: return 0x22; case KEY_INSERT: return 0x2D;
    case KEY_CAPSLOCK: return 0x14; case KEY_LEFTMETA: case KEY_RIGHTMETA: return 0x5B;
    case KEY_MINUS: return 0xBD; case KEY_EQUAL: return 0xBB;
    case KEY_LEFTBRACE: return 0xDB; case KEY_RIGHTBRACE: return 0xDD;
    case KEY_BACKSLASH: return 0xDC; case KEY_SEMICOLON: return 0xBA;
    case KEY_APOSTROPHE: return 0xDE; case KEY_GRAVE: return 0xC0;
    case KEY_COMMA: return 0xBC; case KEY_DOT: return 0xBE;
    case KEY_SLASH: return 0xBF; case KEY_KPSLASH: return 0x6F;
    case KEY_KPASTERISK: return 0x6A; case KEY_KPMINUS: return 0x6D;
    case KEY_KPPLUS: return 0x6B; case KEY_KPDOT: return 0x6E;
    default: return 0;
    }
}

static void update_modifier(int code, int down) {
    char flag = 0;
    if (code == KEY_LEFTSHIFT || code == KEY_RIGHTSHIFT) flag = MODIFIER_SHIFT;
    else if (code == KEY_LEFTCTRL || code == KEY_RIGHTCTRL) flag = MODIFIER_CTRL;
    else if (code == KEY_LEFTALT || code == KEY_RIGHTALT) flag = MODIFIER_ALT;
    if (flag) {
        if (down) s_modifiers |= flag;
        else s_modifiers &= (char)~flag;
    }
}

static int gamepad_flag(int code) {
    switch (code) {
    case BTN_SOUTH: return A_FLAG; case BTN_EAST: return B_FLAG;
    case BTN_NORTH: return X_FLAG; case BTN_WEST: return Y_FLAG;
    case BTN_TL: return LB_FLAG; case BTN_TR: return RB_FLAG;
    case BTN_SELECT: return BACK_FLAG; case BTN_START: return PLAY_FLAG;
    case BTN_THUMBL: return LS_CLK_FLAG; case BTN_THUMBR: return RS_CLK_FLAG;
    case BTN_MODE: return SPECIAL_FLAG;
    case BTN_DPAD_UP: return UP_FLAG; case BTN_DPAD_DOWN: return DOWN_FLAG;
    case BTN_DPAD_LEFT: return LEFT_FLAG; case BTN_DPAD_RIGHT: return RIGHT_FLAG;
    default: return 0;
    }
}

static unsigned gamepad_supported_buttons(void) {
    return A_FLAG | B_FLAG | X_FLAG | Y_FLAG | LB_FLAG | RB_FLAG |
           BACK_FLAG | PLAY_FLAG | LS_CLK_FLAG | RS_CLK_FLAG | SPECIAL_FLAG |
           UP_FLAG | DOWN_FLAG | LEFT_FLAG | RIGHT_FLAG;
}

static void send_pad(void) {
    LiSendMultiControllerEvent(0, 0x1, s_pad_buttons, s_lt, s_rt,
                               s_lx, s_ly, s_rx, s_ry);
}

static short normalize_axis(const struct input_absinfo *info, int value, int invert) {
    if (!info || info->maximum <= info->minimum) return 0;
    long long clamped = value;
    if (clamped < info->minimum) clamped = info->minimum;
    if (clamped > info->maximum) clamped = info->maximum;
    long long range = (long long)info->maximum - info->minimum;
    long long scaled = ((clamped - info->minimum) * 65535LL) / range - 32768LL;
    if (invert) scaled = -scaled;
    if (scaled < -32768) scaled = -32768;
    if (scaled > 32767) scaled = 32767;
    return (short)scaled;
}

static unsigned char normalize_trigger(const struct input_absinfo *info, int value) {
    if (!info || info->maximum <= info->minimum) return 0;
    long long clamped = value;
    if (clamped < info->minimum) clamped = info->minimum;
    if (clamped > info->maximum) clamped = info->maximum;
    return (unsigned char)(((clamped - info->minimum) * 255LL) /
                           ((long long)info->maximum - info->minimum));
}

static void handle_event(input_device *dev, const struct input_event *event) {
    if (event->type == EV_KEY) {
        int down = event->value != 0;
        if (dev->caps & INPUT_CAP_MOUSE) {
            int button = event->code == BTN_LEFT ? BUTTON_LEFT :
                         event->code == BTN_RIGHT ? BUTTON_RIGHT :
                         event->code == BTN_MIDDLE ? BUTTON_MIDDLE : 0;
            if (button) {
                LiSendMouseButtonEvent(down ? BUTTON_ACTION_PRESS : BUTTON_ACTION_RELEASE,
                                       button);
                return;
            }
        }
        if (dev->caps & INPUT_CAP_GAMEPAD) {
            int flag = gamepad_flag(event->code);
            if (flag) {
                if (down) s_pad_buttons |= flag;
                else s_pad_buttons &= ~flag;
                send_pad();
                return;
            }
        }
        if (dev->caps & INPUT_CAP_KEYBOARD) {
            /* Ctrl+Alt+Shift+Q is reserved by the WebApp to stop WMP. */
            if (event->code == KEY_Q) {
                if (down && s_modifiers ==
                    (MODIFIER_CTRL | MODIFIER_ALT | MODIFIER_SHIFT)) {
                    s_suppress_stop_key = 1;
                    return;
                }
                if (s_suppress_stop_key) {
                    if (!down) s_suppress_stop_key = 0;
                    return;
                }
            }
            short vk = map_vk(event->code);
            if (vk) {
                update_modifier(event->code, down);
                if (event->value != 2)
                    LiSendKeyboardEvent(vk,
                        down ? KEY_ACTION_DOWN : KEY_ACTION_UP, s_modifiers);
            }
        }
    } else if (event->type == EV_REL && (dev->caps & INPUT_CAP_MOUSE)) {
        if (event->code == REL_X) s_mouse_dx += event->value;
        else if (event->code == REL_Y) s_mouse_dy += event->value;
        else if (event->code == REL_WHEEL) s_mouse_wheel += event->value;
    } else if (event->type == EV_ABS && (dev->caps & INPUT_CAP_GAMEPAD)) {
        const struct input_absinfo *info =
            dev->abs_valid[event->code] ? &dev->abs[event->code] : NULL;
        switch (event->code) {
        case ABS_X: s_lx = normalize_axis(info, event->value, 0); send_pad(); break;
        case ABS_Y: s_ly = normalize_axis(info, event->value, 1); send_pad(); break;
        case ABS_RX: s_rx = normalize_axis(info, event->value, 0); send_pad(); break;
        case ABS_RY: s_ry = normalize_axis(info, event->value, 1); send_pad(); break;
        case ABS_Z: case ABS_BRAKE:
            s_lt = normalize_trigger(info, event->value); send_pad(); break;
        case ABS_RZ: case ABS_GAS:
            s_rt = normalize_trigger(info, event->value); send_pad(); break;
        case ABS_HAT0X:
            s_pad_buttons &= ~(LEFT_FLAG | RIGHT_FLAG);
            if (event->value < 0) s_pad_buttons |= LEFT_FLAG;
            else if (event->value > 0) s_pad_buttons |= RIGHT_FLAG;
            send_pad(); break;
        case ABS_HAT0Y:
            s_pad_buttons &= ~(UP_FLAG | DOWN_FLAG);
            if (event->value < 0) s_pad_buttons |= UP_FLAG;
            else if (event->value > 0) s_pad_buttons |= DOWN_FLAG;
            send_pad(); break;
        }
    } else if (event->type == EV_SYN && event->code == SYN_REPORT &&
               (dev->caps & INPUT_CAP_MOUSE)) {
        if (s_mouse_dx || s_mouse_dy) {
            int dx = s_mouse_dx, dy = s_mouse_dy;
            while (dx || dy) {
                short sx = dx > 32767 ? 32767 : dx < -32768 ? -32768 : (short)dx;
                short sy = dy > 32767 ? 32767 : dy < -32768 ? -32768 : (short)dy;
                LiSendMouseMoveEvent(sx, sy);
                dx -= sx; dy -= sy;
            }
            s_mouse_dx = s_mouse_dy = 0;
        }
        if (s_mouse_wheel) {
            int wheel = s_mouse_wheel;
            while (wheel) {
                signed char part = wheel > 127 ? 127 : wheel < -128 ? -128 : (signed char)wheel;
                LiSendScrollEvent(part);
                wheel -= part;
            }
            s_mouse_wheel = 0;
        }
    }
}

static int classify_device(int fd, unsigned *caps_out,
                           struct input_absinfo *abs_out,
                           unsigned char *abs_valid_out) {
    unsigned long evbits[(EV_MAX + 8 * sizeof(unsigned long)) /
                         (8 * sizeof(unsigned long))] = {0};
    unsigned long keybits[(KEY_MAX + 8 * sizeof(unsigned long)) /
                          (8 * sizeof(unsigned long))] = {0};
    unsigned long relbits[(REL_MAX + 8 * sizeof(unsigned long)) /
                          (8 * sizeof(unsigned long))] = {0};
    unsigned long absbits[(ABS_MAX + 8 * sizeof(unsigned long)) /
                          (8 * sizeof(unsigned long))] = {0};
    unsigned caps = 0;
    if (ioctl(fd, EVIOCGBIT(0, sizeof(evbits)), evbits) < 0) return 0;
    if (bit_is_set(evbits, EV_KEY) &&
        ioctl(fd, EVIOCGBIT(EV_KEY, sizeof(keybits)), keybits) >= 0) {
        if (bit_is_set(keybits, KEY_A) && bit_is_set(keybits, KEY_Z) &&
            bit_is_set(keybits, KEY_ENTER))
            caps |= INPUT_CAP_KEYBOARD;
    }
    if (bit_is_set(evbits, EV_REL) &&
        ioctl(fd, EVIOCGBIT(EV_REL, sizeof(relbits)), relbits) >= 0 &&
        bit_is_set(relbits, REL_X) && bit_is_set(relbits, REL_Y) &&
        bit_is_set(keybits, BTN_LEFT))
        caps |= INPUT_CAP_MOUSE;
    if (bit_is_set(evbits, EV_ABS) &&
        ioctl(fd, EVIOCGBIT(EV_ABS, sizeof(absbits)), absbits) >= 0) {
        int has_axes = bit_is_set(absbits, ABS_X) || bit_is_set(absbits, ABS_RX) ||
                       bit_is_set(absbits, ABS_HAT0X);
        int has_buttons = bit_is_set(keybits, BTN_GAMEPAD) ||
                          bit_is_set(keybits, BTN_JOYSTICK) ||
                          bit_is_set(keybits, BTN_SOUTH);
        if (has_axes && has_buttons) caps |= INPUT_CAP_GAMEPAD;
        for (int code = 0; code <= ABS_MAX; code++) {
            if (bit_is_set(absbits, (unsigned)code) &&
                ioctl(fd, EVIOCGABS(code), &abs_out[code]) == 0)
                abs_valid_out[code] = 1;
        }
    }
    *caps_out = caps;
    return caps != 0;
}

static void *reader(void *unused) {
    (void)unused;
    while (__atomic_load_n(&s_run, __ATOMIC_ACQUIRE)) {
        int ready = poll(s_poll, (nfds_t)s_device_count, 200);
        if (ready <= 0) continue;
        for (int i = 0; i < s_device_count; i++) {
            if (s_poll[i].fd < 0) continue;
            if (s_poll[i].revents & POLLIN) {
                struct input_event events[32];
                ssize_t bytes = read(s_poll[i].fd, events, sizeof(events));
                if (bytes > 0) {
                    size_t count = (size_t)bytes / sizeof(events[0]);
                    for (size_t k = 0; k < count; k++)
                        handle_event(&s_devices[i], &events[k]);
                } else if (bytes < 0 && errno != EAGAIN && errno != EINTR) {
                    fprintf(stderr, "[input] read %s failed: errno=%d (%s)\n",
                            s_devices[i].name, errno, strerror(errno));
                }
            }
            if (s_poll[i].revents & (POLLERR | POLLHUP | POLLNVAL)) {
                fprintf(stderr, "[input] device disconnected: %s\n", s_devices[i].name);
                close(s_devices[i].fd);
                s_devices[i].fd = -1;
                s_poll[i].fd = -1;
            }
            s_poll[i].revents = 0;
        }
    }
    return NULL;
}

int input_init(void) {
    DIR *dir = opendir("/dev/input");
    if (!dir) {
        int error = errno;
        fprintf(stderr, "[input] opendir(/dev/input) failed: errno=%d (%s)\n",
                error, strerror(error));
        return -1;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL && s_device_count < MAX_DEV) {
        if (strncmp(entry->d_name, "event", 5) != 0) continue;
        char path[300];
        snprintf(path, sizeof(path), "/dev/input/%s", entry->d_name);
        int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
        if (fd < 0) {
            int error = errno;
            fprintf(stderr, "[input] open %s failed: errno=%d (%s)\n",
                    path, error, strerror(error));
            continue;
        }

        input_device candidate;
        memset(&candidate, 0, sizeof(candidate));
        candidate.fd = fd;
        if (ioctl(fd, EVIOCGNAME(sizeof(candidate.name)), candidate.name) < 0)
            snprintf(candidate.name, sizeof(candidate.name), "%s", entry->d_name);
        if (!classify_device(fd, &candidate.caps, candidate.abs,
                             candidate.abs_valid)) {
            close(fd);
            continue;
        }

        if (candidate.caps & INPUT_CAP_GAMEPAD) {
            if (s_pad_registered) {
                /* This first implementation exposes one physical controller. */
                candidate.caps &= ~INPUT_CAP_GAMEPAD;
            } else {
                int rc = LiSendControllerArrivalEvent(0, 0x1, LI_CTYPE_UNKNOWN,
                                                       gamepad_supported_buttons(), 1);
                fprintf(stderr, "[input] evdev gamepad registration: rc=%d\n", rc);
                if (rc == 0) s_pad_registered = 1;
                else candidate.caps &= ~INPUT_CAP_GAMEPAD;
            }
        }
        if (!candidate.caps) {
            close(fd);
            continue;
        }

        s_devices[s_device_count] = candidate;
        s_poll[s_device_count].fd = fd;
        s_poll[s_device_count].events = POLLIN;
        s_poll[s_device_count].revents = 0;
        s_device_count++;
        s_capabilities |= candidate.caps;
        fprintf(stderr, "[input] %s: %s (keyboard=%d mouse=%d gamepad=%d)\n",
                path, candidate.name,
                !!(candidate.caps & INPUT_CAP_KEYBOARD),
                !!(candidate.caps & INPUT_CAP_MOUSE),
                !!(candidate.caps & INPUT_CAP_GAMEPAD));
    }
    closedir(dir);

    if (!s_device_count) {
        fprintf(stderr, "[input] no supported readable evdev devices found\n");
        return -1;
    }

    __atomic_store_n(&s_run, 1, __ATOMIC_RELEASE);
    int rc = pthread_create(&s_thread, NULL, reader, NULL);
    if (rc != 0) {
        fprintf(stderr, "[input] pthread_create failed: rc=%d (%s)\n", rc, strerror(rc));
        input_shutdown();
        return -1;
    }
    s_thread_started = 1;
    fprintf(stderr, "[input] native input active: capabilities=0x%x devices=%d\n",
            s_capabilities, s_device_count);
    return 0;
}

unsigned input_get_capabilities(void) {
    return __atomic_load_n(&s_capabilities, __ATOMIC_ACQUIRE);
}

void input_shutdown(void) {
    __atomic_store_n(&s_run, 0, __ATOMIC_RELEASE);
    if (s_thread_started) {
        pthread_join(s_thread, NULL);
        s_thread_started = 0;
    }
    for (int i = 0; i < s_device_count; i++) {
        if (s_devices[i].fd >= 0) close(s_devices[i].fd);
        s_devices[i].fd = -1;
        s_poll[i].fd = -1;
    }
    s_device_count = 0;
    __atomic_store_n(&s_capabilities, 0, __ATOMIC_RELEASE);
    s_pad_registered = 0;
    s_pad_buttons = 0;
    s_lx = s_ly = s_rx = s_ry = 0;
    s_lt = s_rt = 0;
    s_modifiers = 0;
    s_suppress_stop_key = 0;
    s_mouse_dx = s_mouse_dy = s_mouse_wheel = 0;
}
