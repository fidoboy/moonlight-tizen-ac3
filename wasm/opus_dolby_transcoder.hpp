#pragma once

#include <cstdint>
#include <vector>

struct AVCodecContext;
struct AVFrame;
struct AVPacket;
struct AVAudioFifo;

class OpusDolbyTranscoder {
public:
  OpusDolbyTranscoder() = default;
  ~OpusDolbyTranscoder();

  OpusDolbyTranscoder(const OpusDolbyTranscoder&) = delete;
  OpusDolbyTranscoder& operator=(const OpusDolbyTranscoder&) = delete;

  bool Initialize(const void* opusConfiguration, int outputChannels,
    bool useBackSurround, bool eac3);
  bool Transcode(const uint8_t* data, int size,
    std::vector<std::vector<uint8_t>>& encodedPackets);
  void Cleanup();

private:
  bool DrainEncoder(std::vector<std::vector<uint8_t>>& encodedPackets);

  AVCodecContext* m_DecoderContext = nullptr;
  AVCodecContext* m_EncoderContext = nullptr;
  AVFrame* m_DecodedFrame = nullptr;
  AVFrame* m_EncodeFrame = nullptr;
  AVPacket* m_EncodedPacket = nullptr;
  AVAudioFifo* m_AudioFifo = nullptr;
  uint64_t m_ChannelLayout = 0;
  int m_Channels = 0;
  int64_t m_NextEncoderPts = 0;
};
