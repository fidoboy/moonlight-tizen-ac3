#ifndef OPUS_EAC3_TRANSCODER_H
#define OPUS_EAC3_TRANSCODER_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
int opus_eac3_transcoder_init(const void *opus_configuration, int channels);
int opus_eac3_transcoder_process(const uint8_t *data, int size,
    const uint8_t **packet_data, int *packet_sizes,
    int packet_capacity, int *packet_count);
int opus_eac3_transcoder_frame_samples(void);
uint32_t opus_eac3_transcoder_average_latency_us(void);
void opus_eac3_transcoder_cleanup(void);
#ifdef __cplusplus
}
#endif
#endif
