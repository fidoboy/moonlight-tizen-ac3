#ifndef ENGINE_AVOC_H
#define ENGINE_AVOC_H

#include "wmp_esplus_abi.h"

#ifdef __cplusplus
extern "C" {
#endif

void ml_avoc_set_abi_family(wmp_esplus_family_e family);
int ml_avoc_set_game_mode(int enabled);

#ifdef __cplusplus
}
#endif

#endif
