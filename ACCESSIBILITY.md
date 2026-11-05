# Accessibility Statement

Moonlight Tizen with AC-3 support aims to make its application, documentation, and project resources usable by as many people as possible. Accessibility feedback is welcome, and reported barriers will be considered as part of ongoing maintenance.

This statement describes the project's current approach and known limitations. It is not a claim of conformance with WCAG or any other accessibility standard.

## Scope

This statement covers:

- The Moonlight Tizen application interface and its interaction with supported Tizen TVs and remote controls.
- The project's documentation and information published for users and contributors.
- The public GitHub resources used to report problems and contribute to the project.

The accessibility of streamed games, desktop applications, host operating systems, third-party services, TV firmware, and other external content is outside the project's direct control.

## Interaction and supported environment

Moonlight Tizen is designed primarily for television use. Its interface is intended to be navigated with a TV remote control, using directional navigation and the remote's selection and back controls. A compatible game controller can be used for supported in-stream input; controller behavior depends on the device and the streamed application.

The project targets TVs running Tizen OS 5.5 or later. Actual behavior and available platform accessibility features vary by TV model, firmware, and Tizen version. The application has been tested on Samsung Tizen TVs, but accessibility behavior has not been comprehensively verified across all supported models.

## Accessibility considerations

The project aims to:

- Keep the main interface operable through the TV remote, without requiring a mouse.
- Provide visible selection and focus feedback during remote navigation.
- Use clear labels and consistent navigation patterns in settings and dialogs.
- Keep user-facing documentation structured with headings, lists, and descriptive links.
- Maintain interface translations for the languages supported by the application.

These are design intentions, not a statement that every screen or interaction has passed an accessibility audit. In particular, the project has not completed a systematic evaluation against WCAG 2.2 or an equivalent television-interface accessibility standard.

## Known limitations and areas not yet verified

The following limitations should be considered when evaluating accessibility:

- **Screen readers and spoken feedback:** Compatibility with Tizen screen readers, voice guides, and other assistive technologies has not been systematically tested. The project does not currently claim screen-reader compatibility.
- **Visual presentation:** A complete audit of text size, contrast, focus-indicator contrast, and readability at typical television viewing distances has not been performed.
- **Text resizing and reflow:** The application interface is designed for television screen layouts. Support for system-level text enlargement, magnification, or reflow has not been comprehensively verified.
- **Motion:** The interface includes animated transitions and optional animated backgrounds. The effect of these animations on people sensitive to motion has not been formally evaluated, and a comprehensive reduced-motion mode is not currently documented.
- **Platform differences:** Remote-control behavior, focus handling, audio guidance, and other accessibility capabilities can differ between Tizen versions, TV models, and firmware.
- **Streamed content:** The client cannot guarantee that games, desktop applications, or other content streamed from the host computer provide accessible controls, captions, audio description, or other accessibility features.

This list is not exhaustive. If you encounter another barrier, please report it.

## Reporting an accessibility issue

If you encounter an accessibility barrier in the application or project documentation, please report it through [GitHub Issues](https://github.com/fidoboy/moonlight-tizen-ac3/issues/new/choose). Select the Bug report form and make it clear that the report concerns accessibility.

Where possible, include:

- The Moonlight version.
- The TV model and Tizen version.
- The screen, control, or task affected.
- The steps needed to reproduce the problem.
- What happened and what you expected to happen.
- Any relevant screenshots or logs, after removing personal information and secrets.

You do not need to disclose a disability or medical information to report an issue. Please do not include passwords, pairing PINs, private keys, tokens, or other sensitive information in a public report.

The project currently provides GitHub Issues as its documented public reporting route; no separate private accessibility-reporting channel is specified.

## Contributions

Contributions that improve accessibility are welcome. When proposing a change, describe the user task it improves and the barrier it addresses. For interface changes, consider remote-only operation, clear focus feedback, readable text, sufficient contrast, consistent labels, and the needs of people using assistive technologies.

Please distinguish between checks that were actually performed and those that remain untested. Do not claim WCAG conformance or assistive-technology compatibility without appropriate evaluation and evidence.

For general contribution guidance, see the [project README](README.md) and the [Development Guide](docs/Development-Guide.md).

## Maintenance

This statement will be reviewed when relevant interface, platform, documentation, or reporting changes are made, and when significant accessibility feedback is received.

