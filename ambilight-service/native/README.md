# Legacy native Ambilight experiment

This directory contains an earlier C ServiceApp experiment. It is **not** the active Ambilight implementation and is **not** included by the current hybrid build.

The active service is the original Tizen .NET `ServiceApplication` in the parent `ambilight-service/` directory. GitHub Actions builds that project as a .NET TPK and attempts to package it with Moonlight Web/WASM as one hybrid WGT.

Do not change the workflow to compile this C implementation unless the .NET Tizen service is proven impossible to include in the hybrid WGT and that architectural change is explicitly agreed.
