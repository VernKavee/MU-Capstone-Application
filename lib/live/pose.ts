// MediaPipe adapter: the Tasks Vision pose landmarker in the browser (NFR1), producing the
// research repo's 33-entry keypoints dict for the engine seam (ADR-0002). The reference is
// src/frame_processing/mediapipe_hpe.py.
import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { emptyKeypoints, LANDMARK_NAMES, type Keypoints } from "@/lib/engine/types";

export type PoseModel = "full" | "lite";

// The version must match package.json; the package does not export its own package.json.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL: Record<PoseModel, string> = {
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
};

// Full is the model the thresholds were calibrated on; lite is the manual fallback for a
// phone that cannot hold fifteen frames per second (ADR-0002).
export async function loadPoseLandmarker(model: PoseModel): Promise<PoseLandmarker> {
  const files = await FilesetResolver.forVisionTasks(WASM_URL);
  const create = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL[model], delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  try {
    return await create("GPU");
  } catch {
    return create("CPU");
  }
}

// x, y, z image-normalised; x_3d, y_3d, z_3d world metres; score is visibility. No person
// in frame gives the empty skeleton, every score zero.
export function toKeypoints(result: PoseLandmarkerResult): Keypoints {
  const image = result.landmarks[0];
  const world = result.worldLandmarks[0];
  if (!image) return emptyKeypoints();
  return Object.fromEntries(
    LANDMARK_NAMES.map((name, i) => [
      name,
      {
        x: image[i].x,
        y: image[i].y,
        z: image[i].z,
        x_3d: world?.[i].x ?? 0,
        y_3d: world?.[i].y ?? 0,
        z_3d: world?.[i].z ?? 0,
        score: image[i].visibility ?? 1,
      },
    ]),
  ) as Keypoints;
}

export const POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;
