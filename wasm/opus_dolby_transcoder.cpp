#include "opus_dolby_transcoder.hpp"

extern "C" {
#include "Limelight.h"
#include <libavcodec/avcodec.h>
#include <libavutil/audio_fifo.h>
#include <libavutil/channel_layout.h>
#include <libavutil/error.h>
#include <libavutil/mem.h>
#include <libavutil/samplefmt.h>
#include <libswresample/swresample.h>
}

#include <chrono>
#include <cstring>

OpusDolbyTranscoder::~OpusDolbyTranscoder() {
  Cleanup();
}

bool OpusDolbyTranscoder::Initialize(
  const void* opusConfiguration,
  int outputChannels,
  bool useBackSurround,
  bool eac3
) {
  Cleanup();

  const auto* opusConfig =
    static_cast<const OPUS_MULTISTREAM_CONFIGURATION*>(opusConfiguration);
  if (opusConfig == nullptr ||
      (opusConfig->channelCount != 2 && opusConfig->channelCount != 6) ||
      opusConfig->channelCount != outputChannels ||
      (outputChannels != 2 && outputChannels != 6) ||
      opusConfig->streams <= 0 ||
      opusConfig->coupledStreams < 0 ||
      opusConfig->coupledStreams > opusConfig->streams ||
      opusConfig->streams + opusConfig->coupledStreams > 255) {
    return false;
  }

  m_Channels = outputChannels;
  m_ChannelLayout = outputChannels == 2
    ? AV_CH_LAYOUT_STEREO
    : (useBackSurround ? AV_CH_LAYOUT_5POINT1_BACK : AV_CH_LAYOUT_5POINT1);

  const AVCodec* decoder = avcodec_find_decoder(AV_CODEC_ID_OPUS);
  const AVCodec* encoder = avcodec_find_encoder(eac3 ? AV_CODEC_ID_EAC3 : AV_CODEC_ID_AC3);
  if (decoder == nullptr || encoder == nullptr) {
    Cleanup();
    return false;
  }

  m_DecoderContext = avcodec_alloc_context3(decoder);
  m_DecodedFrame = av_frame_alloc();
  if (m_DecoderContext == nullptr || m_DecodedFrame == nullptr) {
    Cleanup();
    return false;
  }

  // FFmpeg's Opus decoder needs an OpusHead for multistream input. Mapping family 255
  // preserves Moonlight's already-normalized channel order without a second reordering.
  const int extradataSize = outputChannels == 2 ? 19 : 21 + outputChannels;
  m_DecoderContext->extradata = static_cast<uint8_t*>(
    av_mallocz(static_cast<size_t>(extradataSize) + AV_INPUT_BUFFER_PADDING_SIZE));
  if (m_DecoderContext->extradata == nullptr) {
    Cleanup();
    return false;
  }
  m_DecoderContext->extradata_size = extradataSize;
  uint8_t* head = m_DecoderContext->extradata;
  std::memcpy(head, "OpusHead", 8);
  head[8] = 1;
  head[9] = static_cast<uint8_t>(opusConfig->channelCount);
  head[10] = 0; // Pre-skip: RTP packets begin at the decoded stream start.
  head[11] = 0;
  head[12] = 0x80; // 48000 Hz, little-endian input sample rate.
  head[13] = 0xBB;
  head[14] = 0;
  head[15] = 0;
  head[16] = 0; // Output gain.
  head[17] = 0;
  head[18] = outputChannels == 2 ? 0 : 255;
  if (outputChannels > 2) {
    head[19] = static_cast<uint8_t>(opusConfig->streams);
    head[20] = static_cast<uint8_t>(opusConfig->coupledStreams);
    for (int i = 0; i < outputChannels; ++i) {
      head[21 + i] = opusConfig->mapping[i];
    }
  }

  m_DecoderContext->thread_count = 1;
  m_DecoderContext->sample_rate = 48000;
  if (avcodec_open2(m_DecoderContext, decoder, nullptr) < 0) {
    Cleanup();
    return false;
  }

  if (outputChannels == 6 && m_ChannelLayout != AV_CH_LAYOUT_5POINT1_BACK) {
    m_Resampler = swr_alloc_set_opts(
      nullptr,
      static_cast<int64_t>(m_ChannelLayout), AV_SAMPLE_FMT_FLTP, 48000,
      AV_CH_LAYOUT_5POINT1_BACK, AV_SAMPLE_FMT_FLTP, 48000,
      0, nullptr);
    if (m_Resampler == nullptr || swr_init(m_Resampler) < 0) {
      Cleanup();
      return false;
    }
  }

  m_EncoderContext = avcodec_alloc_context3(encoder);
  m_EncodeFrame = av_frame_alloc();
  m_ResampledFrame = m_Resampler != nullptr ? av_frame_alloc() : nullptr;
  m_EncodedPacket = av_packet_alloc();
  if (m_EncoderContext == nullptr || m_EncodeFrame == nullptr ||
      (m_Resampler != nullptr && m_ResampledFrame == nullptr) ||
      m_EncodedPacket == nullptr) {
    Cleanup();
    return false;
  }

  m_EncoderContext->sample_fmt = AV_SAMPLE_FMT_FLTP;
  m_EncoderContext->sample_rate = 48000;
  m_EncoderContext->channel_layout = m_ChannelLayout;
  m_EncoderContext->channels = outputChannels;
  m_EncoderContext->time_base = AVRational{1, 48000};
  m_EncoderContext->bit_rate = outputChannels == 2 ? 192000 : 448000;
  m_EncoderContext->thread_count = 1;
  if (avcodec_open2(m_EncoderContext, encoder, nullptr) < 0 ||
      m_EncoderContext->frame_size <= 0) {
    Cleanup();
    return false;
  }

  m_AudioFifo = av_audio_fifo_alloc(
    m_EncoderContext->sample_fmt,
    outputChannels,
    m_EncoderContext->frame_size * 2);
  if (m_AudioFifo == nullptr) {
    Cleanup();
    return false;
  }

  m_NextEncoderPts = 0;
  return true;
}

