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
        bridge-utils \
        build-essential \
        ccache \
        cpio \
        docker.io \
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
        libxi6 \
        libsdl1.2debian \
        libv4l-0 \
        libxcb-icccm4 \
        libxcb-image0 \
        libxcb-render-util0 \
        libxcb-shape0 \
        ninja-build \
        nodejs \
        openvpn \
        python2 \
        python3 \
        python3.8 \
        rpm2cpio \
        unzip \
        zip \
        xmlsec1 \
    && ln -sf /usr/bin/python2 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

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
        "NativeCLI,TIZEN-9.0-WebAppDevelopment-CLI,TIZEN-10.0,TV-SAMSUNG-Public,TV-SAMSUNG-Public-WebAppDevelopment,TV-SAMSUNG-Extension-Tools,TV-SAMSUNG-Extension-Resources" \
    && "$pm" show-pkgs --tree | tee /tmp/tizen-installed-packages.txt \
    && for package in NativeCLI TIZEN-9.0-WebAppDevelopment-CLI TIZEN-10.0 TV-SAMSUNG-Public TV-SAMSUNG-Public-WebAppDevelopment TV-SAMSUNG-Extension-Tools TV-SAMSUNG-Extension-Resources; do \
         awk -v package="$package" '$1 == "i" && $2 == package { found=1 } END { exit !found }' /tmp/tizen-installed-packages.txt \
         || { echo "Required Tizen package missing: $package" >&2; exit 1; }; \
       done \
    && test -x "$TIZEN_STUDIO/tools/ide/bin/tizen" \
    && test -x "$TIZEN_STUDIO/tools/tizen-core/tz" \
    && rm -f "$installer" /tmp/tizen-extra-repositories.txt /tmp/tizen-installed-packages.txt

USER root
ENV HOME=/root

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
    && test -d /usr/share/dotnet/packs/Samsung.Tizen.Ref.API13 \
    && /usr/share/dotnet/dotnet workload list | grep -i tizen

RUN chmod -R a+rX /home/tizen/tizen-studio

# Tizen Studio and package-manager files are shared and immutable at runtime.
# Profiles, certificates and user data must be created per workflow execution.
ENV TIZEN_STUDIO_DATA_PATH=/tmp/tizen-studio-data
WORKDIR /workspace
