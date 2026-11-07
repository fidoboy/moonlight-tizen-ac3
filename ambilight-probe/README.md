# Ambilight capture probe for Samsung Tizen

This diagnostic is separate from Moonlight's streaming code. It packages a small web UI and a native Tizen C ServiceApp into one hybrid WGT, targeting the Tizen 6.0 TV rootstrap.

## Build

From the GitHub Actions tab, select **Build Ambilight capture probe** and run it on branch \`1.2.4-pre\`. Download the \`AmbilightProbe-Tizen6\` artifact and install \`AmbilightProbe-Tizen6.wgt\` using Apps2Samsung.

## Test

Open **Ambilight Probe** on the TV and select **Probar compatibilidad**. The native service performs one sample only:

1. Loads \`libvideoenhance.so\`.
2. Resolves one complete API family: \`cs_ve_*\`, \`ve_*\`, or \`ppi_ve_*\`.
3. Queries the measurement hardware and validates the returned limits.
4. Sets one measurement point and reads one RGB sample after the reported delay (at least 20 ms).

The report identifies the stage that failed, if any, and includes the hardware condition and RGB value. No continuous capture is started; no UDP/DDP packets are sent; no LEDs are controlled.

## Interpreting the result

- **Compatible** means the library loaded and the native API completed a real measurement read with plausible 10-bit RGB values.
- **Library** means the DSO could not be loaded.
- **Symbols** means none of the supported function families was fully exported.
- **Condition** means the API or SoC rejected the hardware capability query, or returned implausible limits.
- **Set position / Get pixel** means the hardware query worked but a measurement operation failed.

A negative result is specific to that TV, firmware and hardware combination. It does not rule out support on other Samsung models.

This test does **not** yet prove that the measurement follows Moonlight's decoded stream. That requires the next test while a Moonlight session is actively displaying video. No Moonlight runtime lifecycle or settings code is changed by this diagnostic.
