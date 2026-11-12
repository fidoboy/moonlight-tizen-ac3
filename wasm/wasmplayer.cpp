#include "moonlight_wasm.hpp"

#include <condition_variable>
#include <chrono>
#include <functional>
#include <cstdint>
#include <cstdio>
#include <limits>
#include <vector>
#include <mutex>

#include <emscripten.h>

#include <h264_stream.h>

#include <assert.h>
#include <pthread.h>
#include <unistd.h>

#include "samsung/wasm/elementary_audio_track_config.h"
#include "samsung/wasm/emss_version_info.h"
#include "samsung/wasm/elementary_media_packet.h"
#include "samsung/wasm/elementary_video_track_config.h"
#include "samsung/html/html_media_element_listener.h"
#include "samsung/wasm/operation_result.h"

#define INITIAL_DECODE_BUFFER_LEN 1024 * 1024
#define MAX_SPS_EXTRA_SIZE 32

using std::chrono_literals::operator""s;
using std::chrono_literals::operator""ms;
using EmssReadyState = samsung::wasm::ElementaryMediaStreamSource::ReadyState;
using EmssOperationResult = samsung::wasm::OperationResult;
using EmssAsyncResult = samsung::wasm::OperationResult;
using HTMLAsyncResult = samsung::wasm::OperationResult;
using TimeStamp = samsung::wasm::Seconds;

static constexpr TimeStamp kFrameTimeMargin = 0.5ms;
static constexpr TimeStamp kPacingSpinTime = 1ms;
static constexpr TimeStamp kTimeWindow = 1s;
static constexpr uint32_t kSampleRate = 48000;

// Maximum time to wait for a stage of media pipeline setup.
static constexpr std::chrono::milliseconds kMediaSetupTimeout{5000};

static uint32_t s_VideoFormat = 0;
static std::string s_H264LevelName;
static uint32_t s_Width = 0;
static uint32_t s_Height = 0;
static uint32_t s_Framerate = 0;

// H.264 level limits from Annex A (macroblocks per frame and per second).
// Select the lowest level that can describe the requested stream dimensions and frame rate.
struct H264LevelLimit {
  uint8_t levelIdc;
  uint32_t maxFrameSizeMbs;
  uint32_t maxMacroblocksPerSecond;
  const char* name;
};

static constexpr H264LevelLimit kH264LevelLimits[] = {
  { 10, 99, 1485, "1.0" },
  { 11, 396, 3000, "1.1" },
  { 12, 396, 6000, "1.2" },
  { 13, 396, 11880, "1.3" },
  { 20, 396, 11880, "2.0" },
  { 21, 792, 19800, "2.1" },
  { 22, 1620, 20250, "2.2" },
  { 30, 1620, 40500, "3.0" },
  { 31, 3600, 108000, "3.1" },
  { 32, 5120, 216000, "3.2" },
  { 40, 8192, 245760, "4.0" },
  { 41, 8192, 245760, "4.1" },
  { 42, 8704, 522240, "4.2" },
  { 50, 22080, 589824, "5.0" },
  { 51, 36864, 983040, "5.1" },
  { 52, 36864, 2073600, "5.2" },
  { 60, 139264, 4177920, "6.0" },
  { 61, 139264, 8355840, "6.1" },
  { 62, 139264, 16711680, "6.2" },
};

static const H264LevelLimit* SelectH264Level(int width, int height, int frameRate) {
  if (width <= 0 || height <= 0 || frameRate <= 0) {
    return nullptr;
  }

  const uint64_t widthMbs = (static_cast<uint64_t>(width) + 15) / 16;
  const uint64_t heightMbs = (static_cast<uint64_t>(height) + 15) / 16;
  const uint64_t frameSizeMbs = widthMbs * heightMbs;
  const uint64_t maxUint64 = std::numeric_limits<uint64_t>::max();
  if (frameSizeMbs > maxUint64 / static_cast<uint64_t>(frameRate)) {
    return nullptr;
  }
  const uint64_t macroblocksPerSecond = frameSizeMbs * static_cast<uint64_t>(frameRate);

  for (const auto& level : kH264LevelLimits) {
    // Automatic selection is limited to the practical TV range: Level 3.1 through 5.2.
    // Keep the full table intact because manual overrides may still select other levels.
    if (level.levelIdc < 31 || level.levelIdc > 52) {
      continue;
    }

    const uint64_t maxDimensionSquared = static_cast<uint64_t>(level.maxFrameSizeMbs) * 8;
    if (frameSizeMbs <= level.maxFrameSizeMbs &&
        widthMbs * widthMbs <= maxDimensionSquared &&
        heightMbs * heightMbs <= maxDimensionSquared &&
        macroblocksPerSecond <= level.maxMacroblocksPerSecond) {
      return &level;
    }
  }

  return nullptr;
}


static const H264LevelLimit* FindH264Level(const std::string& levelName) {
  for (const auto& level : kH264LevelLimits) {
    std::string levelId = level.name;
    for (char& character : levelId) {
      if (character == '.') character = '_';
    }
    // Accept both the new transport-safe identifier and legacy dotted preferences.
    if (levelId == levelName || level.name == levelName) {
      return &level;
    }
  }
  return nullptr;
}

static std::vector<unsigned char> s_DecodeBuffer;

// HDR SEI messages persist within a HEVC coded video sequence. Track them so
// the fallback is not repeated when the original stream already supplied them.
static bool s_HevcMdcvAvailable = false;
static bool s_HevcCllAvailable = false;
static bool s_HevcHdrSeiInspectionFailed = false;
static bool s_HdrMetadataFallbackStatusLogged = false;
static bool s_HdrMetadataFallbackInspectionWarningLogged = false;

struct HevcHdrMetadataFallbackResult {
  bool inspected;
  bool mdcvAvailable;
  bool cllAvailable;
  bool insertedMdcv;
  bool insertedCll;
};

static bool FindAnnexBStartCode(
  const std::vector<unsigned char>& data,
  size_t dataLength,
  size_t searchFrom,
  size_t& startOffset,
  size_t& startCodeLength
) {
  if (dataLength > data.size()) {
    return false;
  }

  for (size_t i = searchFrom; i + 3 <= dataLength; ++i) {
    if (data[i] != 0 || data[i + 1] != 0) {
      continue;
    }

    if (i + 4 <= dataLength && data[i + 2] == 0 && data[i + 3] == 1) {
      startOffset = i;
      startCodeLength = 4;
      return true;
    }

    if (data[i + 2] == 1) {
      startOffset = i;
      startCodeLength = 3;
      return true;
    }
  }

  return false;
}

static bool ParseHevcSeiNal(
  const unsigned char* nal,
  size_t nalLength,
  bool& hasMdcv,
  bool& hasCll
) {
  if (nalLength < 3) {
    return false;
  }

  const unsigned int nalUnitType = (nal[0] >> 1) & 0x3F;
  if (nalUnitType != 39 && nalUnitType != 40) {
    return false;
  }

  // Convert the SEI payload from EBSP to RBSP.
  std::vector<unsigned char> rbsp;
  rbsp.reserve(nalLength - 2);
  unsigned int zeroCount = 0;

  for (size_t i = 2; i < nalLength; ++i) {
    const unsigned char value = nal[i];
    if (zeroCount >= 2 && value == 0x03 &&
        i + 1 < nalLength && nal[i + 1] <= 0x03) {
      zeroCount = 0;
      continue;
    }

    rbsp.push_back(value);
    zeroCount = value == 0 ? zeroCount + 1 : 0;
  }

  // Annex-B trailing_zero_8bits may follow rbsp_trailing_bits.
  while (!rbsp.empty() && rbsp.back() == 0) {
    rbsp.pop_back();
  }

  if (rbsp.empty() || rbsp.back() != 0x80) {
    return false;
  }

  const size_t payloadEnd = rbsp.size() - 1;
  size_t position = 0;

  const auto readSeiValue = [&rbsp, payloadEnd](
    size_t& cursor,
    size_t& value
  ) -> bool {
    value = 0;
    while (cursor < payloadEnd) {
      const unsigned int byteValue = rbsp[cursor++];
      if (value > std::numeric_limits<size_t>::max() - byteValue) {
        return false;
      }
      value += byteValue;
      if (byteValue != 0xFF) {
        return true;
      }
    }
    return false;
  };

  while (position < payloadEnd) {
    size_t payloadType = 0;
    size_t payloadSize = 0;
    if (!readSeiValue(position, payloadType) ||
        !readSeiValue(position, payloadSize) ||
        payloadSize > payloadEnd - position) {
      return false;
    }

    // HEVC SEI types corresponding to FFmpeg's mastering-display and
    // content-light AVFrame side data.
    if (payloadType == 137 && payloadSize >= 24) {
      hasMdcv = true;
    } else if (payloadType == 144 && payloadSize >= 4) {
      hasCll = true;
    }

    position += payloadSize;
  }

  return position == payloadEnd;
}

