// Consent (NFR4). Bump the version when any text changes; users must re-consent.
// Version 2 (2026-11-11): the profile consent is gone with the medical history, and the PDPA
// work was dropped because its approval could not be had in time (docs/DECISIONS.md).
export const CONSENT_VERSION = 2;

export const CONSENT_KINDS = [
  {
    kind: "camera",
    title: "Camera access with on-device processing",
    text: "The camera image is processed on this device to find body landmarks and check your form. No camera frame is sent to a server while you exercise.",
  },
  {
    kind: "recording",
    title: "Storing video and landmarks",
    text: "The video and the landmark file of each set are uploaded and kept in your history so you can review them. They are kept until the project ends and deleted earlier if you ask the team.",
  },
] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number]["kind"];
