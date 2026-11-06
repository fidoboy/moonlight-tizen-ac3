#include "../service/src/wmp_esplus_adapter.h"

#include <assert.h>
#include <dlfcn.h>
#include <stdio.h>
#include <string.h>

typedef void (*mock_action_fn)(void);
typedef int (*mock_count_fn)(void);
typedef int (*mock_player_fn)(void *);

typedef struct {
    int error_count, buffer_count, conflict_count, eos_count;
    int seek_count, ready_count, prepared_count;
    uint32_t error_value;
    wmp_esplus_stream_e buffer_stream, ready_stream;
    wmp_esplus_buffer_status_e buffer_status;
    bool prepared;
    void *expected_context;
} callback_state_t;

static void on_error(uint32_t value, void *context)
{
    callback_state_t *s = context;
    assert(s == s->expected_context);
    ++s->error_count;
    s->error_value = value;
}
static void on_buffer(wmp_esplus_stream_e stream,
                      wmp_esplus_buffer_status_e status, void *context)
{
    callback_state_t *s = context;
    assert(s == s->expected_context);
    ++s->buffer_count;
    s->buffer_stream = stream;
    s->buffer_status = status;
}
static void on_conflict(void *context)
{
    callback_state_t *s = context;
    assert(s == s->expected_context);
    ++s->conflict_count;
}
static void on_eos(void *context)
{
    callback_state_t *s = context;
    assert(s == s->expected_context);
    ++s->eos_count;
}
static void on_seek(void *context)
{
    callback_state_t *s = context;
    assert(s == s->expected_context);
    ++s->seek_count;
}
static void on_ready(wmp_esplus_stream_e stream, void *context)
{
    callback_state_t *s = context;
    assert(s == s->expected_context);
    ++s->ready_count;
    s->ready_stream = stream;
}
static void on_prepared(bool success, void *context)
{
    callback_state_t *s = context;
    assert(s == s->expected_context);
    ++s->prepared_count;
    s->prepared = success;
}

static void *required_symbol(void *library, const char *name)
{
    void *value = dlsym(library, name);
    assert(value != NULL);
    return value;
}

int main(int argc, char **argv)
{
    wmp_esplus_adapter_t adapter, second;
    wmp_esplus_api_t api;
    wmp_esplus_callbacks_t callbacks;
    callback_state_t state;
    int player_marker = 1, second_player_marker = 2;
    void *library;
    mock_action_fn fire, fire_unknown;
    mock_count_fn registered_count;
    mock_player_fn player_matches;
    wmp_esplus_family_e family;

    assert(argc == 3);
    if (strcmp(argv[1], "set") == 0) family = WMP_ESPLUS_FAMILY_SET;
    else if (strcmp(argv[1], "add") == 0) family = WMP_ESPLUS_FAMILY_ADD;
    else {
        fprintf(stderr, "expected set or add\n");
        return 2;
    }

    library = dlopen(argv[2], RTLD_NOW | RTLD_LOCAL);
    assert(library != NULL);
    fire = (mock_action_fn)required_symbol(library, "mock_fire_callbacks");
    fire_unknown = (mock_action_fn)required_symbol(library, "mock_fire_unknown_values");
    registered_count = (mock_count_fn)required_symbol(library, "mock_registered_count");
    player_matches = (mock_player_fn)required_symbol(library, "mock_player_matches");

    memset(&api, 0, sizeof(api));
    api.library = library;
    api.selected_family = family;
    memset(&callbacks, 0, sizeof(callbacks));
    callbacks.error = on_error;
    callbacks.buffer_status = on_buffer;
    callbacks.resource_conflicted = on_conflict;
    callbacks.eos = on_eos;
    callbacks.seek_done = on_seek;
    callbacks.ready_to_prepare = on_ready;
    callbacks.prepare_async_done = on_prepared;
    memset(&state, 0, sizeof(state));
    state.expected_context = &state;

    assert(wmp_esplus_adapter_bind(&adapter, &api, &player_marker,
                                  &callbacks, &state) == 0);
    assert(adapter.callbacks_registered == 1);
    assert(registered_count() == 7);
    assert(player_matches(&player_marker) == 1);

    if (family == WMP_ESPLUS_FAMILY_ADD) {
        /* The legacy ABI has one process-global callback context. */
        assert(wmp_esplus_adapter_bind(&second, &api, &second_player_marker,
                                      &callbacks, &state) == -1);
        wmp_esplus_adapter_unbind(&second);
    }

    fire();
    assert(state.error_count == 1 && state.error_value == 0x12345678u);
    assert(state.buffer_count == 1);
    assert(state.buffer_stream == WMP_ESPLUS_STREAM_AUDIO);
    assert(state.buffer_status == WMP_ESPLUS_BUFFER_STATUS_OVERRUN);
    assert(state.conflict_count == 1);
    assert(state.eos_count == 1);
    assert(state.seek_count == 1);
    assert(state.ready_count == 1);
    assert(state.ready_stream == WMP_ESPLUS_STREAM_VIDEO);
    assert(state.prepared_count == 1 && state.prepared);

    fire_unknown();
    assert(state.buffer_count == 2);
    assert(state.buffer_stream == WMP_ESPLUS_STREAM_UNKNOWN);
    assert(state.buffer_status == WMP_ESPLUS_BUFFER_STATUS_UNKNOWN);
    assert(state.ready_count == 2);
    assert(state.ready_stream == WMP_ESPLUS_STREAM_UNKNOWN);
    assert(state.prepared_count == 2 && !state.prepared);

    wmp_esplus_adapter_unbind(&adapter);
    assert(dlclose(library) == 0);
    printf("PASS: %s callback ABI bridge\n", argv[1]);
    return 0;
}