static void AppendSeiValue(std::vector<unsigned char>& rbsp, size_t value) {
  while (value >= 0xFF) {
    rbsp.push_back(0xFF);
    value -= 0xFF;
  }
  rbsp.push_back(static_cast<unsigned char>(value));
}


static void AppendBigEndian16(std::vector<unsigned char>& buffer, uint16_t value) {
  buffer.push_back(static_cast<unsigned char>(value >> 8));
  buffer.push_back(static_cast<unsigned char>(value));
}

static void AppendBigEndian32(std::vector<unsigned char>& buffer, uint32_t value) {
  buffer.push_back(static_cast<unsigned char>(value >> 24));
  buffer.push_back(static_cast<unsigned char>(value >> 16));
  buffer.push_back(static_cast<unsigned char>(value >> 8));
  buffer.push_back(static_cast<unsigned char>(value));
}

static std::vector<unsigned char> BuildHevcHdrSeiNal(
  const SS_HDR_METADATA& metadata,
  bool addMdcv,
  bool addCll
) {
  std::vector<unsigned char> rbsp;

  if (addMdcv) {
    // mastering_display_colour_volume (payloadType 137), 24-byte payload.
    AppendSeiValue(rbsp, 137);
    AppendSeiValue(rbsp, 24);

    // SS_HDR_METADATA stores RGB order; the HEVC MDCV SEI uses G, B, R.
    static const size_t kHevcPrimaryOrder[] = { 1, 2, 0 };
    for (const size_t index : kHevcPrimaryOrder) {
      AppendBigEndian16(rbsp, metadata.displayPrimaries[index].x);
      AppendBigEndian16(rbsp, metadata.displayPrimaries[index].y);
    }

    AppendBigEndian16(rbsp, metadata.whitePoint.x);
    AppendBigEndian16(rbsp, metadata.whitePoint.y);
    AppendBigEndian32(rbsp, metadata.maxDisplayLuminance);
    AppendBigEndian32(rbsp, metadata.minDisplayLuminance);
  }

  if (addCll) {
    // content_light_level_info (payloadType 144), 4-byte payload.
    AppendSeiValue(rbsp, 144);
    AppendSeiValue(rbsp, 4);
    AppendBigEndian16(rbsp, metadata.maxContentLightLevel);
    AppendBigEndian16(rbsp, metadata.maxFrameAverageLightLevel);
  }

  rbsp.push_back(0x80); // rbsp_trailing_bits

  // Annex-B prefix SEI NAL: type 39, layer_id 0, temporal_id_plus1 1.
  std::vector<unsigned char> nal = { 0x00, 0x00, 0x00, 0x01, 0x4E, 0x01 };
  unsigned int zeroCount = 0;
  for (const unsigned char value : rbsp) {
    if (zeroCount >= 2 && value <= 0x03) {
      nal.push_back(0x03);
      zeroCount = 0;
    }
    nal.push_back(value);
    zeroCount = value == 0 ? zeroCount + 1 : 0;
  }

  return nal;
}

static HevcHdrMetadataFallbackResult ApplyHevcHdrMetadataFallback(
  std::vector<unsigned char>& data,
  size_t& dataLength,
  const SS_HDR_METADATA& metadata,
  bool isIdr
) {
  HevcHdrMetadataFallbackResult result = { false, false, false, false, false };

  if (isIdr) {
    s_HevcMdcvAvailable = false;
    s_HevcCllAvailable = false;
    s_HevcHdrSeiInspectionFailed = false;
  }

  if (s_HevcHdrSeiInspectionFailed) {
    return result;
  }

  if (dataLength == 0 || dataLength > data.size()) {
    s_HevcHdrSeiInspectionFailed = true;
    return result;
  }

  size_t firstStartCodeOffset = 0;
  size_t firstStartCodeLength = 0;
  if (!FindAnnexBStartCode(data, dataLength, 0, firstStartCodeOffset, firstStartCodeLength)) {
    s_HevcHdrSeiInspectionFailed = true;
    return result;
  }

  bool foundMdcvInAccessUnit = false;
  bool foundCllInAccessUnit = false;
  size_t firstVclStartCodeOffset = std::numeric_limits<size_t>::max();
  size_t searchFrom = firstStartCodeOffset;

  while (searchFrom < dataLength) {
    size_t startCodeOffset = 0;
    size_t startCodeLength = 0;
    if (!FindAnnexBStartCode(data, dataLength, searchFrom, startCodeOffset, startCodeLength)) {
      break;
    }

    const size_t nalOffset = startCodeOffset + startCodeLength;
    if (nalOffset + 2 > dataLength) {
      s_HevcHdrSeiInspectionFailed = true;
      return result;
    }

    size_t nextStartCodeOffset = 0;
    size_t nextStartCodeLength = 0;
    const bool hasNextNal = FindAnnexBStartCode(
      data, dataLength, nalOffset + 2,
      nextStartCodeOffset, nextStartCodeLength);
    const size_t nalEnd = hasNextNal ? nextStartCodeOffset : dataLength;
    if (nalEnd < nalOffset + 2) {
      s_HevcHdrSeiInspectionFailed = true;
      return result;
    }

    const unsigned int nalUnitType = (data[nalOffset] >> 1) & 0x3F;

    if (nalUnitType == 39 || nalUnitType == 40) {
      if (!ParseHevcSeiNal(
            data.data() + nalOffset,
            nalEnd - nalOffset,
            foundMdcvInAccessUnit,
            foundCllInAccessUnit)) {
        // Fail closed for this coded video sequence if an existing SEI
        // cannot be parsed safely; otherwise a later fallback could duplicate it.
        s_HevcHdrSeiInspectionFailed = true;
        return result;
      }
    } else if (nalUnitType <= 31 &&
               firstVclStartCodeOffset == std::numeric_limits<size_t>::max()) {
      firstVclStartCodeOffset = startCodeOffset;
    }

    if (!hasNextNal) {
      break;
    }
    searchFrom = nextStartCodeOffset;
  }

  result.inspected = true;
  result.mdcvAvailable = s_HevcMdcvAvailable || foundMdcvInAccessUnit;
  result.cllAvailable = s_HevcCllAvailable || foundCllInAccessUnit;
  s_HevcMdcvAvailable = result.mdcvAvailable;
  s_HevcCllAvailable = result.cllAvailable;

  // Match Moonlight Qt's policy: supplement only absent metadata. An HEVC
  // MDCV SEI combines primaries and luminance, so both must be available.
  const bool metadataHasPrimaries = metadata.displayPrimaries[0].x != 0;
  const bool metadataHasMasteringLuminance = metadata.maxDisplayLuminance != 0;
  const bool canAddMdcv = metadataHasPrimaries && metadataHasMasteringLuminance;
  const bool canAddCll =
    metadata.maxContentLightLevel != 0 ||
    metadata.maxFrameAverageLightLevel != 0;

  const bool addMdcv = !s_HevcMdcvAvailable && canAddMdcv;
  const bool addCll = !s_HevcCllAvailable && canAddCll;

  if ((!addMdcv && !addCll) ||
      firstVclStartCodeOffset == std::numeric_limits<size_t>::max()) {
    return result;
  }

  const std::vector<unsigned char> seiNal =
    BuildHevcHdrSeiNal(metadata, addMdcv, addCll);

  data.insert(
    data.begin() + firstVclStartCodeOffset,
    seiNal.begin(),
    seiNal.end());
  dataLength += seiNal.size();

  if (addMdcv) {
    s_HevcMdcvAvailable = true;
    result.mdcvAvailable = true;
    result.insertedMdcv = true;
  }
  if (addCll) {
    s_HevcCllAvailable = true;
    result.cllAvailable = true;
    result.insertedCll = true;
  }

  return result;
}


