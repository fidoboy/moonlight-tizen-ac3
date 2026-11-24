#ifndef ENGINE_AVOC_H
#define ENGINE_AVOC_H

#ifdef __cplusplus
extern "C" {
#endif

int ml_avoc_set_game_mode_with_retry(int save_type, int on, int max_retries);
int ml_avoc_force_game_mode_off(int max_retries);

/*
 * Cloud Game Mode and standalone Picture Mode wrappers are retained as
 * commented reference implementations in engine_avoc.c. They are not part
 * of the active API and are deliberately not declared here.
 */

#ifdef __cplusplus
}
#endif

#endif
