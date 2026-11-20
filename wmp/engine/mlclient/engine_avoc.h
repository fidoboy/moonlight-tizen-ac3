#ifndef ENGINE_AVOC_H
#define ENGINE_AVOC_H

#ifdef __cplusplus
extern "C" {
#endif

int ml_avoc_set_game_mode(int enabled);
int ml_avoc_set_cloud_game_mode(int enabled);
int ml_avoc_set_picture_mode(int display_index, int mode);

#ifdef __cplusplus
}
#endif

#endif