static TimeStamp s_frameDuration;
static TimeStamp s_pktPts;

static TimeStamp s_ptsDiff;
static TimeStamp s_lastSec;

static std::chrono::time_point<std::chrono::steady_clock> s_firstAppend;
static std::chrono::time_point<std::chrono::steady_clock> s_lastTime;

static bool s_hasFirstFrame = false;
static bool s_FramePacingEnabled = false;

static uint32_t total_bytes = 0;
static int m_LastFrameNumber = 0;
static bool s_PerformanceStatsCollecting = false;

// Fixed-size writable buffer used by FormatVideoStats().
static std::string s_StatString(2048, '\0');

static VIDEO_STATS m_ActiveWndVideoStats;
static VIDEO_STATS m_LastWndVideoStats;
static VIDEO_STATS m_GlobalVideoStats;
static RTP_AUDIO_FEC_STATS s_AudioFecWindowStats = {};
static RTP_AUDIO_FEC_STATS s_LastAudioFecStats = {};
static bool s_AudioFecStatsBaselineValid = false;

static uint32_t AudioFecCounterDelta(uint32_t current, uint32_t previous) {
  // A counter decrease means that the audio queue was reset during the session.
  return current >= previous ? current - previous : current;
}

static void UpdateAudioFecWindowStats(void) {
  s_AudioFecWindowStats = {};
  if (g_Instance == nullptr || g_Instance->m_AudioBackend == AudioBackend::Disabled) {
    s_LastAudioFecStats = {};
    s_AudioFecStatsBaselineValid = false;
    return;
  }

  RTP_AUDIO_FEC_STATS currentStats = {};
  LiGetRTPAudioFecStats(&currentStats);
  if (!s_AudioFecStatsBaselineValid) {
    s_LastAudioFecStats = currentStats;
    s_AudioFecStatsBaselineValid = true;
    return;
  }
  s_AudioFecWindowStats.recoveredPackets = AudioFecCounterDelta(currentStats.recoveredPackets, s_LastAudioFecStats.recoveredPackets);
  s_AudioFecWindowStats.failedBlocks = AudioFecCounterDelta(currentStats.failedBlocks, s_LastAudioFecStats.failedBlocks);
  s_AudioFecWindowStats.outOfOrderPackets = AudioFecCounterDelta(currentStats.outOfOrderPackets, s_LastAudioFecStats.outOfOrderPackets);
  s_LastAudioFecStats = currentStats;
}

MoonlightInstance::SourceListener::SourceListener(
  MoonlightInstance* instance
) : m_Instance(instance) {}

void MoonlightInstance::SourceListener::OnSourceOpen() {
  ClLogMessage("EMSS::OnOpen\n");
  std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
  m_Instance->m_EmssReadyState = EmssReadyState::kOpen;
  m_Instance->m_EmssStateChanged.notify_all();
}

void MoonlightInstance::SourceListener::OnSourceOpenPending() {
  ClLogMessage("EMSS::OnOpenPending\n");
  std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
  m_Instance->m_EmssReadyState = EmssReadyState::kOpenPending;
  m_Instance->m_EmssStateChanged.notify_all();
}

void MoonlightInstance::SourceListener::OnSourceClosed() {
  ClLogMessage("EMSS::OnClosed\n");
  std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
  m_Instance->m_EmssReadyState = EmssReadyState::kClosed;
  m_Instance->m_EmssStateChanged.notify_all();
}

MoonlightInstance::AudioTrackListener::AudioTrackListener(
  MoonlightInstance* instance
) : m_Instance(instance) {}

void MoonlightInstance::AudioTrackListener::OnTrackOpen() {
  ClLogMessage("AUDIO ElementaryMediaTrack::OnTrackOpen\n");
  std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
  m_Instance->m_AudioStarted = true;
  m_Instance->m_EmssAudioStateChanged.notify_all();
}

void MoonlightInstance::AudioTrackListener::OnTrackClosed(samsung::wasm::ElementaryMediaTrack::CloseReason) {
  ClLogMessage("AUDIO ElementaryMediaTrack::OnTrackClosed\n");
  std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
  m_Instance->m_AudioStarted = false;
}

void MoonlightInstance::AudioTrackListener::OnSessionIdChanged(samsung::wasm::SessionId new_session_id) {
  ClLogMessage("AUDIO ElementaryMediaTrack::OnSessionIdChanged\n");
  std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
  m_Instance->m_AudioSessionId.store(new_session_id);
}

MoonlightInstance::VideoTrackListener::VideoTrackListener(
  MoonlightInstance* instance
) : m_Instance(instance) {}

void MoonlightInstance::VideoTrackListener::OnTrackOpen() {
  ClLogMessage("VIDEO ElementaryMediaTrack::OnTrackOpen\n");
  std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
  m_Instance->m_VideoStarted = true;
  m_Instance->m_EmssVideoStateChanged.notify_all();
  LiRequestIdrFrame();
}

void MoonlightInstance::VideoTrackListener::OnTrackClosed(EmssTrackCloseReason reason) {
  const char* reasonName = "unknown";
  switch (reason) {
    case EmssTrackCloseReason::kSourceClosed: reasonName = "source-closed"; break;
    case EmssTrackCloseReason::kSourceError: reasonName = "source-error"; break;
    case EmssTrackCloseReason::kSourceDetached: reasonName = "source-detached"; break;
    case EmssTrackCloseReason::kSourceSuspended: reasonName = "source-suspended"; break;
    case EmssTrackCloseReason::kTrackDisabled: reasonName = "track-disabled"; break;
    case EmssTrackCloseReason::kTrackEnded: reasonName = "track-ended"; break;
    case EmssTrackCloseReason::kTrackSeeking: reasonName = "track-seeking"; break;
    case EmssTrackCloseReason::kUnknown: reasonName = "unknown"; break;
  }
  ClLogMessage("VIDEO ElementaryMediaTrack::OnTrackClosed (reason=%s, value=%d)\n",
    reasonName, static_cast<int>(reason));
  {
    std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
    m_Instance->m_VideoStarted = false;
  }
  if (reason == EmssTrackCloseReason::kSourceError) {
    PostToJs("VideoTrackCloseErrorMsg: The media source closed because of an error.");
  }
}

MoonlightInstance::MediaElementListener::MediaElementListener(
  MoonlightInstance* instance
) : m_Instance(instance) {}

void MoonlightInstance::MediaElementListener::OnError(
  samsung::html::MediaError errorCode, const char* errorMessage
) {
  const int numericErrorCode = static_cast<int>(errorCode);
  const std::string detail = errorMessage ? errorMessage : "";
  ClLogMessage("HTMLMediaElement::OnError (code=%d): %s\n",
    numericErrorCode, detail.c_str());
  // Samsung owns errorMessage and its lifetime ends when this callback returns.
  // Copy it into the JS message immediately; the UI will display it only after teardown.
  PostToJs("MediaPipelineErrorMsg: " + std::to_string(numericErrorCode) + "|" + detail);
}

void MoonlightInstance::VideoTrackListener::OnSessionIdChanged(samsung::wasm::SessionId new_session_id) {
  ClLogMessage("VIDEO ElementaryMediaTrack::OnSessionIdChanged\n");
  std::unique_lock<std::mutex> lock(m_Instance->m_Mutex);
  m_Instance->m_VideoSessionId.store(new_session_id);
}

void MoonlightInstance::DidChangeFocus(bool got_focus) {
  // Request an IDR frame to dump the frame queue that may have
  // built up from the GL pipeline being stalled.
  if (got_focus) {
    LiRequestIdrFrame();
  }
}

bool MoonlightInstance::InitializeRenderingSurface(int width, int height) {
  return true;
}

