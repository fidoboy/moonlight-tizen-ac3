FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC \
    TIZEN_STUDIO=/home/tizen/tizen-studio \
    DOTNET_ROOT=/usr/share/dotnet \
    PATH=/home/tizen/tizen-studio/tools/ide/bin:/home/tizen/tizen-studio/tools:/home/tizen/tizen-studio/tools/tizen-core:/usr/share/dotnet:${PATH}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Shared Linux dependencies for Tizen Studio, Samsung TV extensions,
# Tizen Core packaging, the .NET service build and Moonlight's build image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends software-properties-common ca-certificates curl wget gnupg \
    && add-apt-repository -y universe \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && curl --fail --location --retry 3 https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        acl \
        aria2 \
        binutils \
        build-essential \
        ccache \
        cpio \
        cmake \
        expect \
        file \
        gettext \
        git \
        libkchart2 \
        libkf5itemmodels5 \
        libkf5kiowidgets5 \
        libpixman-1-0 \
        libpython3.8 \
        libsdl1.2debian \
        libv4l-0 \
        bridge-utils \
        openvpn \
        libarchive-tools \
        librsvg2-bin \
        fonts-dejavu-core \
        libxml2-dev \
        openssl \
        libxi6 \
        libxcb-icccm4 \
        libxcb-image0 \
        libxcb-render-util0 \
        libxcb-shape0 \
        ninja-build \
        nodejs \
        python2 \
        python3 \
        python3.8 \
        rpm2cpio \
        unzip \
        zip \
        xmlsec1 \
    && ln -sf /usr/bin/python2 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

# WMP's native Tizen ARM build inputs are part of this image, not a
# separately provisioned build environment. Keep the GCC 6.2 cross-toolchain,
# Tizen 5.5 ARM sysroot and framework headers/libraries under one stable path.
COPY wmp/engine/build/fetch-tizen-sources.sh /opt/wmp-build/fetch-tizen-sources.sh
COPY wmp/engine/build/build-static-crypto.sh /opt/wmp-build/build-static-crypto.sh
RUN chmod 0755 /opt/wmp-build/fetch-tizen-sources.sh /opt/wmp-build/build-static-crypto.sh \
    && /opt/wmp-build/fetch-tizen-sources.sh /opt/wmp-tizen-deps \
    && mkdir -p /opt/wmp-backport-deps \
    && find /opt/wmp-tizen-deps/toolchain -type f -name arm-linux-gnueabi-gcc -perm -u+x -print -quit | grep -q . \
    && find /opt/wmp-tizen-deps/sysroot/usr/include -type f -name service_app.h -print -quit | grep -q . \
    && find /opt/wmp-tizen-deps/sysroot/usr/include -type f -name message_port.h -print -quit | grep -q . \
    && find /opt/wmp-tizen-deps/sysroot/usr/include -type f -name dlog.h -print -quit | grep -q .

ENV WMP_DEPS=/opt/wmp-tizen-deps \
    WMP_BACKPORT_DEPS=/opt/wmp-backport-deps

# .NET 8 is needed to build the Tizen service TPK in both workflows.
RUN curl --fail --location --retry 3 https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet \
    && ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && rm -f /tmp/dotnet-install.sh \
    && dotnet --list-sdks | grep -E '^8\.'

# The Tizen installer explicitly refuses to run as root. Install the SDK
# as a dedicated unprivileged user; the runtime image remains root by default.
# The Tizen installer requires the destination itself not to exist.
RUN useradd --create-home --uid 1001 --shell /bin/bash tizen
USER tizen
ENV HOME=/home/tizen

