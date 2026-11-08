#define _GNU_SOURCE
#include <arpa/inet.h>
#include <app_control.h>
#include <dlog.h>
#include <dlfcn.h>
#include <pthread.h>
#include <service_app.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#undef LOG_TAG
#define LOG_TAG "MoonlightAmbilight"

#define CAPTURE_LIBRARY "libvideo-capture.so.0.1.0"
#define CAPTURE_SYMBOL "secvideo_api_capture_video_main"
#define CAPTURE_WIDTH 960
#define CAPTURE_HEIGHT 540
#define Y_BYTES (CAPTURE_WIDTH * CAPTURE_HEIGHT)
#define UV_BYTES (Y_BYTES / 2)
#define PARAM_BYTES 256
#define DEFAULT_WLED_PORT 21324
#define DEFAULT_LED_COUNT 73
#define MAX_LED_COUNT 490
#define FRAME_INTERVAL_NS 40000000L
#define DRGB_PROTOCOL 0x02
#define DRGB_TIMEOUT 1

typedef int (*capture_video_main_fn)(int, int, void *);

typedef struct {
    void *library;
    capture_video_main_fn capture;
    uint8_t *params;
    uint8_t *y_plane;
    uint8_t *uv_plane;
} capture_context_t;

static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_t g_worker;
static bool g_worker_started = false;
static atomic_bool g_stop = ATOMIC_VAR_INIT(true);
static char g_wled_ip[INET_ADDRSTRLEN];
static int g_wled_port = DEFAULT_WLED_PORT;
static int g_led_count = DEFAULT_LED_COUNT;

static void log_error(const char *stage, int code)
{
    dlog_print(DLOG_ERROR, LOG_TAG, "%s failed (%d)", stage, code);
}

static int read_i32(const uint8_t *buffer, size_t offset)
{
    int32_t value = 0;
    memcpy(&value, buffer + offset, sizeof(value));
    return value;
}

static void write_u32(uint8_t *buffer, size_t offset, uint32_t value)
{
    memcpy(buffer + offset, &value, sizeof(value));
}

static bool capture_init(capture_context_t *ctx)
{
    memset(ctx, 0, sizeof(*ctx));

    ctx->library = dlopen(CAPTURE_LIBRARY, RTLD_NOW | RTLD_LOCAL);
    if (ctx->library == NULL)
        ctx->library = dlopen("/usr/lib/" CAPTURE_LIBRARY, RTLD_NOW | RTLD_LOCAL);
    if (ctx->library == NULL) {
        const char *error = dlerror();
        dlog_print(DLOG_ERROR, LOG_TAG, "dlopen %s: %s", CAPTURE_LIBRARY,
                   error != NULL ? error : "unknown error");
        return false;
    }

    ctx->capture = (capture_video_main_fn)dlsym(ctx->library, CAPTURE_SYMBOL);
    if (ctx->capture == NULL) {
        const char *error = dlerror();
        dlog_print(DLOG_ERROR, LOG_TAG, "dlsym %s: %s", CAPTURE_SYMBOL,
                   error != NULL ? error : "unknown error");
        dlclose(ctx->library);
        memset(ctx, 0, sizeof(*ctx));
        return false;
    }

    /* Samsung's secvideo_capture_param ABI stores 32-bit pointers at +0x10/+0x14. */
    if (sizeof(void *) != 4) {
        dlog_print(DLOG_ERROR, LOG_TAG, "Capture ABI requires a 32-bit TV process");
        dlclose(ctx->library);
        memset(ctx, 0, sizeof(*ctx));
        return false;
    }

    ctx->params = calloc(1, PARAM_BYTES);
    ctx->y_plane = malloc(Y_BYTES);
    ctx->uv_plane = malloc(UV_BYTES);
    if (ctx->params == NULL || ctx->y_plane == NULL || ctx->uv_plane == NULL) {
        dlog_print(DLOG_ERROR, LOG_TAG, "Capture buffer allocation failed");
        free(ctx->params);
        free(ctx->y_plane);
        free(ctx->uv_plane);
        dlclose(ctx->library);
        memset(ctx, 0, sizeof(*ctx));
        return false;
    }

    write_u32(ctx->params, 0x00, Y_BYTES);
    write_u32(ctx->params, 0x04, UV_BYTES);
    write_u32(ctx->params, 0x10, (uint32_t)(uintptr_t)ctx->y_plane);
    write_u32(ctx->params, 0x14, (uint32_t)(uintptr_t)ctx->uv_plane);
    write_u32(ctx->params, 0x1c, 0); /* Keep the verified Samsung default format. */
    return true;
}

static void capture_destroy(capture_context_t *ctx)
{
    free(ctx->params);
    free(ctx->y_plane);
    free(ctx->uv_plane);
    if (ctx->library != NULL)
        dlclose(ctx->library);
    memset(ctx, 0, sizeof(*ctx));
}

