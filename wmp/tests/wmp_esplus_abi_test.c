#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../service/src/wmp_esplus_abi.h"

int main(int argc, char **argv)
{
    wmp_esplus_api_t api;
    char report[4096];
    wmp_esplus_probe_result_e result;
    const char *expected;

    if (argc != 2) {
        fprintf(stderr, "usage: %s <set|add|missing|core|ambiguous>\\n", argv[0]);
        return 2;
    }

    expected = argv[1];
    memset(&api, 0, sizeof(api));
    memset(report, 0, sizeof(report));
    result = wmp_esplus_probe(&api, report, sizeof(report));

    if (strcmp(expected, "set") == 0) {
        if (result != WMP_ESPLUS_PROBE_OK ||
            api.selected_family != WMP_ESPLUS_FAMILY_SET)
            goto fail;
    } else if (strcmp(expected, "add") == 0) {
        if (result != WMP_ESPLUS_PROBE_OK ||
            api.selected_family != WMP_ESPLUS_FAMILY_ADD)
            goto fail;
    } else if (strcmp(expected, "missing") == 0) {
        if (result != WMP_ESPLUS_PROBE_STREAM_API_MISSING ||
            api.selected_family != WMP_ESPLUS_FAMILY_NONE)
            goto fail;
    } else if (strcmp(expected, "core") == 0) {
        if (result != WMP_ESPLUS_PROBE_CORE_INCOMPLETE)
            goto fail;
    } else if (strcmp(expected, "ambiguous") == 0) {
        if (result != WMP_ESPLUS_PROBE_AMBIGUOUS ||
            api.selected_family != WMP_ESPLUS_FAMILY_NONE)
            goto fail;
    } else {
        fprintf(stderr, "unknown expected case: %s\\n", expected);
        return 2;
    }

    wmp_esplus_close(&api);
    return 0;

fail:
    fprintf(stderr, "case %s failed: result=%d family=%d\\n%s",
            expected, (int)result, (int)api.selected_family, report);
    wmp_esplus_close(&api);
    return 1;
}
