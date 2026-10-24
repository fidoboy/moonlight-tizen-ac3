# Generate the animated native Samsung TV splash in a tool-only stage.
FROM ubuntu:22.04 AS splash
RUN apt-get update && apt-get install -y --no-install-recommends librsvg2-bin fonts-dejavu-core python3 && rm -rf /var/lib/apt/lists/*
COPY res/launch-screen.svg /tmp/launch-screen.svg
COPY res/generate-launch-screen.py /tmp/generate-launch-screen.py
COPY wasm/static/res/ic_dolby_double_d.svg /tmp/ic_dolby_double_d.svg
RUN python3 /tmp/generate-launch-screen.py --template /tmp/launch-screen.svg --dolby-logo /tmp/ic_dolby_double_d.svg --static-svg /tmp/launch-screen-final.svg --orientation landscape --static-only && \
    python3 /tmp/generate-launch-screen.py --template /tmp/launch-screen.svg --dolby-logo /tmp/ic_dolby_double_d.svg --static-svg /tmp/launch-screen-portrait-final.svg --orientation portrait --static-only && \
    rsvg-convert -w 1920 -h 1080 --format png -o /tmp/launch-screen.png /tmp/launch-screen-final.svg && \
    rsvg-convert -w 1080 -h 1920 --format png -o /tmp/launch-screen-portrait.png /tmp/launch-screen-portrait-final.svg && \
    test "$(stat -c %s /tmp/launch-screen.png)" -lt 204800 && \
    test "$(stat -c %s /tmp/launch-screen-portrait.png)" -lt 204800
COPY generated-videos/launch-screen.mp4 /tmp/launch-screen.mp4
COPY generated-videos/launch-screen-portrait.mp4 /tmp/launch-screen-portrait.mp4
COPY generated-videos/stream-transition-background.mp4 /tmp/stream-transition-background.mp4
RUN test -s /tmp/launch-screen.mp4 && \
    test -s /tmp/launch-screen-portrait.mp4 && \
    test -s /tmp/stream-transition-background.mp4
FROM ubuntu:22.04 AS sdk

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# Install required packages and dependencies
RUN apt-get update && apt-get install -y \
	cmake \
	ccache \
	expect \
	git \
	ninja-build \
	python2 \
	unzip \
	aria2 \
	&& rm -rf /var/lib/apt/lists/*

# Some of the Samsung Tizen scripts refer to `python`, but Ubuntu only provides `/usr/bin/python2`
RUN ln -sf /usr/bin/python2 /usr/bin/python

# Create a non-root user and set up the working directory
RUN useradd -m -s /bin/bash moonlight
USER moonlight
WORKDIR /home/moonlight

# Install Tizen Studio CLI and configure the toolchain path
RUN aria2c -x 5 -s 5 -o web-cli_Tizen_Studio_6.1_ubuntu-64.bin 'https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-cli_Tizen_Studio_6.1_ubuntu-64.bin'
RUN chmod a+x web-cli_Tizen_Studio_6.1_ubuntu-64.bin
RUN ./web-cli_Tizen_Studio_6.1_ubuntu-64.bin --accept-license /home/moonlight/tizen-studio
ENV PATH=/home/moonlight/tizen-studio/tools/ide/bin:/home/moonlight/tizen-studio/tools:${PATH}

FROM sdk AS base

# Prepare the Tizen certificate and security profiles for signing the application package
RUN tizen certificate \
	-a Moonlight \
	-f Moonlight \
	-p 123456
RUN tizen security-profiles add \
	-n Moonlight \
	-a /home/moonlight/tizen-studio-data/keystore/author/Moonlight.p12 \
	-p 123456

# Workaround to package applications without gnome-keyring
# These steps must be repeated each time before packaging an application
# See: <https://developer.tizen.org/forums/sdk-ide/pwd-fle-format-profile.xml-certificates> for more details
RUN sed -i 's|/home/moonlight/tizen-studio-data/keystore/author/Moonlight.pwd||' /home/moonlight/tizen-studio-data/profile/profiles.xml
RUN sed -i 's|/home/moonlight/tizen-studio-data/tools/certificate-generator/certificates/distributor/tizen-distributor-signer.pwd|tizenpkcs12passfordsigner|' /home/moonlight/tizen-studio-data/profile/profiles.xml

# Install Samsung Emscripten SDK and configure Java path for closure compiler
RUN aria2c -x 5 -s 5 -o emscripten-1.39.4.7-linux64.zip 'https://developer.samsung.com/smarttv/file/a5013a65-af11-4b59-844f-2d34f14d19a9'
RUN unzip emscripten-1.39.4.7-linux64.zip

# Replace deprecated OpenSSL download URL in Emscripten SDK ports to prevent build failure caused by invalid upstream path
RUN sed -i 's|https://www.openssl.org/source/old/1.1.1/openssl-|https://github.com/openssl/openssl/releases/download/OpenSSL_1_1_1d/openssl-|g' \
/home/moonlight/emscripten-release-bundle/emsdk/fastcomp/emscripten/tools/ports/tizen/ssl.py
RUN sed -i 's|https://www.openssl.org/source/old/1.1.1/openssl-|https://github.com/openssl/openssl/releases/download/OpenSSL_1_1_1d/openssl-|g' \
/home/moonlight/emscripten-release-bundle/emsdk/fastcomp/emscripten/tools/ports/tizen/crypto.py

# Activate the Emscripten SDK to set up the environment variables for compiling the application
WORKDIR emscripten-release-bundle/emsdk
RUN ./emsdk activate latest-fastcomp

# Copy only the backend files required for compiling the application
WORKDIR /home/moonlight
COPY --chown=moonlight CMakeLists.txt ./moonlight-tizen/
COPY --chown=moonlight h264bitstream ./moonlight-tizen/h264bitstream/
COPY --chown=moonlight libgamestream ./moonlight-tizen/libgamestream/
COPY --chown=moonlight moonlight-common-c ./moonlight-tizen/moonlight-common-c/
COPY --chown=moonlight opus ./moonlight-tizen/opus/
COPY --chown=moonlight ports ./moonlight-tizen/ports/ 
COPY --chown=moonlight wasm/*.c ./moonlight-tizen/wasm/
COPY --chown=moonlight wasm/*.cpp ./moonlight-tizen/wasm/
COPY --chown=moonlight wasm/*.hpp ./moonlight-tizen/wasm/
COPY --chown=moonlight wasm/dispatcher ./moonlight-tizen/wasm/dispatcher/

RUN cmake \
	-DCMAKE_TOOLCHAIN_FILE=/home/moonlight/emscripten-release-bundle/emsdk/fastcomp/emscripten/cmake/Modules/Platform/Emscripten.cmake \
	-DCMAKE_C_COMPILER_LAUNCHER=ccache \
	-DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
	-G Ninja \
	-S moonlight-tizen \
	-B build
RUN --mount=type=cache,target=/home/moonlight/.ccache,uid=1000,gid=1000 \
	--mount=type=cache,target=/home/moonlight/.emscripten_cache,uid=1000,gid=1000 \
	--mount=type=cache,target=/home/moonlight/.emscripten_ports,uid=1000,gid=1000 \
	CCACHE_DIR=/home/moonlight/.ccache cmake --build build

# Copy the remaining frontend files required for packaging the application
COPY --chown=moonlight res/ ./moonlight-tizen/res/
COPY --chown=moonlight wasm/index.html ./moonlight-tizen/wasm/
COPY --chown=moonlight wasm/platform/ ./moonlight-tizen/wasm/platform/
COPY --chown=moonlight wasm/static/ ./moonlight-tizen/wasm/static/
COPY --from=splash /tmp/stream-transition-background.mp4 ./moonlight-tizen/wasm/static/stream-transition-background.mp4
COPY --chown=moonlight .gi[t]/ ./moonlight-tizen/.git/

# The following steps inject build metadata into the application such as build type, short commit SHA, and repository information by replacing placeholders in the `wasm/platform/index.js` file.
# Only builds published by the stable-release workflow are treated as official; all other builds are marked experimental.
ARG BUILD_TYPE=release
ARG OFFICIAL_RELEASE=false
ARG REPO_OWNER
ARG REPO_NAME
RUN \
    # Always inject the build type, repo owner, and repo name regardless of the build type
	sed -i "s/__BUILD_TYPE__/$BUILD_TYPE/g" moonlight-tizen/wasm/platform/index.js && \
    sed -i "s/__OFFICIAL_RELEASE__/$OFFICIAL_RELEASE/g" moonlight-tizen/wasm/platform/index.js && \
    if [ -n "$REPO_OWNER" ]; then \
        sed -i "s/__REPO_OWNER__/$REPO_OWNER/g" moonlight-tizen/wasm/platform/index.js; \
    fi && \
    if [ -n "$REPO_NAME" ]; then \
        sed -i "s/__REPO_NAME__/$REPO_NAME/g" moonlight-tizen/wasm/platform/index.js; \
    fi && \
	echo "Injected base metadata: build type ($BUILD_TYPE), repo owner ($REPO_OWNER), repo name ($REPO_NAME)"; \
    \
    # Conditionally inject the short commit SHA only if it's a development build
    if [ "$BUILD_TYPE" = "development" ]; then \
        SHORT_SHA=""; \
        if [ -d "moonlight-tizen/.git" ]; then \
            SHORT_SHA=$(git -C moonlight-tizen rev-parse --short HEAD); \
        fi; \
        if [ -n "$SHORT_SHA" ]; then \
            sed -i "s/__BUILD_COMMIT__/$SHORT_SHA/g" moonlight-tizen/wasm/platform/index.js; \
        fi; \
		echo "Injected development commit hash ($SHORT_SHA)"; \
    else \
        echo "Build type is release, skipping commit hash injection."; \
    fi

RUN cmake --install build --prefix build
COPY --chown=moonlight tools/patch-embind-string.js ./moonlight-tizen/tools/
RUN /home/moonlight/emscripten-release-bundle/emsdk/node/12.9.1_64bit/bin/node moonlight-tizen/tools/patch-embind-string.js build/widget/moonlight-wasm.js
COPY --from=splash /tmp/launch-screen.png build/widget/static/res/launch-screen.png
COPY --from=splash /tmp/launch-screen.mp4 build/widget/static/res/launch-screen.mp4
COPY --from=splash /tmp/launch-screen-portrait.png build/widget/static/res/launch-screen-portrait.png
COPY --from=splash /tmp/launch-screen-portrait.mp4 build/widget/static/res/launch-screen-portrait.mp4
RUN cp moonlight-tizen/res/icon.png build/widget/

# Inject Game Mode metadata into the Tizen config.xml file, which is required for building the ForceGM variant later
ARG FORCE_GAME_MODE=false
RUN if [ "$FORCE_GAME_MODE" = "true" ]; then \
		sed -i 's|<tizen:metadata key="http://samsung.com/tv/metadata/use.voiceguide"|<tizen:metadata key="http://samsung.com/tv/metadata/use.game.mode" value="true"/>\n    <tizen:metadata key="http://samsung.com/tv/metadata/use.voiceguide"|' build/widget/config.xml && \
		grep -q 'use.game.mode' build/widget/config.xml && \
		echo "Game Mode metadata injected into config.xml (ForceGM variant)"; \
	else \
		echo "No Game Mode metadata injected into config.xml (Standard variant)"; \
	fi

# Sign and package the application into a WGT file using Expect to automate the interactive password prompts
RUN echo \
	'set timeout -1\n' \
	'spawn tizen package -t wgt -- build/widget\n' \
	'expect "Author password:"\n' \
	'send -- "123456\\r"\n' \
	'expect "Yes: (Y), No: (N) ?"\n' \
	'send -- "N\\r"\n' \
	'expect eof\n' \
| expect

# Rename the output WGT file by appending a suffix for the ForceGM variant, or leave without a suffix for the Standard variant
RUN if [ "$FORCE_GAME_MODE" = "true" ]; then SUFFIX="-ForceGM"; else SUFFIX=""; fi; \
	mv build/widget/Moonlight.wgt "Moonlight${SUFFIX}.wgt" && ls -la *.wgt

# Clean up unnecessary files to reduce image size
RUN rm -rf \
	build \
	moonlight-tizen \
	web-cli_Tizen_Studio_6.1_ubuntu-64.bin \
	tizen-package-expect.sh \
	.package-manager \
	emscripten-1.39.4.7-linux64.zip \
	emscripten-release-bundle \
	.emscripten \
	.emscripten_cache \
	.emscripten_cache.lock \
	.emscripten_ports \
	.emscripten_sanity

# Use a multi-stage build to reclaim space from deleted files
FROM ubuntu:22.04
COPY --from=base / /
USER moonlight
WORKDIR /home/moonlight

# Add Tizen Studio tools to PATH environment variable
ENV PATH=/home/moonlight/tizen-studio/tools/ide/bin:/home/moonlight/tizen-studio/tools:${PATH}