static uint8_t clamp_byte(int value)
{
    if (value < 0) return 0;
    if (value > 255) return 255;
    return (uint8_t)value;
}

static int average_luma(const uint8_t *plane, int x, int y, int width,
                        int height, int stride)
{
    int sum = 0;
    int count = 0;
    int left = x > 5 ? x - 5 : 0;
    int right = x + 5 < width ? x + 5 : width - 1;
    int top = y > 5 ? y - 5 : 0;
    int bottom = y + 5 < height ? y + 5 : height - 1;

    for (int row = top; row <= bottom; row += 2) {
        for (int col = left; col <= right; col += 2) {
            sum += plane[(size_t)row * (size_t)stride + (size_t)col];
            count++;
        }
    }
    return count == 0 ? 16 : sum / count;
}

static void perimeter_point(int led, int led_count, int width, int height,
                            int *out_x, int *out_y)
{
    double t = led_count <= 1 ? 0.0 : (double)led / (double)led_count;
    double p = t * 2.0 * (double)(width + height);
    int x, y;

    if (p < width) {
        x = (int)p; y = 0;
    } else if ((p -= width) < height) {
        x = width - 1; y = (int)p;
    } else if ((p -= height) < width) {
        x = width - 1 - (int)p; y = height - 1;
    } else {
        p -= width; x = 0; y = height - 1 - (int)p;
    }

    if (x < 0) x = 0;
    if (x >= width) x = width - 1;
    if (y < 0) y = 0;
    if (y >= height) y = height - 1;
    *out_x = x;
    *out_y = y;
}

static void yuv_to_rgb(int y, int u, int v, uint8_t *r, uint8_t *g, uint8_t *b)
{
    int c = y - 16;
    int d = u - 128;
    int e = v - 128;
    *r = clamp_byte((298 * c + 409 * e + 128) >> 8);
    *g = clamp_byte((298 * c - 100 * d - 208 * e + 128) >> 8);
    *b = clamp_byte((298 * c + 516 * d + 128) >> 8);
}

static size_t build_drgb_frame(const capture_context_t *ctx, int width,
                               int height, int y_stride, int uv_stride,
                               int led_count, uint8_t *packet)
{
    packet[0] = DRGB_PROTOCOL;
    packet[1] = DRGB_TIMEOUT;

    for (int led = 0; led < led_count; led++) {
        int x, y;
        perimeter_point(led, led_count, width, height, &x, &y);

        int yy = average_luma(ctx->y_plane, x, y, width, height, y_stride);
        size_t uv_index = (size_t)(y / 2) * (size_t)uv_stride + (size_t)(x & ~1);
        if (uv_index + 1 >= UV_BYTES)
            uv_index = 0;

        uint8_t r, g, b;
        yuv_to_rgb(yy, ctx->uv_plane[uv_index], ctx->uv_plane[uv_index + 1],
                   &r, &g, &b);
        size_t offset = 2u + (size_t)led * 3u;
        packet[offset] = r;
        packet[offset + 1] = g;
        packet[offset + 2] = b;
    }

    return 2u + (size_t)led_count * 3u;
}

static void *capture_worker(void *unused)
{
    (void)unused;
    capture_context_t capture;
    int socket_fd = -1;
    struct sockaddr_in destination;
    uint8_t *packet = NULL;

    if (!capture_init(&capture))
        return NULL;

    socket_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (socket_fd < 0) {
        log_error("WLED UDP socket", socket_fd);
        capture_destroy(&capture);
        return NULL;
    }

    memset(&destination, 0, sizeof(destination));
    destination.sin_family = AF_INET;
    destination.sin_port = htons((uint16_t)g_wled_port);
    if (inet_pton(AF_INET, g_wled_ip, &destination.sin_addr) != 1) {
        dlog_print(DLOG_ERROR, LOG_TAG, "Invalid WLED IPv4 address");
        close(socket_fd);
        capture_destroy(&capture);
        return NULL;
    }

    packet = malloc(2u + (size_t)g_led_count * 3u);
    if (packet == NULL) {
        close(socket_fd);
        capture_destroy(&capture);
        return NULL;
    }

    dlog_print(DLOG_INFO, LOG_TAG, "Capture started; WLED=%s:%d LEDs=%d",
               g_wled_ip, g_wled_port, g_led_count);

    while (!atomic_load(&g_stop)) {
        int rc = capture.capture(CAPTURE_WIDTH, CAPTURE_HEIGHT, capture.params);
        if (rc == 0) {
            int width = read_i32(capture.params, 0x08);
            int height = read_i32(capture.params, 0x0c);
            int y_pitch = read_i32(capture.params, 0x2c);
            int uv_pitch = read_i32(capture.params, 0x30);

            if (width < 64 || width > CAPTURE_WIDTH) width = CAPTURE_WIDTH;
            if (height < 64 || height > CAPTURE_HEIGHT) height = CAPTURE_HEIGHT;
            if (y_pitch < width || y_pitch > CAPTURE_WIDTH) y_pitch = width;
            if (uv_pitch < width || uv_pitch > CAPTURE_WIDTH) uv_pitch = width;

            size_t length = build_drgb_frame(&capture, width, height, y_pitch,
                                             uv_pitch, g_led_count, packet);
            ssize_t sent = sendto(socket_fd, packet, length, 0,
                                  (struct sockaddr *)&destination,
                                  sizeof(destination));
            if (sent < 0)
                dlog_print(DLOG_WARN, LOG_TAG, "WLED UDP send failed");
        }

        struct timespec delay = {0, FRAME_INTERVAL_NS};
        nanosleep(&delay, NULL);
    }

    dlog_print(DLOG_INFO, LOG_TAG, "Capture stopped");
    free(packet);
    close(socket_fd);
    capture_destroy(&capture);
    return NULL;
}

