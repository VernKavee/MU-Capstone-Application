// PDPA consent (NFR4). Bump the version when any text changes; users must re-consent.
export const CONSENT_VERSION = 1;

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
  {
    kind: "profile",
    title: "Storing your profile including medical history",
    text: "Your name, age, gender, weight, height, and medical history are stored and given to the coaching feedback so its advice respects your body and any injury or condition.",
  },
] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number]["kind"];