int MoonlightInstance::StartupVidDecSetup(int videoFormat, int width, int height, int redrawRate, void* context, int drFlags) {
  // Clear the previous session's level before selecting the codec for this stream.
  s_H264LevelName.clear();
  // Bind the media source to the media element
  g_Instance->m_MediaElement.SetSrc(g_Instance->m_Source.get());
  g_Instance->m_SourceAttached = true;
  ClLogMessage("Waiting to close\n");

  if (!g_Instance->WaitFor(&g_Instance->m_EmssStateChanged, [] {
    return g_Instance->m_EmssReadyState == EmssReadyState::kClosed;
  }, kMediaSetupTimeout)) {
    return MediaSetupWaitFailed("initial close");
  }
  ClLogMessage("Closed\n");

  // Web Audio renders decoded PCM in platform/audio.js. EMSS can submit the negotiated
  // AC-3/E-AC-3 bitstream directly to Tizen's native audio renderer.
  if (g_Instance->m_AudioBackend == AudioBackend::Emss) {
    if (LiIsAc3AudioNegotiated() || LiIsEac3AudioNegotiated()) {
      const bool isEac3 = LiIsEac3AudioNegotiated();
      auto effectiveAudioConfig = g_Instance->m_AudioConfig;
      auto channelCount = CHANNEL_COUNT_FROM_AUDIO_CONFIGURATION(effectiveAudioConfig);

      // AC-3 cannot carry 7.1. If it is negotiated while 7.1 is selected, configure
      // an effective 5.1 track for this stream without overwriting the saved preference.
      if (!isEac3 && channelCount == 8) {
        effectiveAudioConfig = AUDIO_CONFIGURATION_51_SURROUND;
        g_Instance->m_AudioConfig = effectiveAudioConfig;
        channelCount = 6;
        ClLogMessage("AC-3 negotiated with 7.1 selected; falling back to 5.1 for this stream\n");
      }

      samsung::wasm::ChannelLayout channelLayout;
      switch (channelCount) {
        case 2:
          channelLayout = samsung::wasm::ChannelLayout::kStereo;
          break;
        case 6:
          channelLayout = g_Instance->m_DolbyChannelLayout == "Normal"
            ? samsung::wasm::ChannelLayout::k5_1
            : samsung::wasm::ChannelLayout::k5_1Back;
          break;
        case 8:
          channelLayout = samsung::wasm::ChannelLayout::k7_1;
          break;
        default:
          ClLogMessage("Unsupported channel layout for negotiated Dolby audio: %d\n", channelCount);
          return -1;
      }

      const char* mimeType = isEac3 ? "audio/mp4; codecs=\"ec-3\"" : "audio/mp4; codecs=\"ac-3\"";
      const auto sampleFormat = isEac3
        ? samsung::wasm::SampleFormat::kEac3
        : samsung::wasm::SampleFormat::kAc3;
      auto decodingMode = samsung::wasm::DecodingMode::kHardware;
      const bool hasDecodingMode = samsung::wasm::EmssVersionInfo::Create().has_decoding_mode;
      if (hasDecodingMode) {
        if (g_Instance->m_DolbyDecodingMode == "HardwareWithFallback") {
          decodingMode = samsung::wasm::DecodingMode::kHardwareWithFallback;
        } else if (g_Instance->m_DolbyDecodingMode == "Software") {
          decodingMode = samsung::wasm::DecodingMode::kSoftware;
        }
      }
      ClLogMessage("Configuring the EMSS track for %s (%d channels, layout=%s, decoding=%s)\n",
        isEac3 ? "E-AC-3" : "AC-3", channelCount,
        g_Instance->m_DolbyChannelLayout.c_str(), hasDecodingMode ? g_Instance->m_DolbyDecodingMode.c_str() : "Hardware");

      auto add_track_result = g_Instance->m_Source->AddTrack(
        samsung::wasm::ElementaryAudioTrackConfig {
          mimeType, // Compressed Dolby elementary bitstream
          {}, // Extradata: Empty
          decodingMode, // Dolby decoding mode selected by the user when supported
          sampleFormat, // AC-3/E-AC-3 compressed bitstream
          channelLayout,
          kSampleRate, // Sample Rate: 48 kHz (48000 Hz)
        }
      );
      if (add_track_result) {
        g_Instance->m_AudioTrack = std::move(*add_track_result);
        g_Instance->m_AudioTrack.SetListener(&g_Instance->m_AudioTrackListener);
      }
      else {
        ClLogMessage("Failed to create %s audio track; aborting negotiated Dolby session\n",
          isEac3 ? "E-AC-3" : "AC-3");
        return -1;
      }
    }
    else {
      samsung::wasm::ChannelLayout channelLayout; // Selected PCM channel layout
      switch (CHANNEL_COUNT_FROM_AUDIO_CONFIGURATION(g_Instance->m_AudioConfig)) {
        case 2:
          channelLayout = samsung::wasm::ChannelLayout::kStereo;
          ClLogMessage("Selected channel layout for Stereo audio\n");
          break;
        case 6:
          channelLayout = samsung::wasm::ChannelLayout::k5_1;
          ClLogMessage("Selected channel layout for 5.1 Surround audio\n");
          break;
        case 8:
          channelLayout = samsung::wasm::ChannelLayout::k7_1;
          ClLogMessage("Selected channel layout for 7.1 Surround audio\n");
          break;
        default:
          ClLogMessage("Unable to select channel layout from audio configuration\n");
          return -1;
      }

      auto add_track_result = g_Instance->m_Source->AddTrack(
        samsung::wasm::ElementaryAudioTrackConfig {
          "audio/webm; codecs=\"pcm\"", // Pulse Code Modulation (PCM)
          {}, // Extradata: Empty
          samsung::wasm::DecodingMode::kHardware, // Decoding mode: Hardware
          samsung::wasm::SampleFormat::kS16, // 16-bit signed PCM
          channelLayout,
          kSampleRate, // Sample Rate: 48 kHz (48000 Hz)
        }
      );
      if (add_track_result) {
        g_Instance->m_AudioTrack = std::move(*add_track_result);
        g_Instance->m_AudioTrack.SetListener(&g_Instance->m_AudioTrackListener);
      } else {
        ClLogMessage("The TV rejected the audio track\n");
        return -1;
      }
    }
  }
  {
    const char *mimetype = "video/mp4"; // MIME-type: Video MP4 Container
    std::string h264MimeType;
    std::string h264LevelName;
    if (videoFormat & VIDEO_FORMAT_H264) {
      const bool automaticLevel = g_Instance->m_H264Level == "Auto";
      const auto* h264Level = automaticLevel
        ? SelectH264Level(width, height, redrawRate)
        : FindH264Level(g_Instance->m_H264Level);
      if (h264Level == nullptr) {
        if (automaticLevel) {
          ClLogMessage("H.264 stream dimensions or frame rate exceed the supported level range (%dx%d at %d FPS)\n",
            width, height, redrawRate);
        } else {
          ClLogMessage("Invalid manual H.264 level selected: %s\n", g_Instance->m_H264Level.c_str());
        }
        return -1;
      }
      h264LevelName = h264Level->name;
      s_H264LevelName = h264LevelName;

      char codecString[64];
      std::snprintf(codecString, sizeof(codecString), "video/mp4; codecs=\"avc1.6400%02X\"",
        h264Level->levelIdc);
      h264MimeType = codecString;
      mimetype = h264MimeType.c_str();
      ClLogMessage("Video codec profile selected: H.264 High Profile Level %s (%s, %dx%d at %d FPS)\n",
        h264Level->name, automaticLevel ? "automatic" : "manual override", width, height, redrawRate);
    } else if (videoFormat & VIDEO_FORMAT_H265) {
      mimetype = "video/mp4; codecs=\"hev1.1.6.L153.B0\""; // Video Codec: HEVC Main Level Profile 5.1
      /* NOTE: Depending on the capabilities of the TV, it may support higher-level codec profiles, such as:
      5.2 (hev1.1.6.L156.B0); */
      ClLogMessage("Video codec profile selected: HEVC Main Level Profile 5.1\n");
    } else if (videoFormat & VIDEO_FORMAT_H265_MAIN10) {
      mimetype = "video/mp4; codecs=\"hev1.2.4.L153.B0\""; // Video Codec: HEVC Main10 Level Profile 5.1
      /* NOTE: Depending on the capabilities of the TV, it may support higher-level codec profiles, such as:
      5.2 (hev1.2.4.L156.B0); */
      ClLogMessage("Video codec profile selected: HEVC Main10 Level Profile 5.1\n");
    } else if (videoFormat & VIDEO_FORMAT_AV1_MAIN8) {
      mimetype = "video/mp4; codecs=\"av01.0.13M.08\""; // Video Codec: AV1 Main Level Profile 5.1
      /* NOTE: Depending on the capabilities of the TV, it may support higher-level codec profiles, such as:
      5.2 (av01.0.14M.08); */
      ClLogMessage("Video codec profile selected: AV1 Main Level Profile 5.1\n");
    } else if (videoFormat & VIDEO_FORMAT_AV1_MAIN10) {
      mimetype = "video/mp4; codecs=\"av01.0.13M.10\""; // Video Codec: AV1 Main10 Level Profile 5.1
      /* NOTE: Depending on the capabilities of the TV, it may support higher-level codec profiles, such as:
      5.2 (av01.0.14M.10); */
      ClLogMessage("Video codec profile selected: AV1 Main10 Level Profile 5.1\n");
    } else {
      ClLogMessage("Failed to select video codec profile (videoFormat=0x%x)\n", videoFormat);
      return -1;
    }

    ClLogMessage("Using mimeType %s\n", mimetype);
    auto add_track_result = g_Instance->m_Source->AddTrack(
      samsung::wasm::ElementaryVideoTrackConfig {
        mimetype, // MIME-type: Selected Video Format
        {}, // Extradata: Empty
        samsung::wasm::DecodingMode::kHardware, // Decoding mode: Hardware
        static_cast<uint32_t>(width), // Video resolution: Width
        static_cast<uint32_t>(height), // Video resolution: Height
        static_cast<uint32_t>(redrawRate), // Framerate: Numerator
        1, // Framerate: Denominator
      }
    );
    if (add_track_result) {
      g_Instance->m_VideoTrack = std::move(*add_track_result);
      g_Instance->m_VideoTrack.SetListener(&g_Instance->m_VideoTrackListener);
      if (videoFormat & VIDEO_FORMAT_H264) {
      }
    } else {
      if (videoFormat & VIDEO_FORMAT_H264) {
      }
      ClLogMessage("The TV rejected the video track (%s, %dx%d at %d FPS)\n", mimetype, width, height, redrawRate);
      if (videoFormat & VIDEO_FORMAT_H264) {
        PostToJs(std::string("H264TrackRejectedMsg: ") + h264LevelName + "," +
          std::to_string(width) + "," + std::to_string(height) + "," + std::to_string(redrawRate));
        return ERROR_H264_TRACK_REJECTED;
      }
      return ERROR_VIDEO_SETUP_FAILED;
    }
  }

  ClLogMessage("Inb4 source open\n");
  g_Instance->m_Source->Open([](EmssOperationResult){});
  if (!g_Instance->WaitFor(&g_Instance->m_EmssStateChanged, [] {
    return g_Instance->m_EmssReadyState == EmssReadyState::kOpenPending ||
           g_Instance->m_EmssReadyState == EmssReadyState::kOpen;
  }, kMediaSetupTimeout)) {
    return MediaSetupWaitFailed("open");
  }

  ClLogMessage("Source ready to open\n");
  g_Instance->m_MediaElement.Play([](EmssOperationResult err) {
    if (err != EmssOperationResult::kSuccess) {
      ClLogMessage("Play error\n");
    } else {
      ClLogMessage("Play success\n");
    }
  });

  ClLogMessage("Waiting to start\n");
  // Only the EMSS backend opens an audio track, so the Web Audio backend has nothing to wait for
  if (g_Instance->m_AudioBackend == AudioBackend::Emss) {
    if (!g_Instance->WaitFor(&g_Instance->m_EmssAudioStateChanged, [] {
      return g_Instance->m_AudioStarted.load();
    }, kMediaSetupTimeout)) {
      return MediaSetupWaitFailed("audio start");
    }
  }
  if (!g_Instance->WaitFor(&g_Instance->m_EmssVideoStateChanged, [] {
    return g_Instance->m_VideoStarted.load();
  }, kMediaSetupTimeout)) {
    return MediaSetupWaitFailed("video start");
  }

  ClLogMessage("Started\n");
  return 0;
}

