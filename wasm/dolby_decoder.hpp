#pragma once

#include <cstdint>
#include <vector>

struct AVCodecContext;
struct AVFrame;
struct SwrContext;

class DolbySoftwareDecoder {
public:
  DolbySoftwareDecoder() = default;
  ~DolbySoftwareDecoder();

  DolbySoftwareDecoder(const DolbySoftwareDecoder&) = delete;
  DolbySoftwareDecoder& operator=(const DolbySoftwareDecoder&) = delete;

  bool Initialize(bool eac3, int outputChannels, bool useBackSurround);
  bool Decode(const uint8_t* data, int size, std::vector<int16_t>& pcm, int& samplesPerChannel);
  void Cleanup();

private:
  bool ConfigureResampler(const AVFrame* frame);

  AVCodecContext* m_CodecContext = nullptr;
  AVFrame* m_Frame = nullptr;
  SwrContext* m_Resampler = nullptr;
  int m_OutputChannels = 0;
  int m_InputChannels = 0;
  int m_InputSampleRate = 0;
  int m_InputSampleFormat = -1;
  uint64_t m_InputChannelLayout = 0;
  uint64_t m_OutputChannelLayout = 0;
};
