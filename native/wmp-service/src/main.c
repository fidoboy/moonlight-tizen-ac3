#include <dlog.h>
#include <service_app.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "wmp_esplus_abi.h"

#define LOG_TAG "MoonlightWmp"

static wmp_esplus_api_t g_esplus;

static bool service_create(void *data)
{
    char report[2048];
    wmp_esplus_probe_result_e result;

    (void)data;
    memset(&g_esplus, 0, sizeof(g_esplus));
    memset(report, 0, sizeof(report));

    result = wmp_esplus_probe(&g_esplus, report, sizeof(report));
    dlog_print(DLOG_INFO, LOG_TAG, "WMP native service started");
    dlog_print(DLOG_INFO, LOG_TAG, "ESPlus probe result=%d", (int)result);
    dlog_print(DLOG_INFO, LOG_TAG, "%s", report);

    /*
     * The service remains alive even if ESPlus is unavailable. The Web app
     * must be able to report the experimental engine as unavailable without
     * affecting the independent EMSS path.
     */
    return true;
}

static void service_control(app_control_h app_control, void *data)
{
    (void)app_control;
    (void)data;
    dlog_print(DLOG_INFO, LOG_TAG,
               "Service control request received; command transport is not enabled yet");
}

static void service_terminate(void *data)
{
    (void)data;
    wmp_esplus_close(&g_esplus);
    dlog_print(DLOG_INFO, LOG_TAG, "WMP native service terminated");
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