int MoonlightInstance::VidDecSetup(int videoFormat, int width, int height, int redrawRate, void* context, int drFlags) {
  ClLogMessage("Video decoding setup has started.\n");

  // Resize the decode buffer based on initial decode buffer length
  s_DecodeBuffer.resize(INITIAL_DECODE_BUFFER_LEN);

  // Set the video format, video resolution and video frame rate based on the input parameters
  s_VideoFormat = videoFormat;
  s_Width = width;
  s_Height = height;
  s_Framerate = redrawRate;

  // Calculate frame duration from the frame rate
  s_frameDuration = TimeStamp(1.0 / (float)redrawRate);

  // Initialize packet timestamp to zero
  s_pktPts = 0s;

  // Flag indicating whether this is the first frame of video to be decoded
  s_hasFirstFrame = false;

  // Reset HDR SEI tracking for the new stream.
  s_HevcMdcvAvailable = false;
  s_HevcCllAvailable = false;
  s_HevcHdrSeiInspectionFailed = false;
  s_HdrMetadataFallbackStatusLogged = false;
  s_HdrMetadataFallbackInspectionWarningLogged = false;

  // Initialize the last second timestamp to zero
  s_lastSec = 0s;

  // Initialize the timestamp difference to zero
  s_ptsDiff = 0s;

  // Set the frame pacing flag based on instance configuration
  s_FramePacingEnabled = g_Instance->m_FramePacingEnabled;

  // Preallocate space for the performance stats string
  s_StatString.resize(1000);

  // Clear active window video statistics to start fresh
  memset(&m_ActiveWndVideoStats, 0, sizeof(m_ActiveWndVideoStats));

  // Clear last window video statistics from previous session
  memset(&m_LastWndVideoStats, 0, sizeof(m_LastWndVideoStats));

  // Reset global video statistics for new decoding session
  memset(&m_GlobalVideoStats, 0, sizeof(m_GlobalVideoStats));

  // Reset last frame number to prevent massive integer underflow on subsequent streams
  m_LastFrameNumber = 0;
  s_PerformanceStatsCollecting = false;

  // Reset received video and audio byte counts for the new stream.
  total_bytes = 0;
  g_Instance->m_AudioBytesReceived.store(0, std::memory_order_relaxed);
  s_AudioFecWindowStats = {};
  s_LastAudioFecStats = {};
  s_AudioFecStatsBaselineValid = false;

  // Ensure that StartupVidDecSetup is called every time when VidDecSetup is invoked to reinitialize the media pipeline
  int initVidDec = StartupVidDecSetup(videoFormat, width, height, redrawRate, context, drFlags);

  // Check and handle errors from video decoding configuration and propagating failures
  if (initVidDec != 0) {
    ClLogMessage("Initialization of video decoding configuration failed: %d\n", initVidDec);
    return initVidDec;
  }

  return DR_OK;
}

void MoonlightInstance::VidDecCleanup(void) {
  // Clear the decode buffer
  s_DecodeBuffer.clear();

  // Shrink the decode buffer to fit its contents
  s_DecodeBuffer.shrink_to_fit();
}