bool OpusDolbyTranscoder::Transcode(
  const uint8_t* data,
  int size,
  std::vector<std::vector<uint8_t>>& encodedPackets
) {
  encodedPackets.clear();
  const auto processingStart = std::chrono::steady_clock::now();
  if (m_DecoderContext == nullptr || m_EncoderContext == nullptr ||
      m_DecodedFrame == nullptr || m_AudioFifo == nullptr ||
      data == nullptr || size <= 0) {
    return false;
  }

  AVPacket inputPacket;
  av_init_packet(&inputPacket);
  inputPacket.data = nullptr;
  inputPacket.size = 0;
  if (av_new_packet(&inputPacket, size) < 0) {
    return false;
  }
  std::memcpy(inputPacket.data, data, static_cast<size_t>(size));

  const int sendResult = avcodec_send_packet(m_DecoderContext, &inputPacket);
  av_packet_unref(&inputPacket);
  if (sendResult < 0) {
    return false;
  }

  while (true) {
    const int receiveResult = avcodec_receive_frame(m_DecoderContext, m_DecodedFrame);
    if (receiveResult == AVERROR(EAGAIN) || receiveResult == AVERROR_EOF) {
      break;
    }
    if (receiveResult < 0 ||
        m_DecodedFrame->format != AV_SAMPLE_FMT_FLTP ||
        m_DecodedFrame->channels != m_Channels ||
        m_DecodedFrame->sample_rate != 48000 ||
        m_DecodedFrame->nb_samples <= 0) {
      av_frame_unref(m_DecodedFrame);
      return false;
    }

    // Mapping family 255 preserves Moonlight's Opus channel order. Its 5.1 mapping
    // is back-surround ordered; swresample remaps it when the selected Dolby layout
    // requests conventional side-surround channels.
    const uint64_t inputLayout = m_Channels == 6
      ? AV_CH_LAYOUT_5POINT1_BACK
      : AV_CH_LAYOUT_STEREO;
    m_DecodedFrame->channel_layout = inputLayout;

    AVFrame* fifoFrame = m_DecodedFrame;
    if (m_Resampler != nullptr) {
      const int maximumSamples = swr_get_out_samples(m_Resampler, m_DecodedFrame->nb_samples);
      if (maximumSamples <= 0) {
        av_frame_unref(m_DecodedFrame);
        return false;
      }
      av_frame_unref(m_ResampledFrame);
      m_ResampledFrame->format = AV_SAMPLE_FMT_FLTP;
      m_ResampledFrame->sample_rate = 48000;
      m_ResampledFrame->channel_layout = m_ChannelLayout;
      m_ResampledFrame->channels = m_Channels;
      m_ResampledFrame->nb_samples = maximumSamples;
      if (av_frame_get_buffer(m_ResampledFrame, 0) < 0) {
        av_frame_unref(m_DecodedFrame);
        return false;
      }
      const int convertedSamples = swr_convert(
        m_ResampledFrame->extended_data,
        maximumSamples,
        const_cast<const uint8_t**>(m_DecodedFrame->extended_data),
        m_DecodedFrame->nb_samples);
      if (convertedSamples <= 0) {
        av_frame_unref(m_ResampledFrame);
        av_frame_unref(m_DecodedFrame);
        return false;
      }
      m_ResampledFrame->nb_samples = convertedSamples;
      fifoFrame = m_ResampledFrame;
    }

    if (av_audio_fifo_realloc(
          m_AudioFifo,
          av_audio_fifo_size(m_AudioFifo) + fifoFrame->nb_samples) < 0 ||
        av_audio_fifo_write(
          m_AudioFifo,
          reinterpret_cast<void**>(fifoFrame->extended_data),
          fifoFrame->nb_samples) != fifoFrame->nb_samples) {
      if (fifoFrame == m_ResampledFrame) {
        av_frame_unref(m_ResampledFrame);
      }
      av_frame_unref(m_DecodedFrame);
      return false;
    }
    if (fifoFrame == m_ResampledFrame) {
      av_frame_unref(m_ResampledFrame);
    }
    av_frame_unref(m_DecodedFrame);
  }

  while (av_audio_fifo_size(m_AudioFifo) >= m_EncoderContext->frame_size) {
    av_frame_unref(m_EncodeFrame);
    m_EncodeFrame->format = m_EncoderContext->sample_fmt;
    m_EncodeFrame->sample_rate = m_EncoderContext->sample_rate;
    m_EncodeFrame->channel_layout = m_ChannelLayout;
    m_EncodeFrame->channels = m_Channels;
    m_EncodeFrame->nb_samples = m_EncoderContext->frame_size;
    m_EncodeFrame->pts = m_NextEncoderPts;
    if (av_frame_get_buffer(m_EncodeFrame, 0) < 0 ||
        av_audio_fifo_read(
          m_AudioFifo,
          reinterpret_cast<void**>(m_EncodeFrame->extended_data),
          m_EncodeFrame->nb_samples) != m_EncodeFrame->nb_samples) {
      return false;
    }

    const int encodeResult = avcodec_send_frame(m_EncoderContext, m_EncodeFrame);
    if (encodeResult < 0) {
      return false;
    }
    m_NextEncoderPts += m_EncodeFrame->nb_samples;

    if (!DrainEncoder(encodedPackets)) {
      return false;
    }
  }

  const auto processingElapsed = std::chrono::steady_clock::now() - processingStart;
  m_ProcessingTimeNs.fetch_add(
    static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(processingElapsed).count()),
    std::memory_order_relaxed);
  m_ProcessedPackets.fetch_add(1, std::memory_order_relaxed);
  return true;
}

