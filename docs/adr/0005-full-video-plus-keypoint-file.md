---
status: accepted
---

# Full raw video plus a separate keypoint file per set

The report replays the recorded video in history level 4, and its diagram bakes the skeleton into the recording. The build plan doubted video could be stored at all. Each set stores two files, both uploaded straight from the browser to storage through a short-lived signed URL (NFR3): the raw camera video, and a keypoint file holding every frame's 33 landmarks with image coordinates, world coordinates, and visibility at capture rate. The skeleton is drawn over the video at playback from the keypoint file, never baked in. Both cover the same span, from the end of the countdown to the end of the set, so the frame indices in the attempt records address both.

## Why this is possible

| Item | Size |
|---|---|
| Browser recording at 720p, two minutes | about 37 MB |
| Keypoint file, two minutes at 30 fps | 3.3 MB raw, about 1 MB gzipped |
| Fifteen testers, four exercises, two sets each, at 720p | about 4.4 GB |
| Supabase cloud free plan | 1 GB storage, 50 MB per file |

Only self-hosting (ADR-0001) or the Pro plan holds this. The keypoint file exists regardless of video: similarity reads landmark sequences, which the report's analyse payload never carried.

## Consequences

- Consent (NFR4) names three things separately: camera access with on-device processing, storing video and landmarks for history, and storing the profile including medical history. Version and time are recorded. The consent text states that data is kept until the project ends and deleted earlier on request to the team. A self-service delete is deferred.
- `video_url` and `keypoints_url` are per set and nullable, so a failed upload does not lose the set.
- The keypoint file format, JSON or binary, is decided in Phase 4.
