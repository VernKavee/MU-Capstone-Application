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
- The keypoint file format was decided in Phase 4, below.

## The keypoint file, decided in Phase 4

JSON, gzipped in the browser with `CompressionStream` before upload, stored as `<user_id>/<set_id>/keypoints.json.gz` beside `video.webm` or `video.mp4` in the private `sets` bucket. A browser without `CompressionStream` uploads the same JSON as `keypoints.json`.

```
{
  "schema_version": 1,
  "joints": ["nose", "left_eye_inner", ..., "right_foot_index"],
  "fields": ["x", "y", "z", "x_3d", "y_3d", "z_3d", "score"],
  "fps": 30,
  "frames": [
    { "t": 0, "state": "Idle", "event": "none", "points": [0.5123, 0.2841, -0.1402, ...] }
  ]
}
```

- `joints` is MediaPipe's index order with the research repo's names, and `fields` is the order within a joint, so `points[j * 7 + f]` is field `f` of joint `j`: 231 numbers per frame.
- `t` is milliseconds since the recording started, so it indexes the video too. `state` and `event` are the engine's for that frame.
- The frame indices in the attempt records (ADR-0003) are indices into `frames`.
- `fps` is the mean capture rate over the set. Frames are not resampled.
- Numbers are rounded to four decimals.

JSON rather than a binary format because the similarity contract of ADR-0007 already takes this object as `landmarks`, Python and TypeScript both read it without a decoder, and gzip closes most of the size gap. The table above assumed about 1 MB gzipped for two minutes; the real size is measured on the first real camera run. Written by `toKeypointFile` in `lib/set.ts`.

## Measured and replayed in Phase 5

- Vern's first real workout, on a Mac in Chrome: sets of 31 to 43 s gave keypoint files of 0.97 to 1.24 MB gzipped and videos of 38 to 53 MB. The landmarker ran at 60 frames per second, so the file is about 1.7 MB per minute, three times the estimate above; `fps` in the file is the real rate and readers use it. The video came out at about 10 Mbit/s, about 75 MB per minute, four times the estimate, so the storage table above is low by the same factor. Setting `videoBitsPerSecond` on the recorder is open.
- History level 4 replays a set in the browser: it signs a download URL for the video and downloads the keypoint file, only when Play is pressed. The video plays as recorded, not mirrored, and the skeleton is drawn over it frame by frame from the keypoint file by `lib/live/skeleton.ts`, the drawing the live screen uses.
- The recorded webm reports no duration. The replay times everything by the keypoint file's `t`, and Chromium seeks to any time in the video.
- The file holds no violations per frame, so replay lights an attempt's violated rules for the whole attempt, found through the attempt records' frame ranges (ADR-0003). The format is unchanged.
