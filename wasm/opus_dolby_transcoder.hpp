#pragma once

#include <atomic>
#include <cstdint>
#include <vector>

struct AVCodecContext;
struct AVFrame;
struct AVPacket;
struct AVAudioFifo;
struct SwrContext;

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
  double GetAverageProcessingLatencyMs() const;
  int GetOutputFrameSamples() const;

private:
  bool DrainEncoder(std::vector<std::vector<uint8_t>>& encodedPackets);

  AVCodecContext* m_DecoderContext = nullptr;
  AVCodecContext* m_EncoderContext = nullptr;
  AVFrame* m_DecodedFrame = nullptr;
  AVFrame* m_EncodeFrame = nullptr;
  AVFrame* m_ResampledFrame = nullptr;
  AVPacket* m_EncodedPacket = nullptr;
  AVAudioFifo* m_AudioFifo = nullptr;
  SwrContext* m_Resampler = nullptr;
  uint64_t m_ChannelLayout = 0;
  int m_Channels = 0;
  int64_t m_NextEncoderPts = 0;
  std::atomic<uint64_t> m_ProcessingTimeNs{0};
  std::atomic<uint64_t> m_ProcessedPackets{0};
};