# Install Tizen Studio 6.1 and the union of packages needed by diagnostic
# (Tizen 10 / Samsung TV) and production (Tizen Core / Tizen 9 Web CLI).
RUN installer=/tmp/tizen-web-cli.bin \
    && curl --fail --location --retry 3 \
        https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-cli_Tizen_Studio_6.1_ubuntu-64.bin \
        --output "$installer" \
    && chmod +x "$installer" \
    && test ! -e "$TIZEN_STUDIO" \
    && "$installer" --accept-license "$TIZEN_STUDIO" \
    && pm="$(find "$TIZEN_STUDIO" -type f -name 'package-manager-cli*' -perm -u+x -print -quit)" \
    && test -n "$pm" \
    && "$pm" extra --list | tee /tmp/tizen-extra-repositories.txt \
    && grep -Fq "Samsung Tizen TV SDK" /tmp/tizen-extra-repositories.txt \
    && "$pm" install --accept-license --no-java-check \
        "TIZEN-9.0-WebAppDevelopment-CLI,TIZEN-10.0-WebAppDevelopment-CLI,TV-SAMSUNG-Public-WebAppDevelopment,TV-SAMSUNG-Extension-Tools,TV-SAMSUNG-Extension-Resources" \
    && "$pm" show-pkgs --tree | tee /tmp/tizen-installed-packages.txt \
    && for package in TIZEN-9.0-WebAppDevelopment-CLI TIZEN-10.0-WebAppDevelopment-CLI TV-SAMSUNG-Public-WebAppDevelopment TV-SAMSUNG-Extension-Tools TV-SAMSUNG-Extension-Resources; do \
         awk -v package="$package" '$1 == "i" && $2 == package { found=1 } END { exit !found }' /tmp/tizen-installed-packages.txt \
         || { echo "Required Tizen package missing: $package" >&2; exit 1; }; \
       done \
    && for package in TIZEN-10.0 TIZEN-10.0-Emulator TIZEN-10.0-NativeAppDevelopment TIZEN-10.0-NativeAppDevelopment-CLI TV-SAMSUNG-Public TV-SAMSUNG-Public-Emulator; do \
         if awk -v package="$package" '$1 == "i" && $2 == package { found=1 } END { exit !found }' /tmp/tizen-installed-packages.txt; then \
           echo "Unexpected Tizen package installed: $package" >&2; exit 1; \
         fi; \
       done \
    && test -x "$TIZEN_STUDIO/tools/ide/bin/tizen" \
    && test -x "$TIZEN_STUDIO/tools/tizen-core/tz" \
    && rm -f "$installer" /tmp/tizen-extra-repositories.txt /tmp/tizen-installed-packages.txt \
    && chmod -R a+rX "$TIZEN_STUDIO"

USER root
ENV HOME=/root

# Samsung's pinned Emscripten 1.39.4.7 SDK is part of the shared image.
# Moonlight Web is built directly in this image; no secondary project Dockerfile.
RUN mkdir -p /opt \
    && aria2c -x 5 -s 5 -o /tmp/emscripten-1.39.4.7-linux64.zip \
        https://developer.samsung.com/smarttv/file/a5013a65-af11-4b59-844f-2d34f14d19a9 \
    && unzip -q /tmp/emscripten-1.39.4.7-linux64.zip -d /opt \
    && sed -i 's|https://www.openssl.org/source/old/1.1.1/openssl-|https://github.com/openssl/openssl/releases/download/OpenSSL_1_1_1d/openssl-|g' \
        /opt/emscripten-release-bundle/emsdk/fastcomp/emscripten/tools/ports/tizen/ssl.py \
        /opt/emscripten-release-bundle/emsdk/fastcomp/emscripten/tools/ports/tizen/crypto.py \
    && cd /opt/emscripten-release-bundle/emsdk \
    && ./emsdk activate latest-fastcomp \
    && rm -f /tmp/emscripten-1.39.4.7-linux64.zip \
    && test -f fastcomp/emscripten/cmake/Modules/Platform/Emscripten.cmake


# Install Samsung's official Tizen.NET workload for the .NET 8.0.400 SDK band.
# Pin the installer source and manifest version so image rebuilds are reproducible.
ARG SAMSUNG_TIZEN_NET_COMMIT=5294db5380c4e5fffdaaedcf1102d944096af926
ARG SAMSUNG_TIZEN_WORKLOAD_MANIFEST_VERSION=10.0.120
RUN curl --fail --location --retry 3 \
        "https://raw.githubusercontent.com/Samsung/Tizen.NET/${SAMSUNG_TIZEN_NET_COMMIT}/workload/scripts/workload-install.sh" \
        --output /tmp/workload-install.sh \
    && chmod 0755 /tmp/workload-install.sh \
    && /tmp/workload-install.sh --version "${SAMSUNG_TIZEN_WORKLOAD_MANIFEST_VERSION}" \
        --dotnet-install-dir /usr/share/dotnet \
    && rm -f /tmp/workload-install.sh \
    && test -f /usr/share/dotnet/sdk-manifests/8.0.400/samsung.net.sdk.tizen/WorkloadManifest.json \
    && test -d /usr/share/dotnet/packs/Samsung.Tizen.Ref/10.0.120 \
    && test -d /usr/share/dotnet/packs/Samsung.NETCore.App.Runtime.tizen/10.0.120 \
    && /usr/share/dotnet/dotnet workload list | grep -i tizen


# Tizen Studio and package-manager files are shared and immutable at runtime.
# Profiles, certificates and user data must be created per workflow execution.
ENV TIZEN_STUDIO_DATA_PATH=/tmp/tizen-studio-data
WORKDIR /workspace

