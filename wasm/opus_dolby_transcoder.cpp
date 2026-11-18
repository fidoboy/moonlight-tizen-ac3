#include "opus_dolby_transcoder.hpp"

extern "C" {
#include "Limelight.h"
#include <libavcodec/avcodec.h>
#include <libavutil/audio_fifo.h>
#include <libavutil/channel_layout.h>
#include <libavutil/error.h>
#include <libavutil/mem.h>
#include <libavutil/samplefmt.h>
}

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

  m_EncoderContext = avcodec_alloc_context3(encoder);
  m_EncodeFrame = av_frame_alloc();
  m_EncodedPacket = av_packet_alloc();
  if (m_EncoderContext == nullptr || m_EncodeFrame == nullptr ||
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

    // Mapping family 255 intentionally leaves the layout unspecified in FFmpeg.
    // The OpusHead mapping above is already in this exact encoder channel order.
    m_DecodedFrame->channel_layout = m_ChannelLayout;
    if (av_audio_fifo_realloc(
          m_AudioFifo,
          av_audio_fifo_size(m_AudioFifo) + m_DecodedFrame->nb_samples) < 0 ||
        av_audio_fifo_write(
          m_AudioFifo,
          reinterpret_cast<void**>(m_DecodedFrame->extended_data),
          m_DecodedFrame->nb_samples) != m_DecodedFrame->nb_samples) {
      av_frame_unref(m_DecodedFrame);
      return false;
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

  return true;
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
  av_packet_free(&m_EncodedPacket);
  av_frame_free(&m_EncodeFrame);
  av_frame_free(&m_DecodedFrame);
  avcodec_free_context(&m_EncoderContext);
  avcodec_free_context(&m_DecoderContext);
  m_ChannelLayout = 0;
  m_Channels = 0;
  m_NextEncoderPts = 0;
}