int MoonlightInstance::VidDecSubmitDecodeUnit(PDECODE_UNIT decodeUnit) {
  // Check if video playback has not started
  if (!g_Instance->m_VideoStarted) {
    return DR_OK;
  }

  // Collect overlay-specific metrics only while the performance statistics are enabled.
  const bool collectPerformanceStats =
    g_Instance->m_PerformanceStatsEnabled.load(std::memory_order_relaxed);
  if (collectPerformanceStats && !s_PerformanceStatsCollecting) {
    // Start with a clean measurement window when statistics are enabled mid-stream.
    memset(&m_ActiveWndVideoStats, 0, sizeof(m_ActiveWndVideoStats));
    memset(&m_LastWndVideoStats, 0, sizeof(m_LastWndVideoStats));
    memset(&m_GlobalVideoStats, 0, sizeof(m_GlobalVideoStats));
    m_LastFrameNumber = 0;
    total_bytes = 0;
    g_Instance->m_AudioBytesReceived.store(0, std::memory_order_relaxed);
    std::fill(s_StatString.begin(), s_StatString.end(), '\0');
    s_AudioFecStatsBaselineValid = false;
    UpdateAudioFecWindowStats();
    s_PerformanceStatsCollecting = true;
  } else if (!collectPerformanceStats) {
    s_PerformanceStatsCollecting = false;
  }

  // Declare variables for entry data, offset, and total length
  PLENTRY entry;
  unsigned int offset;
  unsigned int totalLength;

  // Build one packet from multiple data chunks
  totalLength = decodeUnit->fullLength;

  // Check if the frame type from the decoding unit is IDR frame
  if (decodeUnit->frameType == FRAME_TYPE_IDR) {
    // Add some extra space in case we need to do an SPS fixup
    totalLength += MAX_SPS_EXTRA_SIZE;
  }

  // Ensure the decode buffer is large enough to hold the full packet
  if (totalLength > s_DecodeBuffer.size()) {
    // Resize decode buffer to accommodate the larger data
    s_DecodeBuffer.resize(totalLength);
  }

  // Initialize the entry pointer to the start of the buffer list
  entry = decodeUnit->bufferList;

  // Initialize the offset to 0 before starting to copy data
  offset = 0;

  // Iterate through the buffer list of video data entries
  while (entry != NULL) {
    // Copy the data of the current entry to the decode buffer at the specified offset
    memcpy(&s_DecodeBuffer[offset], entry->data, entry->length);
    // Update the offset based on the length of the copied data
    offset += entry->length;
    // Move to the next entry in the buffer list
    entry = entry->next;
  }

  
  // Supplement HEVC Main10 access units with Sunshine HDR metadata only when
  // the corresponding SEI is not already available in the original bitstream.
  if (s_VideoFormat & VIDEO_FORMAT_H265_MAIN10) {
    SS_HDR_METADATA hdrMetadata = {};
    if (LiGetHdrMetadata(&hdrMetadata)) {
      size_t packetLength = offset;
      const auto fallback = ApplyHevcHdrMetadataFallback(
        s_DecodeBuffer,
        packetLength,
        hdrMetadata,
        decodeUnit->frameType == FRAME_TYPE_IDR);

      if (packetLength > std::numeric_limits<unsigned int>::max()) {
        ClLogMessage("HEVC packet size overflow after HDR metadata insertion\n");
        return DR_NEED_IDR;
      }
      offset = static_cast<unsigned int>(packetLength);

      if (!fallback.inspected && !s_HdrMetadataFallbackInspectionWarningLogged) {
        ClLogMessage(
          "HEVC HDR metadata fallback: unable to inspect the Annex-B access unit; injection skipped.\n");
        s_HdrMetadataFallbackInspectionWarningLogged = true;
      }

      if (fallback.inspected && !s_HdrMetadataFallbackStatusLogged) {
        ClLogMessage(
          "HEVC HDR metadata: MDCV=%s%s, CLL=%s%s\n",
          fallback.mdcvAvailable ? "available" : "missing",
          fallback.insertedMdcv ? " (fallback inserted)" : "",
          fallback.cllAvailable ? "available" : "missing",
          fallback.insertedCll ? " (fallback inserted)" : "");
        s_HdrMetadataFallbackStatusLogged = true;
      }
    }
  }

  // Get the current time
  auto now = std::chrono::steady_clock::now();

  // Check if this is the first video frame
  if (!s_hasFirstFrame) {
    // Record the time of the first frame
    s_firstAppend = std::chrono::steady_clock::now();
    // Update the flag to indicate that the first frame has been processed
    s_hasFirstFrame = true;
  }

  // Measure pacing duration only when it will be used by the statistics overlay.
  uint32_t pacingStart = 0;
  if (collectPerformanceStats) {
    pacingStart = LiGetMillis();
  }

  // Check if the frame pacing is enabled
  if (s_FramePacingEnabled) {
    // Calculate the time elapsed since the first frame
    TimeStamp fromStart = now - s_firstAppend;
    // Wait until the packet timestamp is within the frame time margin
    while (s_pktPts > fromStart - s_ptsDiff + kFrameTimeMargin) {
      // Calculate the remaining wait time until the packet timestamp is within the frame time margin
      TimeStamp waitTime = s_pktPts - (fromStart - s_ptsDiff + kFrameTimeMargin);
      // Sleep through most of the wait to free up the CPU for the other streaming threads,
      // and only spin for the final stretch in case the sleep wakes up late
      if (waitTime > kPacingSpinTime) {
        usleep(std::chrono::duration_cast<std::chrono::microseconds>(waitTime - kPacingSpinTime).count());
      }
      // Update the current time and recalculate the elapsed time
      now = std::chrono::steady_clock::now();
      fromStart = now - s_firstAppend;
    }
    // Synchronize packet presentation timing every time window
    if (fromStart > s_lastSec + kTimeWindow) {
      // Update the last second to the current time plus the time window
      s_lastSec += kTimeWindow;
      // Update the time difference to synchronize with the packet presentation time
      s_ptsDiff = fromStart - s_pktPts;
    }
  }

  if (collectPerformanceStats) {
    // Measure total pacer time based on calculated pacing duration.
    const uint32_t pacingEnd = LiGetMillis();
    m_ActiveWndVideoStats.totalPacerTime += pacingEnd - pacingStart;
  }

  // Update the timestamp of the last packet append
  s_lastTime = now;

  if (collectPerformanceStats) {
    // Track the total number of bytes received by the decoding unit.
    total_bytes += decodeUnit->fullLength;

    // Start performance stats collection if this is the first measured frame.
    if (!m_LastFrameNumber) {
      m_ActiveWndVideoStats.measurementStartTimestamp = LiGetMillis();
      m_LastFrameNumber = decodeUnit->frameNumber;
    } else {
      // Any frame number greater than the last frame number + 1 represents a dropped frame.
      // Frame counters can reset or wrap. Treat non-increasing values as a new
      // baseline instead of allowing unsigned underflow into diagnostic counters.
      if (decodeUnit->frameNumber > m_LastFrameNumber) {
        const uint32_t missingFrames = decodeUnit->frameNumber - m_LastFrameNumber - 1;
        m_ActiveWndVideoStats.networkDroppedFrames += missingFrames;
        m_ActiveWndVideoStats.totalFrames += missingFrames;
      }
      m_LastFrameNumber = decodeUnit->frameNumber;
    }

    const uint32_t nowMs = LiGetMillis();

    // Flip the performance stats window roughly every second.
    if (m_ActiveWndVideoStats.measurementStartTimestamp != 0 &&
        nowMs > m_ActiveWndVideoStats.measurementStartTimestamp &&
        nowMs - m_ActiveWndVideoStats.measurementStartTimestamp > 1000) {
      const uint32_t statsIntervalMs = nowMs - m_ActiveWndVideoStats.measurementStartTimestamp;
      const uint64_t audioBytesReceived =
        g_Instance->m_AudioBytesReceived.exchange(0, std::memory_order_relaxed);
      const float audioBitrateKbps = statsIntervalMs > 0
        ? (static_cast<float>(audioBytesReceived) * 8.0f) / statsIntervalMs
        : 0.0f;

      // Sample audio FEC counters on the same one-second tick as text and graph statistics.
      UpdateAudioFecWindowStats();

      VIDEO_STATS lastTwoWndStats = {};
      lastTwoWndStats.receivedBitrate = statsIntervalMs > 0
        ? (static_cast<double>(total_bytes) * 8.0) /
          (static_cast<double>(statsIntervalMs) * 1000.0)
        : 0.0;
      AddVideoStats(m_LastWndVideoStats, lastTwoWndStats);
      AddVideoStats(m_ActiveWndVideoStats, lastTwoWndStats);
      lastTwoWndStats.receivedAudioBitrateKbps = audioBitrateKbps;

      // Format and send text statistics.
      FormatVideoStats(lastTwoWndStats, s_StatString.data(), s_StatString.length());
      PostToJs(std::string("StatMsg: ") + s_StatString.data());

      // Send host latency only when valid measurements are available.
      if (lastTwoWndStats.framesWithHostProcessingLatency > 0) {
        char hostLatencyMessage[128];
        const int hostLatencyMessageLength = snprintf(
          hostLatencyMessage, sizeof(hostLatencyMessage),
          "HostLatencyMsg: %.1f,%.1f,%.1f",
          (float)lastTwoWndStats.minHostProcessingLatency / 10,
          (float)lastTwoWndStats.maxHostProcessingLatency / 10,
          (float)lastTwoWndStats.totalHostProcessingLatency / 10 /
            lastTwoWndStats.framesWithHostProcessingLatency
        );
        if (hostLatencyMessageLength > 0 &&
            hostLatencyMessageLength < (int)sizeof(hostLatencyMessage)) {
          PostToJs(hostLatencyMessage);
        }
      }

      // Send interval-only audio FEC activity beside each corresponding RTT sample.
      char graphMessage[128];
      const int graphMessageLength = snprintf(
        graphMessage, sizeof(graphMessage), "GraphMsg: %u,%u,%u,%u,%u,%u",
        lastTwoWndStats.lastRtt,
        lastTwoWndStats.lastRttVariance,
        m_ActiveWndVideoStats.networkDroppedFrames,
        s_AudioFecWindowStats.recoveredPackets,
        s_AudioFecWindowStats.failedBlocks,
        s_AudioFecWindowStats.outOfOrderPackets
      );
      if (graphMessageLength > 0 && graphMessageLength < (int)sizeof(graphMessage)) {
        PostToJs(graphMessage);
      }

      std::fill(s_StatString.begin(), s_StatString.end(), '\0');
      total_bytes = 0;
      AddVideoStats(m_ActiveWndVideoStats, m_GlobalVideoStats);
      memcpy(&m_LastWndVideoStats, &m_ActiveWndVideoStats, sizeof(m_ActiveWndVideoStats));
      memset(&m_ActiveWndVideoStats, 0, sizeof(m_ActiveWndVideoStats));
      m_ActiveWndVideoStats.measurementStartTimestamp = LiGetMillis();
    }
  }

  if (collectPerformanceStats) {
    // Accumulate host processing latency only for the statistics overlay.
    if (decodeUnit->frameHostProcessingLatency != 0) {
      if (m_ActiveWndVideoStats.minHostProcessingLatency != 0) {
        m_ActiveWndVideoStats.minHostProcessingLatency =
          MIN(m_ActiveWndVideoStats.minHostProcessingLatency, decodeUnit->frameHostProcessingLatency);
      } else {
        m_ActiveWndVideoStats.minHostProcessingLatency = decodeUnit->frameHostProcessingLatency;
      }
      m_ActiveWndVideoStats.framesWithHostProcessingLatency += 1;
    }

    m_ActiveWndVideoStats.maxHostProcessingLatency =
      MAX(m_ActiveWndVideoStats.maxHostProcessingLatency, decodeUnit->frameHostProcessingLatency);
    m_ActiveWndVideoStats.totalHostProcessingLatency += decodeUnit->frameHostProcessingLatency;
    m_ActiveWndVideoStats.receivedFrames++;
    m_ActiveWndVideoStats.totalFrames++;
  }

  // Create an ElementaryMediaPacket and start decoding with the decoded video data
  samsung::wasm::ElementaryMediaPacket pkt {
    s_pktPts, // presentation timestamp
    s_pktPts, // decoding timestamp
    s_frameDuration, // packet duration
    decodeUnit->frameType == FRAME_TYPE_IDR, // packet of frame type
    offset, // packet size
    s_DecodeBuffer.data(), // pointer to packet payload
    s_Width, // packet of width
    s_Height, // packet of height
    s_Framerate, // packet of framerate numerator
    1, // packet of framerate denominator
    g_Instance->m_VideoSessionId.load() // session identifier
  };

  if (collectPerformanceStats) {
    // Track time spent reassembling and decoding this frame.
    m_ActiveWndVideoStats.totalReassemblyTime +=
      (uint32_t)MAX(0, (int32_t)((decodeUnit->enqueueTimeUs - decodeUnit->receiveTimeUs) / 1000));
    m_ActiveWndVideoStats.totalDecodeTime +=
      (uint32_t)MAX(0, (int32_t)((LiGetMicroseconds() - decodeUnit->enqueueTimeUs) / 1000));
    m_ActiveWndVideoStats.decodedFrames++;
  }

  // Attempt to append the packet to the video track for rendering.
  uint32_t beforeRender = 0;
  if (collectPerformanceStats) {
    beforeRender = LiGetMillis();
  }

  if (g_Instance->m_VideoTrack.AppendPacket(pkt)) {
    // Increment packet timestamp for next frame.
    s_pktPts += s_frameDuration;
    if (collectPerformanceStats) {
      const uint32_t afterRender = LiGetMillis();
      m_ActiveWndVideoStats.totalRenderTime += afterRender - beforeRender;
      m_ActiveWndVideoStats.renderedFrames++;
    }
  } else {
    ClLogMessage("Append video packet failed\n");
    return DR_NEED_IDR;
  }

  return DR_OK;
}