# Install the autotools needed by cURL's source-tree buildconf without
# invalidating the earlier Tizen Studio and Emscripten image layers.
# Normalize the GCC 6.2 archive layout to the paths used by the WMP build scripts.
RUN set -euo pipefail \
    && apt-get update \
    && apt-get install -y --no-install-recommends autoconf automake libtool pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && tool_root=/opt/wmp-tizen-deps/toolchain \
    && tool_bin="$tool_root/data/tools/arm-linux-gnueabi-gcc-6.2/bin" \
    && mkdir -p "$tool_bin" \
    && for tool in gcc ar ranlib objdump; do \
         tool_source="$(find "$tool_root" -type f -name "arm-linux-gnueabi-$tool" -perm -u+x -print -quit)"; \
         test -n "$tool_source" \
         && tool_target="$tool_bin/arm-linux-gnueabi-$tool" \
         && { [[ "$tool_source" == "$tool_target" ]] || ln -sfn "$tool_source" "$tool_target"; }; \
       done \
    && test -x "$tool_bin/arm-linux-gnueabi-gcc" \
    && test -x "$tool_bin/arm-linux-gnueabi-ar" \
    && test -x "$tool_bin/arm-linux-gnueabi-ranlib" \
    && test -x "$tool_bin/arm-linux-gnueabi-objdump" \
    && git clone --depth 1 --branch OpenSSL_1_1_1d https://github.com/openssl/openssl.git /opt/wmp-backport-deps/openssl111 \
    && git clone --depth 1 --branch curl-7_59_0 https://github.com/curl/curl.git /opt/wmp-backport-deps/curl759 \
    && WMP_ARM_CC="$tool_bin/arm-linux-gnueabi-gcc" DEPS=/opt/wmp-tizen-deps BPD=/opt/wmp-backport-deps JOBS=2 bash /opt/wmp-build/build-static-crypto.sh \
    && test -s /opt/wmp-backport-deps/arm-static/lib/libcrypto.a \
    && test -s /opt/wmp-backport-deps/arm-static/lib/libssl.a \
    && test -s /opt/wmp-backport-deps/arm-static/lib/libcurl.a \
    && grep -q 'OPENSSL_VERSION_NUMBER.*0x101010' /opt/wmp-backport-deps/arm-static/include/openssl/opensslv.h \
    && grep -Eiq 'LIBCURL_VERSION_NUM[[:space:]]+0x073b00' /opt/wmp-backport-deps/arm-static/include/curl/curlver.h \
    && rm -rf /opt/wmp-backport-deps/openssl111 /opt/wmp-backport-deps/curl759 /opt/wmp-build
# Validate the complete shared toolchain inside the image build. Keeping these
# checks here avoids pulling/extracting this large image on the limited Actions
# runner filesystem after it has already been pushed to GHCR.
RUN set -euo pipefail \
    && tz --version \
    && /usr/share/dotnet/dotnet --list-sdks | grep -E '^8\.' \
    && test -d /usr/share/dotnet/packs/Samsung.Tizen.Ref/10.0.120 \
    && test -x /home/tizen/tizen-studio/tools/ide/bin/tizen \
    && if [[ -f /opt/emscripten-release-bundle/emsdk/emsdk_env.sh ]]; then \
         source /opt/emscripten-release-bundle/emsdk/emsdk_env.sh; \
       else \
         eval "$(/opt/emscripten-release-bundle/emsdk/emsdk construct_env)"; \
       fi \
    && emcc --version \
    && cmake --version \
    && ninja --version \
    && rsvg-convert --version \
    && for tool in arm-linux-gnueabi-gcc arm-linux-gnueabi-ar arm-linux-gnueabi-ranlib arm-linux-gnueabi-objdump; do \
         test -n "$(find /opt/wmp-tizen-deps/toolchain -type f -name "$tool" -perm -u+x -print -quit)"; \
       done \
    && test -n "$(find /opt/wmp-tizen-deps/sysroot/usr/include -type f -name service_app.h -print -quit)" \
    && find /opt/wmp-tizen-deps/sysroot/usr/include -type f -name message_port.h -print -quit | grep -q . \
    && find /opt/wmp-tizen-deps/sysroot/usr/include -type f -name dlog.h -print -quit | grep -q . \
    && test -s /opt/wmp-backport-deps/arm-static/lib/libcrypto.a \
    && test -s /opt/wmp-backport-deps/arm-static/lib/libssl.a \
    && test -s /opt/wmp-backport-deps/arm-static/lib/libcurl.a \
    && test -f /opt/wmp-backport-deps/arm-static/include/openssl/opensslv.h \
    && test -f /opt/wmp-backport-deps/arm-static/include/curl/curlver.h \
    && for tool in autoconf automake autoreconf libtoolize pkg-config; do command -v "$tool" >/dev/null; done \
    && test -x /opt/wmp-tizen-deps/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin/arm-linux-gnueabi-gcc \
    && test -x /opt/wmp-tizen-deps/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin/arm-linux-gnueabi-objdump \
    && bsdtar --version \
    && command -v rpm2cpio >/dev/null