double OpusDolbyTranscoder::GetAverageProcessingLatencyMs() const {
  const uint64_t packetCount = m_ProcessedPackets.load(std::memory_order_relaxed);
  if (packetCount == 0) {
    return 0.0;
  }
  const uint64_t totalNs = m_ProcessingTimeNs.load(std::memory_order_relaxed);
  return static_cast<double>(totalNs) / static_cast<double>(packetCount) / 1000000.0;
}

bool OpusDolbyTranscoder::DrainEncoder(
  std::vector<std::vector<uint8_t>>& encodedPackets
) {
  while (true) {
    const int result = avcodec_receive_packet(m_EncoderContext, m_EncodedPacket);
    if (result == AVERROR(EAGAIN) || result == AVERROR_EOF) {
      return true;
    }
    if (result < 0 || m_EncodedPacket->size <= 0) {
      av_packet_unref(m_EncodedPacket);
      return false;
    }

    encodedPackets.emplace_back(
      m_EncodedPacket->data,
      m_EncodedPacket->data + m_EncodedPacket->size);
    av_packet_unref(m_EncodedPacket);
  }
}

void OpusDolbyTranscoder::Cleanup() {
  av_audio_fifo_free(m_AudioFifo);
  m_AudioFifo = nullptr;
  swr_free(&m_Resampler);
  av_packet_free(&m_EncodedPacket);
  av_frame_free(&m_EncodeFrame);
  av_frame_free(&m_ResampledFrame);
  av_frame_free(&m_DecodedFrame);
  avcodec_free_context(&m_EncoderContext);
  avcodec_free_context(&m_DecoderContext);
  m_ChannelLayout = 0;
  m_Channels = 0;
  m_NextEncoderPts = 0;
  m_ProcessingTimeNs.store(0, std::memory_order_relaxed);
  m_ProcessedPackets.store(0, std::memory_order_relaxed);
}
