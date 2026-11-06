#include <stdbool.h>
#include <stdint.h>

#ifdef MOCK_SET
typedef void (*error_cb)(uint32_t, void *);
typedef void (*buffer_cb)(uint32_t, uint32_t, void *);
typedef void (*void_cb)(void *);
typedef void (*stream_cb)(uint32_t, void *);
typedef void (*prepared_cb)(bool, void *);

static void *s_player;
static error_cb s_error;
static buffer_cb s_buffer;
static void_cb s_conflict, s_eos, s_seek;
static stream_cb s_ready;
static prepared_cb s_prepared;
static void *s_error_data, *s_buffer_data, *s_conflict_data;
static void *s_eos_data, *s_seek_data, *s_ready_data, *s_prepared_data;
static int s_count;

static int accept_player(void *player)
{
    if (!s_player) s_player = player;
    return s_player == player;
}

int esplusplayer_set_error_cb(void *p, error_cb cb, void *data)
{ if (!accept_player(p)) return -1; s_error=cb; s_error_data=data; ++s_count; return 0; }
int esplusplayer_set_buffer_status_cb(void *p, buffer_cb cb, void *data)
{ if (!accept_player(p)) return -1; s_buffer=cb; s_buffer_data=data; ++s_count; return 0; }
int esplusplayer_set_resource_conflicted_cb(void *p, void_cb cb, void *data)
{ if (!accept_player(p)) return -1; s_conflict=cb; s_conflict_data=data; ++s_count; return 0; }
int esplusplayer_set_eos_cb(void *p, void_cb cb, void *data)
{ if (!accept_player(p)) return -1; s_eos=cb; s_eos_data=data; ++s_count; return 0; }
int esplusplayer_set_seek_done_cb(void *p, void_cb cb, void *data)
{ if (!accept_player(p)) return -1; s_seek=cb; s_seek_data=data; ++s_count; return 0; }
int esplusplayer_set_ready_to_prepare_cb(void *p, stream_cb cb, void *data)
{ if (!accept_player(p)) return -1; s_ready=cb; s_ready_data=data; ++s_count; return 0; }
int esplusplayer_set_prepare_async_done_cb(void *p, prepared_cb cb, void *data)
{ if (!accept_player(p)) return -1; s_prepared=cb; s_prepared_data=data; ++s_count; return 0; }

#elif defined(MOCK_ADD)
typedef void (*error_cb)(uint32_t);
typedef void (*buffer_cb)(uint32_t, uint32_t);
typedef void (*void_cb)(void);
typedef void (*stream_cb)(uint32_t);
typedef void (*prepared_cb)(int);

static void *s_player;
static error_cb s_error;
static buffer_cb s_buffer;
static void_cb s_conflict, s_eos, s_seek;
static stream_cb s_ready;
static prepared_cb s_prepared;
static int s_count;

static int accept_player(void *player)
{
    if (!s_player) s_player = player;
    return s_player == player;
}

void esplusplayer_set_error_cb(void *p, error_cb cb)
{ if (accept_player(p)) { s_error=cb; ++s_count; } }
void esplusplayer_set_buffer_status_cb(void *p, buffer_cb cb)
{ if (accept_player(p)) { s_buffer=cb; ++s_count; } }
void esplusplayer_set_resource_conflicted_cb(void *p, void_cb cb)
{ if (accept_player(p)) { s_conflict=cb; ++s_count; } }
void esplusplayer_set_eos_cb(void *p, void_cb cb)
{ if (accept_player(p)) { s_eos=cb; ++s_count; } }
void esplusplayer_set_seek_done_cb(void *p, void_cb cb)
{ if (accept_player(p)) { s_seek=cb; ++s_count; } }
void esplusplayer_set_ready_to_prepare_cb(void *p, stream_cb cb)
{ if (accept_player(p)) { s_ready=cb; ++s_count; } }
void esplusplayer_set_prepare_async_done_cb(void *p, prepared_cb cb)
{ if (accept_player(p)) { s_prepared=cb; ++s_count; } }
#else
#error Define MOCK_SET or MOCK_ADD
#endif

int mock_registered_count(void) { return s_count; }
int mock_player_matches(void *player) { return s_player == player; }

void mock_fire_callbacks(void)
{
#ifdef MOCK_SET
    if (s_error) s_error(0x12345678u, s_error_data);
    if (s_buffer) s_buffer(0, 1, s_buffer_data);
    if (s_conflict) s_conflict(s_conflict_data);
    if (s_eos) s_eos(s_eos_data);
    if (s_seek) s_seek(s_seek_data);
    if (s_ready) s_ready(1, s_ready_data);
    if (s_prepared) s_prepared(true, s_prepared_data);
#else
    if (s_error) s_error(0x12345678u);
    if (s_buffer) s_buffer(0, 1);
    if (s_conflict) s_conflict();
    if (s_eos) s_eos();
    if (s_seek) s_seek();
    if (s_ready) s_ready(1);
    if (s_prepared) s_prepared(1);
#endif
}

void mock_fire_unknown_values(void)
{
#ifdef MOCK_SET
    if (s_buffer) s_buffer(77, 88, s_buffer_data);
    if (s_ready) s_ready(77, s_ready_data);
    if (s_prepared) s_prepared(false, s_prepared_data);
#else
    if (s_buffer) s_buffer(77, 88);
    if (s_ready) s_ready(77);
    if (s_prepared) s_prepared(0);
#endif
}
