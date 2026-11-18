#include "dolby_decoder.hpp"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/channel_layout.h>
#include <libavutil/error.h>
#include <libavutil/samplefmt.h>
#include <libswresample/swresample.h>
}

#include <algorithm>
#include <cerrno>
#include <cstring>

DolbySoftwareDecoder::~DolbySoftwareDecoder() {
  Cleanup();
}

bool DolbySoftwareDecoder::Initialize(bool eac3, int outputChannels, bool useBackSurround) {
  Cleanup();

  if (outputChannels != 2 && outputChannels != 6 && outputChannels != 8) {
    return false;
  }

  const AVCodecID codecId = eac3 ? AV_CODEC_ID_EAC3 : AV_CODEC_ID_AC3;
  const AVCodec* codec = avcodec_find_decoder(codecId);
  if (codec == nullptr) {
    return false;
  }

  m_CodecContext = avcodec_alloc_context3(codec);
  m_Frame = av_frame_alloc();
  if (m_CodecContext == nullptr || m_Frame == nullptr) {
    Cleanup();
    return false;
  }

  // Keep decoding on the existing audio receive thread. This is a manual fallback path,
  // not a latency-sensitive hardware replacement.
  m_CodecContext->thread_count = 1;
  m_CodecContext->sample_rate = 48000;
  if (avcodec_open2(m_CodecContext, codec, nullptr) < 0) {
    Cleanup();
    return false;
  }

  m_OutputChannels = outputChannels;
  switch (outputChannels) {
    case 2:
      m_OutputChannelLayout = AV_CH_LAYOUT_STEREO;
      break;
    case 6:
      m_OutputChannelLayout = useBackSurround
        ? AV_CH_LAYOUT_5POINT1_BACK
        : AV_CH_LAYOUT_5POINT1;
      break;
    case 8:
      m_OutputChannelLayout = AV_CH_LAYOUT_7POINT1;
      break;
  }

  return true;
}

bool DolbySoftwareDecoder::ConfigureResampler(const AVFrame* frame) {
  const int sampleRate = frame->sample_rate > 0
    ? frame->sample_rate
    : m_CodecContext->sample_rate;
  const uint64_t channelLayout = frame->channel_layout != 0
    ? frame->channel_layout
    : av_get_default_channel_layout(frame->channels);

  if (sampleRate <= 0 || frame->channels <= 0 || channelLayout == 0) {
    return false;
  }

  const auto sampleFormat = static_cast<AVSampleFormat>(frame->format);
  if (m_Resampler != nullptr &&
      m_InputChannels == frame->channels &&
      m_InputSampleRate == sampleRate &&
      m_InputSampleFormat == frame->format &&
      m_InputChannelLayout == channelLayout) {
    return true;
  }

  swr_free(&m_Resampler);
  m_Resampler = swr_alloc_set_opts(
    nullptr,
    static_cast<int64_t>(m_OutputChannelLayout),
    AV_SAMPLE_FMT_S16,
    48000,
    static_cast<int64_t>(channelLayout),
    sampleFormat,
    sampleRate,
    0,
    nullptr
  );
  if (m_Resampler == nullptr || swr_init(m_Resampler) < 0) {
    swr_free(&m_Resampler);
    return false;
  }

  m_InputChannels = frame->channels;
  m_InputSampleRate = sampleRate;
  m_InputSampleFormat = frame->format;
  m_InputChannelLayout = channelLayout;
  return true;
}

bool DolbySoftwareDecoder::Decode(
  const uint8_t* data,
  int size,
  std::vector<int16_t>& pcm,
  int& samplesPerChannel
) {
  pcm.clear();
  samplesPerChannel = 0;
  if (m_CodecContext == nullptr || m_Frame == nullptr || data == nullptr || size <= 0) {
    return false;
  }

  AVPacket packet;
  av_init_packet(&packet);
  packet.data = nullptr;
  packet.size = 0;
  if (av_new_packet(&packet, size) < 0) {
    return false;
  }
  std::memcpy(packet.data, data, static_cast<size_t>(size));

  const int sendResult = avcodec_send_packet(m_CodecContext, &packet);
  av_packet_unref(&packet);
  if (sendResult < 0) {
    return false;
  }

  while (true) {
    const int receiveResult = avcodec_receive_frame(m_CodecContext, m_Frame);
    if (receiveResult == AVERROR(EAGAIN) || receiveResult == AVERROR_EOF) {
      break;
    }
    if (receiveResult < 0 || !ConfigureResampler(m_Frame)) {
      av_frame_unref(m_Frame);
      return false;
    }

    const int maximumSamples = swr_get_out_samples(m_Resampler, m_Frame->nb_samples);
    if (maximumSamples < 0) {
      av_frame_unref(m_Frame);
      return false;
    }

    const size_t oldSize = pcm.size();
    pcm.resize(oldSize + static_cast<size_t>(maximumSamples) * m_OutputChannels);
    uint8_t* output[] = {
      reinterpret_cast<uint8_t*>(pcm.data() + oldSize)
    };
    const int convertedSamples = swr_convert(
      m_Resampler,
      output,
      maximumSamples,
      const_cast<const uint8_t**>(m_Frame->extended_data),
      m_Frame->nb_samples
    );
    av_frame_unref(m_Frame);

    if (convertedSamples < 0) {
      pcm.resize(oldSize);
      return false;
    }

    pcm.resize(oldSize + static_cast<size_t>(convertedSamples) * m_OutputChannels);
    samplesPerChannel += convertedSamples;
  }

  return samplesPerChannel > 0;
}

void DolbySoftwareDecoder::Cleanup() {
  swr_free(&m_Resampler);
  av_frame_free(&m_Frame);
  avcodec_free_context(&m_CodecContext);
  m_OutputChannels = 0;
  m_InputChannels = 0;
  m_InputSampleRate = 0;
  m_InputSampleFormat = -1;
  m_InputChannelLayout = 0;
  m_OutputChannelLayout = 0;
}
