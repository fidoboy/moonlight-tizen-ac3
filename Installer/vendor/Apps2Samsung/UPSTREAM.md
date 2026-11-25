# Apps2Samsung source provenance

Selected upstream project: https://github.com/Apps2Samsung/Apps2Samsung  
Selected upstream ref: `beta`  
Pinned source commit: `aae32ed4ea762bef3f6310f2f65aeb16752f8e78`  
License: GPL-3.0-only (upstream versions after v3.2.1).

The installer will vendor only the components needed for:
- Samsung account OAuth/browser callback and certificate provisioning;
- Tizen author/distributor certificate profile persistence and renewal;
- Tizen WGT signing;
- TV discovery, DUID retrieval and SDB installation.

Catalog, Jellyfin, remote-control, app-patching, update and mobile-specific features are out of scope.

Samsung/Tizen SDK binaries, signing materials and CA certificates distributed by upstream are third-party materials. They must be reviewed separately; the GPL license of Apps2Samsung does not relicense those materials.
