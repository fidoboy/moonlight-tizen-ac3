#ifndef ESPLUS_PLAYER_H
#define ESPLUS_PLAYER_H

#include "wmp_esplus_adapter.h"

int esplus_create_open(void);
int esplus_set_video_info(const wmp_esplus_video_info_t *info);
int esplus_set_audio_info(const wmp_esplus_audio_info_t *info);
int esplus_set_window(int width, int height);
int esplus_prepare(void);
void esplus_set_audio_enabled(int enabled);
void esplus_audio_registration_complete(int success);
wmp_esplus_submit_result_t esplus_submit(const wmp_esplus_packet_t *packet);
/* 1 after ESPlus start succeeds and at least one video packet is accepted. */
int esplus_video_ready(void);
void esplus_close(void);

#endif