void MoonlightInstance::AddVideoStats(VIDEO_STATS& src, VIDEO_STATS& dst) {
  // Statistics are best-effort diagnostics. Missing or inconsistent measurements
  // must never abort the video callback or affect the streaming session.
  dst.receivedFrames += src.receivedFrames;
  dst.decodedFrames += src.decodedFrames;
  dst.renderedFrames += src.renderedFrames;
  dst.totalFrames += src.totalFrames;
  dst.networkDroppedFrames += src.networkDroppedFrames;
  dst.totalReassemblyTime += src.totalReassemblyTime;
  dst.totalDecodeTime += src.totalDecodeTime;
  dst.totalPacerTime += src.totalPacerTime;
  dst.totalRenderTime += src.totalRenderTime;

  if (src.minHostProcessingLatency != 0) {
    dst.minHostProcessingLatency = dst.minHostProcessingLatency == 0
      ? src.minHostProcessingLatency
      : MIN(dst.minHostProcessingLatency, src.minHostProcessingLatency);
  }
  dst.maxHostProcessingLatency = MAX(dst.maxHostProcessingLatency, src.maxHostProcessingLatency);
  dst.totalHostProcessingLatency += src.totalHostProcessingLatency;
  dst.framesWithHostProcessingLatency += src.framesWithHostProcessingLatency;

  uint32_t rtt = 0;
  uint32_t rttVariance = 0;
  if (LiGetEstimatedRttInfo(&rtt, &rttVariance) && rtt > 0) {
    dst.lastRtt = rtt;
    dst.lastRttVariance = rttVariance;
  } else {
    dst.lastRtt = 0;
    dst.lastRttVariance = 0;
  }

  const uint32_t now = LiGetMillis();
  if (dst.measurementStartTimestamp == 0 ||
      (src.measurementStartTimestamp != 0 &&
       src.measurementStartTimestamp < dst.measurementStartTimestamp)) {
    dst.measurementStartTimestamp = src.measurementStartTimestamp;
  }

  const uint32_t elapsedMs = dst.measurementStartTimestamp != 0 &&
    now >= dst.measurementStartTimestamp ? now - dst.measurementStartTimestamp : 0;
  if (elapsedMs > 0) {
    const float elapsedSeconds = static_cast<float>(elapsedMs) / 1000.0f;
    dst.totalFps = static_cast<float>(dst.totalFrames) / elapsedSeconds;
    dst.receivedFps = static_cast<float>(dst.receivedFrames) / elapsedSeconds;
    dst.decodedFps = static_cast<float>(dst.decodedFrames) / elapsedSeconds;
    dst.renderedFps = static_cast<float>(dst.renderedFrames) / elapsedSeconds;
  } else {
    dst.totalFps = dst.receivedFps = dst.decodedFps = dst.renderedFps = 0.0f;
  }
}

