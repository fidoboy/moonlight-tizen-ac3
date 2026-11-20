#ifndef ENGINE_AVOC_H
#define ENGINE_AVOC_H

#ifdef __cplusplus
extern "C" {
#endif

int ml_avoc_set_game_mode(int enabled);

/* Separate Cloud Game Mode API; native rc and AVOC ret output are distinct. */
int ml_avoc_set_cloud_game_mode(int mode, int *ret);
int ml_avoc_get_cloud_game_mode(int *mode, int *ret);

#ifdef __cplusplus
}
#endif

#endif