static void stop_capture_locked(void)
{
    if (!g_worker_started)
        return;

    atomic_store(&g_stop, true);
    pthread_join(g_worker, NULL);
    g_worker_started = false;
}

static bool start_capture(const char *ip, int port, int led_count)
{
    struct in_addr parsed;

    if (ip == NULL || inet_pton(AF_INET, ip, &parsed) != 1)
        return false;
    if (port < 1 || port > 65535)
        port = DEFAULT_WLED_PORT;
    if (led_count < 1)
        led_count = 1;
    if (led_count > MAX_LED_COUNT)
        led_count = MAX_LED_COUNT;

    pthread_mutex_lock(&g_lock);
    stop_capture_locked();

    snprintf(g_wled_ip, sizeof(g_wled_ip), "%s", ip);
    g_wled_port = port;
    g_led_count = led_count;
    atomic_store(&g_stop, false);

    int rc = pthread_create(&g_worker, NULL, capture_worker, NULL);
    if (rc == 0)
        g_worker_started = true;
    else {
        atomic_store(&g_stop, true);
        log_error("pthread_create", rc);
    }
    pthread_mutex_unlock(&g_lock);
    return rc == 0;
}

static void stop_capture(void)
{
    pthread_mutex_lock(&g_lock);
    stop_capture_locked();
    pthread_mutex_unlock(&g_lock);
}

static char *get_extra(app_control_h control, const char *key)
{
    char *value = NULL;
    if (app_control_get_extra_data(control, key, &value) != APP_CONTROL_ERROR_NONE)
        return NULL;
    return value;
}

static int parse_int(const char *value, int fallback)
{
    char *end = NULL;
    long parsed;
    if (value == NULL || *value == '\0')
        return fallback;
    parsed = strtol(value, &end, 10);
    if (end == value || *end != '\0' || parsed < 1 || parsed > 65535)
        return fallback;
    return (int)parsed;
}

static bool service_create(void *user_data)
{
    (void)user_data;
    dlog_print(DLOG_INFO, LOG_TAG, "Moonlight Ambilight service ready");
    return true;
}

static void service_control(app_control_h control, void *user_data)
{
    char *command = NULL;
    char *ip = NULL;
    char *port_text = NULL;
    char *led_text = NULL;

    (void)user_data;
    if (control == NULL)
        return;

    command = get_extra(control, "command");
    if (command != NULL && strcmp(command, "start") == 0) {
        ip = get_extra(control, "wledIp");
        port_text = get_extra(control, "wledPort");
        led_text = get_extra(control, "ledCount");

        if (!start_capture(ip, parse_int(port_text, DEFAULT_WLED_PORT),
                           parse_int(led_text, DEFAULT_LED_COUNT))) {
            dlog_print(DLOG_ERROR, LOG_TAG, "Could not start Ambilight capture");
        }
    } else if (command != NULL && strcmp(command, "stop") == 0) {
        stop_capture();
    } else {
        dlog_print(DLOG_WARN, LOG_TAG, "Ignored unknown AppControl command");
    }

    free(command);
    free(ip);
    free(port_text);
    free(led_text);
}

static void service_terminate(void *user_data)
{
    (void)user_data;
    stop_capture();
    dlog_print(DLOG_INFO, LOG_TAG, "Moonlight Ambilight service terminated");
}

int main(int argc, char *argv[])
{
    service_app_lifecycle_callback_s callbacks;
    memset(&callbacks, 0, sizeof(callbacks));
    callbacks.create = service_create;
    callbacks.terminate = service_terminate;
    callbacks.app_control = service_control;
    return service_app_main(argc, argv, &callbacks, NULL);
}