void MoonlightInstance::FormatVideoStats(VIDEO_STATS& stats, char* output, int length) {
  if (output == nullptr || length <= 0) {
    return;
  }
  output[0] = '\0';
  int offset = 0;

  // Append each row independently. A formatting/buffer problem only truncates
  // the diagnostic text; it never propagates into video/session control.
  auto append = [&](const char* format, auto... args) -> bool {
    if (offset < 0 || offset >= length) {
      return false;
    }
    const int remaining = length - offset;
    const int written = snprintf(output + offset, static_cast<size_t>(remaining), format, args...);
    if (written < 0 || written >= remaining) {
      output[length - 1] = '\0';
      return false;
    }
    offset += written;
    return true;
  };

  const char* codecString = "UNKNOWN";
  std::string codecStringStorage;
  switch (s_VideoFormat) {
    case VIDEO_FORMAT_H264:
      codecStringStorage = s_H264LevelName.empty() ? "H.264" : "H.264 L" + s_H264LevelName;
      codecString = codecStringStorage.c_str();
      break;
    case VIDEO_FORMAT_H265:
      codecString = "HEVC";
      break;
    case VIDEO_FORMAT_H265_MAIN10:
      codecString = LiGetCurrentHostDisplayHdrMode() ? "HEVC 10-bit HDR" : "HEVC 10-bit SDR";
      break;
    case VIDEO_FORMAT_AV1_MAIN8:
      codecString = "AV1";
      break;
    case VIDEO_FORMAT_AV1_MAIN10:
      codecString = LiGetCurrentHostDisplayHdrMode() ? "AV1 10-bit HDR" : "AV1 10-bit SDR";
      break;
    default:
      // An unknown negotiated format is a display value, not a fatal error.
      break;
  }

  const bool audioStreamEnabled =
    g_Instance != nullptr && g_Instance->m_AudioBackend != AudioBackend::Disabled;
  const bool ac3Negotiated = audioStreamEnabled && LiIsAc3AudioNegotiated();
  const bool eac3Negotiated = audioStreamEnabled && LiIsEac3AudioNegotiated();
  const char* audioCodecString = eac3Negotiated ? "E-AC-3" : (ac3Negotiated ? "AC-3" : "OPUS");
  int audioChannels = 0;
  const char* audioLayoutString = "-";
  if (audioStreamEnabled && g_Instance != nullptr) {
    const int configuredChannels = CHANNEL_COUNT_FROM_AUDIO_CONFIGURATION(g_Instance->m_AudioConfig);
    switch (configuredChannels) {
      case 2: audioChannels = 2; audioLayoutString = "Stereo"; break;
      case 6: audioChannels = 6; audioLayoutString = "5.1"; break;
      case 8: audioChannels = 8; audioLayoutString = "7.1"; break;
      default: break;
    }
  }

  if (stats.receivedFps > 0 && std::isfinite(stats.receivedFps)) {
    append("Video stream: %dx%d %.2f FPS (Codec: %s)\n",
      s_Width > 0 ? s_Width : 0, s_Height > 0 ? s_Height : 0,
      std::isfinite(stats.totalFps) && stats.totalFps >= 0 ? stats.totalFps : 0.0,
      codecString);

    if (audioStreamEnabled && audioChannels > 0 &&
        std::isfinite(stats.receivedAudioBitrateKbps) && stats.receivedAudioBitrateKbps >= 0) {
      append("Audio stream: %s (%s, %d channels, %.0f kbps)\n",
        audioCodecString, audioLayoutString, audioChannels, stats.receivedAudioBitrateKbps);
    } else {
      append("Audio stream: -\n");
    }

    if (!audioStreamEnabled) {
      append("Decoding mode: -\n");
    } else if (ac3Negotiated || eac3Negotiated) {
      const bool hasDecodingMode = samsung::wasm::EmssVersionInfo::Create().has_decoding_mode;
      const char* mode = "Hardware";
      if (hasDecodingMode && g_Instance != nullptr) {
        if (g_Instance->m_DolbyDecodingMode == "HardwareWithFallback") mode = "Automatic";
        else if (g_Instance->m_DolbyDecodingMode == "Software") mode = "Software";
      }
      append("Decoding mode: %s\n", mode);
    }

    if (audioStreamEnabled) {
      append("Audio FEC: %u recovered · %u failed · %u out-of-order\n",
        s_AudioFecWindowStats.recoveredPackets,
        s_AudioFecWindowStats.failedBlocks,
        s_AudioFecWindowStats.outOfOrderPackets);
    } else {
      append("Audio FEC: -\n");
    }

    char receivedFps[24], decodedFps[24], renderedFps[24];
    snprintf(receivedFps, sizeof(receivedFps), "%.2f",
      std::isfinite(stats.receivedFps) && stats.receivedFps >= 0 ? stats.receivedFps : 0.0);
    snprintf(decodedFps, sizeof(decodedFps), "%.2f",
      std::isfinite(stats.decodedFps) && stats.decodedFps >= 0 ? stats.decodedFps : 0.0);
    snprintf(renderedFps, sizeof(renderedFps), "%.2f",
      std::isfinite(stats.renderedFps) && stats.renderedFps >= 0 ? stats.renderedFps : 0.0);
    append("Frame rates: %s Recv | %s Dec | %s Rend\n",
      receivedFps, decodedFps, renderedFps);

    if (std::isfinite(stats.receivedBitrate) && stats.receivedBitrate >= 0) {
      append("Incoming bitrate from network: %.2f Mbps\n", stats.receivedBitrate);
    } else {
      append("Incoming bitrate from network: -\n");
    }
  }

  if (stats.renderedFrames != 0) {
    char rttBuffer[64];
    const char* rttString = "N/A";
    if (stats.lastRtt > 0) {
      snprintf(rttBuffer, sizeof(rttBuffer), "%u ms (variance: %u ms)",
        stats.lastRtt, stats.lastRttVariance);
      rttString = rttBuffer;
    }

    if (stats.totalFrames > 0) {
      append("Frames dropped by your network connection: %.2f%%\n",
        100.0 * static_cast<double>(stats.networkDroppedFrames) /
        static_cast<double>(stats.totalFrames));
    } else {
      append("Frames dropped by your network connection: -\n");
    }
    append("Average network latency: %s\n", rttString);

    if (stats.decodedFrames > 0) {
      append("Average decoding time: %.2f ms\n",
        static_cast<double>(stats.totalDecodeTime) / stats.decodedFrames);
    } else {
      append("Average decoding time: -\n");
    }
    if (stats.renderedFrames > 0) {
      append("Average frame queue delay: %.2f ms\n",
        static_cast<double>(stats.totalPacerTime) / stats.renderedFrames);
      append("Average rendering time: %.2f ms\n",
        static_cast<double>(stats.totalRenderTime) / stats.renderedFrames);
    } else {
      append("Average frame queue delay: -\n");
      append("Average rendering time: -\n");
    }
  }
}

void MoonlightInstance::TogglePerformanceStats() {
  // Toggle the performance stats flag atomically; the video callback reads it on another thread.
  const bool enabled = !m_PerformanceStatsEnabled.load(std::memory_order_relaxed);
  m_PerformanceStatsEnabled.store(enabled, std::memory_order_relaxed);

  // Show an empty overlay immediately when enabled. Fresh measurements arrive on the next stats tick.
  if (enabled) {
    PostToJs(std::string("StatMsg: "));
  } else {
    PostToJs(std::string("NoStatMsg: "));
  }
}

bool MoonlightInstance::WaitFor(std::condition_variable* variable, std::function<bool()> condition, std::chrono::milliseconds timeout) {
  std::unique_lock<std::mutex> lock(m_Mutex);
  variable->wait_for(lock, timeout, [&]() { return m_ConnectionCancelled.load() || condition(); });
  return !m_ConnectionCancelled.load() && condition();
}

int MoonlightInstance::MediaSetupWaitFailed(const char* step) {
  if (g_Instance->m_ConnectionCancelled) {
    ClLogMessage("Connection cancelled during %s wait\n", step);
    return -1;
  }
  ClLogMessage("Timed out after %lld ms during %s wait\n", (long long)kMediaSetupTimeout.count(), step);
  return ERROR_VIDEO_SETUP_FAILED;
}

DECODER_RENDERER_CALLBACKS MoonlightInstance::s_DrCallbacks = {
  .setup = MoonlightInstance::VidDecSetup,
  .cleanup = MoonlightInstance::VidDecCleanup,
  .submitDecodeUnit = MoonlightInstance::VidDecSubmitDecodeUnit,
  .capabilities = CAPABILITY_SLICES_PER_FRAME(4),
};
