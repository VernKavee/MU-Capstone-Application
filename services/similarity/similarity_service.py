"""
Similarity service: target SimilarityInput (+ optional reference) -> SimilarityOutput.

SimilarityInput: one exercise set -- attempts with outcome + frame range, and every
captured frame's 33 MediaPipe joints x 7 fields (x,y,z,x_3d,y_3d,z_3d,score).
The service reads only the 2D image coordinates x, y (normalised 0-1, scaled to pixels by landmarks.frame_size)
and the visibility score; z and the world landmarks x_3d/y_3d/z_3d are not used (FIX_LOG V7 / S10: the world
landmarks' depth made side views unreliable). Every rep is mirrored to face image-right (the app accepts the user
on either side of the camera); the camera angle itself is fixed by the app's placement guide.
{                                  checked by validate(); a violation -> status "error" naming the field
  exercise_key : "squat" | "lunge" | "pushup" | "dumbbell_biceps_curls"
  source       : string | null     echoed; a reference with the target's source is the same set
  side         : "left" | "right" | null   the curl arm (lunge legs are detected per rep)
  totals       : {attempts, completed_reps, correct_reps, abandoned_attempts}   optional; a count that
                                   disagrees with the attempts list -> warning
  attempts : [
    { attempt_no  : int, unique
      outcome     : "correct" | "incorrect" | "abandoned"   (abandoned attempts are not scored)
      rep_number  : int | null
      frame_start, frame_end : int | null   inclusive indices into landmarks.frames; used when the frames
                                   carry no attempt labels (otherwise the labelled run of this attempt_no)
      side        : "left" | "right" | null   (optional) per-attempt curl arm
      violations  : [...]          (optional, not used) }
  ]                                at least one attempt that is not abandoned
  landmarks {
    schema_version : 1
    joints : the 33 MediaPipe names in index order (engine.pose.MP33_NAMES)
    fields : ["x","y","z","x_3d","y_3d","z_3d","score"]
    fps    : number                nominal; the timestamps are what is used (mismatch > 25% -> warning)
    frame_size : [width, height]   the picture in pixels (required: x, y are normalised to it)
    frames : [ { t: number, ms, strictly increasing;  points: 231 numbers (joint-major, 7 per joint),
                 score = MediaPipe visibility; a frame is lost when all its joints are 0 or the
                 mean score of the joints the model uses is below 0.5;
                 attempt_no (or attempt): int | null (optional) the attempt this frame belongs to, null between
                 attempts (the rule engine's REP_STARTED .. end of the attempt; scratch/export_similarity.py, the
                 web app's buildAttempts). Frames are read in order: a rep is a run of consecutive frames with
                 the same label, cut where it changes; with labels these define the windows. Other keys
                 (state, event, rep, rep_count, ...) are ignored } ]
  }
}
Files: read_package (invalid JSON / unreadable -> error output, not a crash), write_output (strict
JSON, written via a temporary file), check_output (output contract, used by the tests).

Reference = ONE rep, compared with every target rep of the same variant:
  * a reference SimilarityInput (e.g. a coach's recorded set): the rep is the
    attempt given by ref_attempt, or else the medoid of the reference's correct
    attempts (the rep most similar to the other correct reps, so a warm-up or
    sloppy first rep is not picked); or
  * none: the exercise's built-in LMC boom 45SideView rep (references/<exercise_key>/, one folder per
    exercise with one rep per variant; format in reference_store.py).
The service reads landmark packages only. A test video is turned into a package outside this folder first
(scratch/similarity/video_to_package.py in the research repository).

Variants (left/right): a rep is only compared with a reference rep of the same
side. Lunge: the front leg (detected per rep: the ankle further along the body's
facing direction at the deepest frame). Curl: the working arm (the package's side,
else the arm whose elbow moves more). Squat / pushup: one variant. So a squat,
pushup or curl reference is exactly one rep; an alternating-leg lunge set gets one
reference rep per leg. Mirroring a rep onto the other side was tested on the Boom
videos and rejected: it scored normal reps below very-bad ones.

Per rep (reference and target alike):
  frames[frame_start..frame_end] -> drop lost frames (all joints 0, or used-joint visibility
  < LOST_CONFIDENCE) -> skip the rep if under MIN_TRACKED of its frames are left or the pose was
  lost for more than MAX_GAP_S in a row (FIX_LOG V3: a 1 s gap moves the score 10-22 points) ->
  resample to 30 fps by the frames' own `t` (phones ~30 fps, Macs ~60 fps) ->
  33->15 joints -> project_image (image x, y in pixels, mirrored to face image-right, body size matched per
  rep; older versions used a frontal virtual camera from the world landmarks' own
  left-right axis, y down, body size normalised per rep) -> normalize -> encode
  per body part -> DTW cosine + the bundle's formula value per part (norm_ratio for
  bpe_v3_seed2026: overall code-size ratio) -> cos*exp(-s*value)*100 on their means over
  the exercise's parts (FIX_LOG S2/S3/S5). The steps live in engine/ (pose.py, encoder.py, scoring.py).

Model: a bundle folder under models/ (model_bundle.py: config, checkpoint, normalization
statistics, formula + scale, checksums), chosen by SimilarityService(model=...) / --model,
else $SIMILARITY_MODEL, else service_config.json. Replacing the model = add a bundle and
point the config at it; no code change.

This folder holds the code, the model (models/) and the built-in references (references/), and imports nothing from
outside it; it needs only torch, numpy and PyYAML. File-by-file guide: README.md here.

SimilarityOutput:
{
  source, exercise_key, side : echoed from the target
  status         : "ok" | "partial" | "error"
                   ok = every non-abandoned attempt scored; partial = some skipped;
                   error = target or reference unusable, or nothing could be scored
  error          : string | null
  warnings       : string[]         input inconsistencies that did not stop scoring
                                    (totals vs attempts, nominal fps vs timestamps)
  reference {
    kind         : "package" | "builtin"
    source       : string | null    the reference set's source
    reps : [                       one per variant
      { variant      : "any" | "left" | "right"
        attempt_no   : int | null   (package) the reference rep
        frame_start, frame_end : int | null
        selection    : "requested" | "medoid" | "only usable rep" | "builtin"
        label        : string | null   (builtin) which LMC rep }
    ]
  }
  summary {                        over scored attempts, excluding the reference rep itself
    attempts_scored, attempts_skipped : int
    mean_score, std_score, min_score, max_score : number | null   0-100
    best_attempt_no, worst_attempt_no : int | null
    mean_score_correct, mean_score_incorrect : number | null
    weakest_body_part : string | null   lowest mean among the exercise's score_parts
    body_parts : {part: number} | null  mean per part over scored attempts, all five parts
  }
  attempts : [                     same order as the target's attempts
    {
      attempt_no, rep_number, outcome   echoed
      score          : number | null    0-100, 1 decimal
      skipped_reason : string | null    why there is no score: "abandoned", "used as the reference rep"
                                        (same set: it would be compared with itself; not a failure, not
                                        counted as skipped), or why the rep could not be scored
      body_parts     : {part: number}   0-100 for ALL five parts (torso, left_arm, right_arm,
                                        left_leg, right_leg), each vs the same reference rep
      score_parts    : string[]         the parts averaged into `score`: squat / lunge torso + legs, pushup
                                        torso + arms, a one-arm curl only its working arm; a push-up rep with
                                        one arm hidden (elbow/wrist visibility < 0.5) torso + the visible arm,
                                        with a warning naming the hidden arm (engine.pose.score_parts)
      variant        : "any" | "left" | "right" | null   front leg (lunge) / arm (curl)
      reference_rep  : int | string | null   reference attempt_no, or the built-in label
      frame_start, frame_end, duration_s, tracking_confidence, warnings
    }
  ]
  model { id, name, formula, formula_scale, version }   id = the bundle; formula e.g. "cos*exp(-s*norm_ratio)"
  processed_at, processing_ms
}

Usage:
  python similarity_service.py --target set.json [--reference coach.json] [--ref_attempt 3] --out result.json
  python similarity_service.py --target set.json --model <bundle id or folder> --out result.json   (another bundle)
  exit code: 0 = output with status ok / partial, 2 = output with status error (still written)
  from similarity_service import SimilarityService; SimilarityService().process(target, reference)
"""
import os
import sys
import json
import time
import argparse
import datetime
import numpy as np
import torch

SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SERVICE_DIR)     # engine, model_bundle, reference_store, however this module is imported

from engine.pose import (MP33_NAMES, MP33_TO_MIXAMO15, MP33_INDEX, mp33_to_mixamo15, project_image, EX_PARTS,
                         score_parts, arm_visibility, ARM_VISIBLE_MIN)
from engine.encoder import load_motion_encoder, load_pose_stats, preprocess as normalize_2d, ModelError
from engine.scoring import compute_dtw_cosine_similarity, compute_score_scaled
from model_bundle import load_bundle, BundleError
from reference_store import REFS_DIR, load_reference, ReferenceStoreError
SERVICE_VERSION = "0.11.0"

N_JOINTS, N_FIELDS = 33, 7
FIELDS = ["x", "y", "z", "x_3d", "y_3d", "z_3d", "score"]
IMAGE_FIELDS = [0, 1, 6]    # what the service reads: image x, y (normalised 0-1) and the visibility score
TARGET_FPS = 30.0
MIN_FRAMES = 16             # the motion encoder needs >= 16 frames (reflection padding); 0.53 s at 30 fps. Only binds
                            # when stretching is off: STRETCH_FRAMES (64) lifts every shorter rep above it
MIN_REP_FRAMES = 8          # a rep with fewer frames (0.27 s at 30 fps) is skipped: too little motion to stretch
MIN_TRACKED = 0.5           # a rep with fewer tracked frames than this is skipped
LOST_CONFIDENCE = 0.5       # a frame whose used joints' mean visibility is below this counts as lost
MAX_GAP_S = 0.5             # a rep that lost the pose for longer than this in a row is skipped (FIX_LOG V3/V4)
LOW_CONFIDENCE = 0.5        # mean joint score below this -> warning
STRETCH_FRAMES = 64         # a rep shorter than this is resampled up to it before encoding (longer reps unchanged):
                            # the encoder shortens time 8x, so a ~1 s app rep gave only 4 code steps (FIX_LOG V5 / V6)
REFERENCE_REP = "used as the reference rep"   # skipped_reason of the reference rep itself (same set)
NOT_FAILED = ("abandoned", REFERENCE_REP)     # skipped_reasons that do not make the set partial
USED_JOINTS = sorted({MP33_INDEX[n] for n in ("left_shoulder", "right_shoulder", "left_hip", "right_hip")}
                     | {j for j in MP33_TO_MIXAMO15 if isinstance(j, int)})

# exercise_key -> (body-part key, the variants its built-in reference holds: one rep each)
EXERCISES = {
    "squat": ("squat", ("any",)),
    "pushup": ("pushup", ("any",)),
    "lunge": ("lunge", ("left", "right")),
    "dumbbell_biceps_curls": ("curl", ("left", "right")),
}
VARIANT_NAME = {"lunge": "{}-leg lunge", "dumbbell_biceps_curls": "{}-arm curl"}
OUTCOMES = ("correct", "incorrect", "abandoned")
PARTS = ["torso", "left_arm", "right_arm", "left_leg", "right_leg"]


class InputError(ValueError):
    pass


def _is_int(v):
    return type(v) is int                     # JSON integer; bool, float and str are rejected


def _is_num(v):
    return type(v) in (int, float)


def validate(payload, what="target", warnings=None):
    """Check a SimilarityInput's structure, types and timestamps (schema in the module docstring);
    -> t_ms (T,), world joints (T,33,3), joint score (T,33). Raises InputError naming the bad field.
    Inconsistencies that do not stop scoring are appended to `warnings` (a list) when given."""
    warn = (lambda m: warnings.append(f"{what}: {m}")) if warnings is not None else (lambda m: None)
    if not isinstance(payload, dict):
        raise InputError(f"{what}: payload is not a JSON object")
    for k in ("exercise_key", "attempts", "landmarks"):
        if k not in payload:
            raise InputError(f"{what}: missing '{k}'")
    if payload["exercise_key"] not in EXERCISES:
        raise InputError(f"{what}: unknown exercise_key {payload['exercise_key']!r}")
    if payload.get("side") not in (None, "left", "right"):
        raise InputError(f"{what}: side must be 'left', 'right' or null, got {payload['side']!r}")
    if payload.get("source") is not None and not isinstance(payload["source"], str):
        raise InputError(f"{what}: source must be a string or null")

    atts = payload["attempts"]
    if not isinstance(atts, list):
        raise InputError(f"{what}: attempts must be a list")
    seen = set()
    for i, a in enumerate(atts):
        if not isinstance(a, dict):
            raise InputError(f"{what}: attempts[{i}] is not an object")
        if not _is_int(a.get("attempt_no")):
            raise InputError(f"{what}: attempts[{i}].attempt_no must be an integer, got {a.get('attempt_no')!r}")
        if a["attempt_no"] in seen:
            raise InputError(f"{what}: attempt_no {a['attempt_no']} appears more than once")
        seen.add(a["attempt_no"])
        if a.get("outcome") not in OUTCOMES:
            raise InputError(f"{what}: attempts[{i}].outcome must be one of {list(OUTCOMES)}, got {a.get('outcome')!r}")
        for k in ("rep_number", "frame_start", "frame_end"):
            if a.get(k) is not None and not _is_int(a[k]):
                raise InputError(f"{what}: attempts[{i}].{k} must be an integer or null, got {a[k]!r}")
        if a.get("side") not in (None, "left", "right"):
            raise InputError(f"{what}: attempts[{i}].side must be 'left', 'right' or null, got {a['side']!r}")

    lm = payload["landmarks"]
    if not isinstance(lm, dict):
        raise InputError(f"{what}: landmarks is not a JSON object")
    if lm.get("schema_version") != 1:
        raise InputError(f"{what}: unsupported landmarks.schema_version {lm.get('schema_version')!r}")
    if list(lm.get("joints") or []) != MP33_NAMES:
        raise InputError(f"{what}: landmarks.joints is not the 33 MediaPipe names in index order")
    if list(lm.get("fields") or []) != FIELDS:
        raise InputError(f"{what}: landmarks.fields must be {FIELDS}")
    frames = lm.get("frames")
    if not isinstance(frames, list):
        raise InputError(f"{what}: landmarks.frames must be a list")
    for i, fr in enumerate(frames):
        if not isinstance(fr, dict):
            raise InputError(f"{what}: frame {i} is not an object")
        if not _is_num(fr.get("t")):
            raise InputError(f"{what}: frame {i} t must be a number (ms), got {fr.get('t')!r}")
        pts = fr.get("points")
        if not isinstance(pts, list) or len(pts) != N_JOINTS * N_FIELDS:
            raise InputError(f"{what}: frame {i} has {len(pts) if isinstance(pts, list) else 'no'} points, "
                             f"expected {N_JOINTS * N_FIELDS}")
        if not all(type(v) in (int, float) for v in pts):
            k = next(k for k, v in enumerate(pts) if type(v) not in (int, float))
            raise InputError(f"{what}: frame {i} {MP33_NAMES[k // N_FIELDS]}.{FIELDS[k % N_FIELDS]} "
                             f"is {pts[k]!r}, not a number")
        for k in FRAME_ATTEMPT_KEYS:
            if fr.get(k) is not None and not _is_int(fr[k]):
                raise InputError(f"{what}: frame {i} {k} must be an integer or null, got {fr[k]!r}")

    totals = payload.get("totals")
    if isinstance(totals, dict):
        n_ab = sum(a["outcome"] == "abandoned" for a in atts)
        expect = {"attempts": len(atts), "completed_reps": len(atts) - n_ab, "abandoned_attempts": n_ab,
                  "correct_reps": sum(a["outcome"] == "correct" for a in atts)}
        for k, v in expect.items():
            if k in totals and totals[k] != v:
                warn(f"totals.{k} is {totals[k]!r} but the attempts list gives {v}")

    if not frames:
        raise InputError(f"{what}: landmarks.frames is empty")
    size = lm.get("frame_size")
    if not (isinstance(size, list) and len(size) == 2 and all(_is_num(v) and v > 0 for v in size)):
        raise InputError(f"{what}: landmarks.frame_size must be [width, height] in pixels, got {size!r} (x, y are "
                         f"normalised 0-1, so the picture's proportions are needed)")
    pts = np.asarray([fr["points"] for fr in frames], dtype=np.float32).reshape(len(frames), N_JOINTS, N_FIELDS)
    bad = ~np.isfinite(pts[..., IMAGE_FIELDS]).all(axis=(1, 2))
    if bad.any():
        raise InputError(f"{what}: frame {int(np.argmax(bad))} has non-finite x/y/score values")
    has_pose = np.abs(pts[..., :2]).sum(axis=(1, 2)) > 0
    if has_pose.any() and not (pts[has_pose][..., 6] > 0).any():
        raise InputError(f"{what}: every landmark score is 0; score must be MediaPipe's visibility (with 0 "
                         f"everywhere every frame would count as lost)")
    t = np.asarray([fr["t"] for fr in frames], dtype=np.float64)
    if np.any(np.diff(t) <= 0):
        raise InputError(f"{what}: frame timestamps are not strictly increasing")
    if len(t) > 1:
        dt = float(np.median(np.diff(t)))
        if dt < 2.0:
            raise InputError(f"{what}: frame timestamps step by {dt:g} on average; t must be in milliseconds")
        fps = lm.get("fps")
        if _is_num(fps) and fps > 0 and abs(1000.0 / dt / fps - 1) > 0.25:
            warn(f"landmarks.fps is {fps:g} but the timestamps give {1000.0 / dt:.1f} fps (timestamps are used)")
    joints = np.zeros((len(frames), N_JOINTS, 3), np.float32)      # image pixels (x right, y down), z = 0
    joints[..., 0], joints[..., 1] = pts[..., 0] * size[0], pts[..., 1] * size[1]
    return t, joints, pts[..., 6]


FRAME_ATTEMPT_KEYS = ("attempt_no", "attempt")   # the per-frame attempt label (the exporter writes "attempt")


def frame_attempt(fr):
    """A frame's attempt label (attempt_no, else attempt), or None."""
    for k in FRAME_ATTEMPT_KEYS:
        if fr.get(k) is not None:
            return fr[k]
    return None


def attempt_runs(frames):
    """Frames read in order; a rep is a run of consecutive frames with the same attempt label, cut where the label
    changes (null = between attempts). -> {label: [(first, last), ...]} in order of appearance."""
    runs, cur, first = {}, None, None
    for i, fr in enumerate(frames + [{}]):              # sentinel closes the last run
        lab = frame_attempt(fr) if i < len(frames) else None
        if lab != cur:
            if cur is not None:
                runs.setdefault(cur, []).append((first, i - 1))
            cur, first = lab, i
    return runs


def attempt_ranges(payload, warnings=None, what="target"):
    """The attempts list with each attempt's frame window. When the frames carry attempt labels (frames[].attempt_no
    or .attempt: the rule engine labels every frame of an attempt, REP_STARTED .. its end), the window is that
    attempt's run of consecutive labelled frames (cut where the label changes) and replaces frame_start / frame_end
    (a disagreement is warned). Without labels, frame_start / frame_end are used as sent. A label that forms more than
    one run (should not happen in data read in order without skips): the longest run, with a warning. A validated
    payload -> a new list (the payload is not changed)."""
    runs = attempt_runs(payload["landmarks"]["frames"])
    warn = (lambda m: warnings.append(f"{what}: {m}")) if warnings is not None else (lambda m: None)
    out = []
    for a in payload["attempts"]:
        r = runs.get(a["attempt_no"])
        if r:
            if len(r) > 1:
                warn(f"attempt {a['attempt_no']}: its label forms {len(r)} separate runs "
                     f"({', '.join(f'{x}-{y}' for x, y in r)}); using the longest")
            fs, fe = max(r, key=lambda x: x[1] - x[0])
            if a.get("frame_start") is not None and (a.get("frame_start"), a.get("frame_end")) != (fs, fe):
                warn(f"attempt {a['attempt_no']}: frame_start/frame_end {a.get('frame_start')}-{a.get('frame_end')} "
                     f"differ from its labelled frames {fs}-{fe}; using the labels")
            a = dict(a, frame_start=fs, frame_end=fe)
        out.append(a)
    return out


def resample(t_ms, joints, fps=TARGET_FPS):
    grid = t_ms[0] + np.arange(int(np.floor((t_ms[-1] - t_ms[0]) * fps / 1000.0)) + 1) * 1000.0 / fps
    flat = joints.reshape(len(t_ms), -1)
    out = np.stack([np.interp(grid, t_ms, flat[:, k]) for k in range(flat.shape[1])], axis=1)
    return out.reshape(len(grid), N_JOINTS, 3).astype(np.float32)


def tracked_frames(joints, conf):
    """(T,33,3), (T,33) -> bool (T,): False for a lost frame (all joints 0, or the used joints' mean
    visibility below LOST_CONFIDENCE)."""
    return (np.abs(joints).sum(axis=(1, 2)) > 0) & (conf[:, USED_JOINTS].mean(axis=1) >= LOST_CONFIDENCE)


def longest_loss_s(t_ms, tracked):
    """Longest continuous stretch of lost frames in a rep, in seconds: lost frames between two tracked
    ones (bridged by interpolation) or at the rep's start / end (cut off). Measured on the timestamps, one
    frame step per lost frame, so k lost frames at 30 fps count as k / 30 s."""
    if tracked.all():
        return 0.0
    if not tracked.any():
        return float((t_ms[-1] - t_ms[0]) / 1000.0)
    step = float(np.median(np.diff(t_ms))) if len(t_ms) > 1 else 0.0
    k = np.flatnonzero(tracked)
    spans = [t_ms[k[0]] - t_ms[0], t_ms[-1] - t_ms[k[-1]]]               # cut at the start / end
    spans += [t_ms[j] - t_ms[i] - step for i, j in zip(k[:-1], k[1:])]  # bridged inside
    return float(max(spans) / 1000.0)


def rep_joints(att, t, joints, conf, info=None, min_frames=MIN_REP_FRAMES):
    """One attempt's frames -> (T,33,3) world joints at 30 fps. Raises InputError
    with the skip reason when the attempt cannot be scored. `info` (a dict), when
    given, receives lost_frames, frames and longest_loss_s."""
    a, b = att.get("frame_start"), att.get("frame_end")
    if att.get("outcome") == "abandoned":
        raise InputError("abandoned")
    if a is None or b is None:
        raise InputError("no frame range")
    if not (0 <= a <= b < len(t)):
        raise InputError(f"frame range {a}-{b} outside 0-{len(t) - 1}")
    seg_t, seg_j = t[a:b + 1], joints[a:b + 1]
    tracked = tracked_frames(seg_j, conf[a:b + 1])
    gap = longest_loss_s(seg_t, tracked)
    if info is not None:
        info.update(lost_frames=int((~tracked).sum()), frames=len(tracked), longest_loss_s=gap)
    if tracked.mean() < MIN_TRACKED:
        raise InputError(f"pose tracked in only {tracked.sum()} of {len(tracked)} frames (need {MIN_TRACKED:.0%})")
    if gap > MAX_GAP_S + 1e-6:
        raise InputError(f"pose lost for {gap:.1f} s continuously (limit {MAX_GAP_S:g} s)")
    seg_t, seg_j = seg_t[tracked], seg_j[tracked]
    j30 = resample(seg_t, seg_j) if len(seg_t) > 1 else seg_j
    if len(j30) < min_frames:
        raise InputError(f"too short ({len(j30)} frames at {TARGET_FPS:.0f} fps, need {min_frames})")
    return j30


def joint_angle(j33, a, b, c):
    v1 = j33[:, MP33_INDEX[a]] - j33[:, MP33_INDEX[b]]
    v2 = j33[:, MP33_INDEX[c]] - j33[:, MP33_INDEX[b]]
    cos = (v1 * v2).sum(1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1) + 1e-8)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


FRONT_LEG_BOTTOM = 0.5      # lunge front leg: vote over the frames in the bottom half of the rep's knee-angle range


def lunge_front_leg(j33):
    """(T,33,3) image coordinates -> the front leg: in each frame near the bottom of the rep (knee-angle sum within the
    lowest FRONT_LEG_BOTTOM of its range), the ankle further along the direction the person faces (nose ahead of the
    hips, median over the rep) is in front; the majority over those frames decides. A single deepest frame was fooled by
    MediaPipe swapping the leg labels in side views: against motion-capture truth on 131 lunge reps, 114 right with one
    frame, 126 with the vote (FIX_LOG V12)."""
    knee = joint_angle(j33, "left_hip", "left_knee", "left_ankle") +         joint_angle(j33, "right_hip", "right_knee", "right_ankle")
    idx = np.flatnonzero(knee <= knee.min() + FRONT_LEG_BOTTOM * (knee.max() - knee.min()))
    hip_x = (j33[:, MP33_INDEX["left_hip"], 0] + j33[:, MP33_INDEX["right_hip"], 0]) / 2
    facing = 1.0 if np.median(j33[:, MP33_INDEX["nose"], 0] - hip_x) >= 0 else -1.0
    left_ahead = (j33[idx, MP33_INDEX["left_ankle"], 0] - j33[idx, MP33_INDEX["right_ankle"], 0]) * facing > 0
    return "left" if left_ahead.mean() > 0.5 else "right"


def curl_arm(j33):
    rng = {s: np.ptp(joint_angle(j33, f"{s}_shoulder", f"{s}_elbow", f"{s}_wrist")) for s in ("left", "right")}
    return max(rng, key=rng.get)


def rep_variant(exercise_key, j33, side=None):
    """The rep's working side. Curl: the arm the rule engine sent (attempt side, else the package's side), detected
    only when none is sent. Lunge: the front leg, detected per rep (the rule engine assigns no side to a lunge).
    Squat / pushup: "any"."""
    if exercise_key == "lunge":
        return lunge_front_leg(j33)
    if exercise_key == "dumbbell_biceps_curls":
        return side or curl_arm(j33)
    return "any"


def variant_text(exercise_key, v):
    return VARIANT_NAME[exercise_key].format(v) if exercise_key in VARIANT_NAME else exercise_key


def _r(x, nd=1):
    return None if x is None else round(float(x), nd)


class SimilarityService:
    def __init__(self, model=None, refs_dir=REFS_DIR, device=None, stretch_frames=STRETCH_FRAMES, builtin=True):
        """model: bundle id or folder (None -> $SIMILARITY_MODEL, then service_config.json). Raises BundleError
        when the bundle is missing, corrupt or not usable by the service, ReferenceStoreError when an exercise's
        built-in reference folder (refs_dir/<exercise_key>/) is. builtin=False skips the built-in references (only
        reference packages can be used; add_reference.py picks a rep with it before a folder exists)."""
        self.stretch_frames = stretch_frames
        # shortest rep scored: with stretching, MIN_REP_FRAMES; without, the encoder's own limit
        self.min_rep_frames = MIN_REP_FRAMES if (stretch_frames or 0) >= MIN_FRAMES else MIN_FRAMES
        self.bundle = b = load_bundle(model)
        self.formula_value, self.formula_scale = b["formula"]["value"], float(b["formula"]["scale"])
        self.value_fn = b["value_fn"]
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        try:
            self.model = load_motion_encoder(b["paths"]["config"], b["paths"]["checkpoint"], self.device)
        except ModelError as e:
            raise BundleError(f"bundle {b['id']}: {e}")
        self.meanpose, self.stdpose = load_pose_stats(b["paths"]["meanpose"]), load_pose_stats(b["paths"]["stdpose"])
        self.builtin, self.builtin_source = {}, {}      # exercise_key -> {variant: {"emb", "label"}}, source_set
        for ex, (_, variants) in (EXERCISES.items() if builtin else ()):
            ref = load_reference(ex, variants, refs_dir, MIN_FRAMES)
            self.builtin_source[ex] = ref["source_set"]
            for v, r in ref["variants"].items():
                if r["format"] != "image15":
                    raise ReferenceStoreError(f"reference {ex}/{v} is {r['format']} (3D); the service scores 2D image "
                                              f"coordinates, so the reference must be image15 (rebuild it: "
                                              f"add_reference.py or build_service_references.py)")
            self.builtin[ex] = {v: {"emb": self._encode(project_image(self._stretch(r["motion"], 2))),
                                    "label": r["label"]} for v, r in ref["variants"].items()}

    # ---- encoding / scoring -------------------------------------------------
    def _encode(self, motion2d):
        with torch.no_grad():
            codes = self.model.encode_motion(normalize_2d(motion2d, self.meanpose, self.stdpose)
                                             .unsqueeze(0).to(self.device))
        return {p: c[0].cpu().numpy() for p, c in codes.items()}

    def embed(self, j33):
        """(T,33,3) image joints in pixels at 30 fps -> {part: (C,T') motion code} (engine.pose.project_image: facing
        image-right, body size per rep)."""
        return self._encode(project_image(mp33_to_mixamo15(self._stretch(j33, 0))))

    def _stretch(self, motion, axis):
        """Resample `motion` along its time axis up to stretch_frames frames when it is shorter (only when necessary:
        a longer rep is unchanged, so its timing detail and length are kept). None = never."""
        n = self.stretch_frames
        if not n or motion.shape[axis] >= n:
            return motion
        m = np.moveaxis(motion, axis, 0)
        x, src = np.linspace(0, len(m) - 1, n), np.arange(len(m))
        flat = m.reshape(len(m), -1)
        out = np.stack([np.interp(x, src, flat[:, k]) for k in range(flat.shape[1])], axis=1).reshape((n,) + m.shape[1:])
        return np.moveaxis(out, 0, axis).astype(np.float32)

    def compare(self, ref_emb, emb, parts):
        """-> overall score over `parts`, {part: score} for every part the model has."""
        raw = {}
        for p in ref_emb:
            cos, l2 = compute_dtw_cosine_similarity(ref_emb[p], emb[p])
            raw[p] = (float(cos), float(self.value_fn(ref_emb[p], emb[p], float(l2))))
        score = self.formula_score(np.mean([raw[p][0] for p in parts]), np.mean([raw[p][1] for p in parts]))
        return float(score), {p: float(self.formula_score(c, v)) for p, (c, v) in raw.items()}

    def formula_score(self, cos, value):
        """The bundle's formula: cos * exp(-scale * value) * 100."""
        return compute_score_scaled(cos, value, self.formula_scale)

    # ---- references: {variant: {"emb", "attempt_no" | "label", ...}} ---------
    def builtin_reference(self, exercise_key):
        if exercise_key not in self.builtin:
            raise InputError("this service was started without built-in references; send a reference package")
        refs = {v: {"emb": r["emb"], "variant": v, "attempt_no": None, "frame_start": None,
                    "frame_end": None, "selection": "builtin", "label": r["label"]}
                for v, r in self.builtin[exercise_key].items()}
        return refs, self.builtin_source[exercise_key]

    def package_reference(self, payload, ref_attempt=None, warnings=None):
        """One rep per variant of a reference set (one rep in total for squat /
        pushup / a one-arm curl set)."""
        t, joints, conf = validate(payload, "reference", warnings)
        payload = dict(payload, attempts=attempt_ranges(payload, warnings, "reference"))
        ex = payload["exercise_key"]
        atts = payload["attempts"]
        if ref_attempt is not None:
            pool = [a for a in atts if a.get("attempt_no") == ref_attempt]
            if not pool:
                raise InputError(f"reference: no attempt_no {ref_attempt}")
        else:
            pool = [a for a in atts if a.get("outcome") == "correct"]
        groups = {}
        for a in pool:
            try:
                j = rep_joints(a, t, joints, conf, min_frames=self.min_rep_frames)
            except InputError as e:
                if ref_attempt is not None:
                    raise InputError(f"reference attempt {ref_attempt} unusable: {e}")
                continue
            v = rep_variant(ex, j, a.get("side") or payload.get("side"))
            groups.setdefault(v, []).append((a, self.embed(j)))
        if not groups:
            raise InputError("reference: no usable correct rep")
        refs = {}
        for v, cands in groups.items():
            if ref_attempt is not None:
                pick, sel = 0, "requested"
            elif len(cands) == 1:
                pick, sel = 0, "only usable rep"
            else:
                sim = np.zeros((len(cands), len(cands)))
                for i in range(len(cands)):
                    for k in range(i + 1, len(cands)):
                        sim[i, k] = sim[k, i] = self.compare(cands[i][1], cands[k][1], score_parts(EXERCISES[ex][0], v))[0]
                pick, sel = int(np.argmax(sim.sum(1))), "medoid"
            a, emb = cands[pick]
            refs[v] = {"emb": emb, "variant": v, "attempt_no": a.get("attempt_no"), "frame_start": a.get("frame_start"),
                       "frame_end": a.get("frame_end"), "selection": sel, "label": None}
        return refs, payload.get("source")

    # ---- main entry ---------------------------------------------------------
    def process(self, target, reference=None, ref_attempt=None):
        """target / reference: SimilarityInput dicts (reference None -> built-in), or the InputError
        of a failed read_package. Never raises: bad input (or an internal failure) gives status "error"
        and the reason, so every request gets an output package."""
        t0 = time.time()
        p = target if isinstance(target, dict) else {}
        echo = lambda k: p.get(k) if isinstance(p.get(k), str) else None
        res = {"source": echo("source"), "exercise_key": echo("exercise_key"),
               "side": echo("side"), "status": "ok", "error": None, "warnings": [], "reference": None,
               "summary": None, "attempts": []}
        try:
            for x in (target, reference):
                if isinstance(x, InputError):       # read_package failed: report it as the output
                    raise x
            t, joints, conf = validate(target, "target", res["warnings"])
            p = dict(p, attempts=attempt_ranges(p, res["warnings"]))
            if not any(a["outcome"] != "abandoned" for a in p["attempts"]):
                raise InputError("target: no attempts to score (the set has no completed attempt)")
            ex = p["exercise_key"]
            if reference is None:
                refs, ref_source = self.builtin_reference(ex)
                kind = "builtin"
            else:
                if isinstance(reference, dict) and reference.get("exercise_key") != ex:
                    raise InputError(f"reference exercise {reference.get('exercise_key')!r} != target {ex!r}")
                refs, ref_source = self.package_reference(reference, ref_attempt, res["warnings"])
                kind = "package"
            res["reference"] = {"kind": kind, "source": ref_source,
                                "reps": [{k: r[k] for k in r if k != "emb"} for r in refs.values()]}
            same_set = reference is not None and (reference is target or
                                                  (ref_source is not None and ref_source == p.get("source")))
            for att in p["attempts"]:
                res["attempts"].append(self._attempt(att, t, joints, conf, ex, p.get("side"), refs, same_set))
        except InputError as e:
            res.update(status="error", error=str(e), attempts=[])
        except Exception as e:                      # never leave the caller without an output package
            res.update(status="error", error=f"internal error: {type(e).__name__}: {e}", attempts=[])
        live = [a for a in res["attempts"] if a["skipped_reason"] not in NOT_FAILED]
        if res["status"] != "error" and any(a["score"] is None for a in live):
            if all(a["score"] is None for a in live):
                res.update(status="error", error="no attempt could be scored: " + live[0]["skipped_reason"])
            else:
                res["status"] = "partial"
        res["summary"] = summarize(res["attempts"])
        res["model"] = {"id": self.bundle["id"], "name": self.bundle["name"],
                        "formula": f"cos*exp(-s*{self.formula_value})", "formula_scale": self.formula_scale,
                        "version": SERVICE_VERSION}
        res["processed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        res["processing_ms"] = int((time.time() - t0) * 1000)
        return res

    def _attempt(self, att, t, joints, conf, ex, side, refs, same_set):
        a, b = att.get("frame_start"), att.get("frame_end")
        out = {"attempt_no": att.get("attempt_no"), "rep_number": att.get("rep_number"),
               "outcome": att.get("outcome"), "score": None, "skipped_reason": None, "body_parts": {},
               "score_parts": EX_PARTS[EXERCISES[ex][0]],
               "variant": None, "reference_rep": None, "frame_start": a,
               "frame_end": b, "duration_s": None, "tracking_confidence": None, "warnings": []}
        info = {}
        try:
            j = rep_joints(att, t, joints, conf, info, self.min_rep_frames)
        except InputError as e:
            out["skipped_reason"] = str(e)
            return out
        v = out["variant"] = rep_variant(ex, j, att.get("side") or side)
        seg = conf[a:b + 1]                 # confidence of the frames used; lost frames are reported separately
        used = seg[tracked_frames(joints[a:b + 1], seg)]
        arms = arm_visibility(used) if ex == "pushup" else None
        out["score_parts"] = score_parts(EXERCISES[ex][0], v, arms)
        if arms:
            hidden = [s for s in ("left", "right") if arms[s] < ARM_VISIBLE_MIN]
            if len(hidden) == 1:
                out["warnings"].append(f"{hidden[0]} arm hidden (elbow/wrist visibility {arms[hidden[0]]:.2f}): "
                                       f"scored on the torso and the {'right' if hidden[0] == 'left' else 'left'} arm")
            elif len(hidden) == 2:
                out["warnings"].append(f"both arms poorly tracked (elbow/wrist visibility left {arms['left']:.2f}, "
                                       f"right {arms['right']:.2f})")
        ref = refs.get(v)
        if ref is None:
            out["skipped_reason"] = f"reference has no {variant_text(ex, v)} rep"
            return out
        if same_set and ref["label"] is None and ref["attempt_no"] == att.get("attempt_no"):
            out.update(skipped_reason=REFERENCE_REP, reference_rep=ref["attempt_no"])
            return out
        score, parts = self.compare(ref["emb"], self.embed(j), out["score_parts"])
        if not (np.isfinite(score) and all(np.isfinite(v) for v in parts.values())):
            out["skipped_reason"] = "invalid pose (score is not finite)"
            return out
        c = float(used[:, USED_JOINTS].mean())
        out.update(score=_r(score), body_parts={q: _r(s) for q, s in parts.items()},
                   reference_rep=ref["attempt_no"] if ref["label"] is None else ref["label"],
                   duration_s=_r((t[b] - t[a]) / 1000.0, 2), tracking_confidence=_r(c, 3))
        if c < LOW_CONFIDENCE:
            out["warnings"].append("low tracking confidence")
        if info.get("lost_frames"):
            out["warnings"].append(f"pose lost in {info['lost_frames']} of {info['frames']} frames (longest "
                                   f"{info['longest_loss_s']:.2f} s); filled by interpolation")
        return out


def summarize(attempts):
    scored = [a for a in attempts if a["score"] is not None]
    s = np.array([a["score"] for a in scored], dtype=float)
    by = lambda o: [a["score"] for a in scored if a["outcome"] == o]
    weakest = None
    common = [q for q in scored[0]["score_parts"] if all(q in a["score_parts"] for a in scored)] if scored else []
    if common:                          # parts every scored rep was judged on (a push-up rep may drop a hidden arm)
        weakest = min(common, key=lambda q: np.mean([a["body_parts"][q] for a in scored]))
    return {"attempts_scored": len(scored),
            "attempts_skipped": sum(a["score"] is None and a["skipped_reason"] != REFERENCE_REP for a in attempts),
            "mean_score": _r(s.mean()) if len(s) else None, "std_score": _r(s.std()) if len(s) else None,
            "min_score": _r(s.min()) if len(s) else None, "max_score": _r(s.max()) if len(s) else None,
            "best_attempt_no": max(scored, key=lambda a: a["score"])["attempt_no"] if scored else None,
            "worst_attempt_no": min(scored, key=lambda a: a["score"])["attempt_no"] if scored else None,
            "mean_score_correct": _r(np.mean(by("correct"))) if by("correct") else None,
            "mean_score_incorrect": _r(np.mean(by("incorrect"))) if by("incorrect") else None,
            "weakest_body_part": weakest,
            "body_parts": {q: _r(np.mean([a["body_parts"][q] for a in scored])) for q in scored[0]["body_parts"]}
            if scored else None}


def read_package(path, what="target"):
    """SimilarityInput file -> dict. An unreadable file or invalid JSON raises InputError
    (process() turns it into an error output). A UTF-8 byte-order mark is accepted."""
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except OSError as e:
        raise InputError(f"{what}: cannot read {os.path.basename(path)}: {e.strerror}")
    except UnicodeDecodeError:
        raise InputError(f"{what}: {os.path.basename(path)} is not UTF-8 text")
    except json.JSONDecodeError as e:
        raise InputError(f"{what}: {os.path.basename(path)} is not valid JSON ({e.msg} at line {e.lineno} "
                         f"column {e.colno})")


def write_output(res, path):
    """SimilarityOutput -> file, written to a temporary file first and then renamed, so a reader never
    sees a half-written package. Strict JSON: NaN / Infinity are refused rather than written."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2, allow_nan=False)
    os.replace(tmp, path)


OUTPUT_KEYS = ["source", "exercise_key", "side", "status", "error", "warnings", "reference",
               "summary", "attempts", "model", "processed_at", "processing_ms"]
SUMMARY_KEYS = ["attempts_scored", "attempts_skipped", "mean_score", "std_score", "min_score", "max_score",
                "best_attempt_no", "worst_attempt_no", "mean_score_correct", "mean_score_incorrect",
                "weakest_body_part", "body_parts"]
ATTEMPT_KEYS = ["attempt_no", "rep_number", "outcome", "score", "skipped_reason", "body_parts", "score_parts",
                "variant", "reference_rep", "frame_start", "frame_end", "duration_s",
                "tracking_confidence", "warnings"]
REF_REP_KEYS = ["variant", "attempt_no", "frame_start", "frame_end", "selection", "label"]
MODEL_KEYS = ["id", "name", "formula", "formula_scale", "version"]


def check_output(res):
    """SimilarityOutput -> list of contract problems (empty = matches the schema in the module docstring)."""
    if not isinstance(res, dict):
        return ["output is not an object"]
    bad = []

    def keys(d, want, where):
        if not isinstance(d, dict) or set(d) != set(want):
            bad.append(f"{where}: keys differ from the schema: "
                       f"{sorted(set(d) ^ set(want)) if isinstance(d, dict) else 'not an object'}")

    score_ok = lambda v: v is None or (_is_num(v) and 0 <= v <= 100)
    keys(res, OUTPUT_KEYS, "output")
    try:
        json.dumps(res, allow_nan=False)
    except ValueError as e:
        bad.append(f"not strict JSON: {e}")
    st = res.get("status")
    if st not in ("ok", "partial", "error"):
        bad.append(f"status {st!r}")
    if (st == "error") != isinstance(res.get("error"), str):
        bad.append("error must be a string exactly when status is 'error'")
    if not (isinstance(res.get("warnings"), list) and all(isinstance(w, str) for w in res["warnings"])):
        bad.append("warnings must be a list of strings")
    ref = res.get("reference")
    if ref is not None:
        if ref.get("kind") not in ("package", "builtin"):
            bad.append(f"reference.kind {ref.get('kind')!r}")
        for r in ref.get("reps", []):
            keys(r, REF_REP_KEYS, "reference.reps[]")
    elif st != "error":
        bad.append("reference missing on a non-error output")
    summ = res.get("summary")
    keys(summ, SUMMARY_KEYS, "summary")
    for k in ("mean_score", "min_score", "max_score", "mean_score_correct", "mean_score_incorrect"):
        if isinstance(summ, dict) and not score_ok(summ.get(k)):
            bad.append(f"summary.{k} = {summ.get(k)!r} not in 0-100")
    for i, a in enumerate(res.get("attempts") or []):
        keys(a, ATTEMPT_KEYS, f"attempts[{i}]")
        if (a.get("score") is None) == (a.get("skipped_reason") is None):
            bad.append(f"attempts[{i}]: exactly one of score / skipped_reason must be set")
        if not score_ok(a.get("score")):
            bad.append(f"attempts[{i}].score = {a.get('score')!r} not in 0-100")
        if a.get("score") is not None and (set(a.get("body_parts", {})) != set(PARTS)
                                           or not all(score_ok(v) for v in a["body_parts"].values())):
            bad.append(f"attempts[{i}].body_parts must hold a 0-100 score for each of {PARTS}")
    if st == "partial" and not any(a.get("score") is None for a in res.get("attempts") or []):
        bad.append("status 'partial' but no attempt was skipped")
    keys(res.get("model"), MODEL_KEYS, "model")
    return bad


VIDEO_EXTENSIONS = (".mp4", ".mov", ".avi", ".mkv", ".webm")


def load_input(path, what="target"):
    """SimilarityInput .json -> dict, or the InputError to report (read_package). A video is refused with a hint: the
    service reads landmark packages only."""
    if path.lower().endswith(VIDEO_EXTENSIONS):
        return InputError(f"{what}: {os.path.basename(path)} is a video; the service reads SimilarityInput JSON "
                          f"(landmark packages). Convert a test video first (video_to_package.py, research repository).")
    try:
        return read_package(path, what)
    except InputError as e:
        return e


def main():
    ap = argparse.ArgumentParser(description="Similarity service: SimilarityInput JSON in, SimilarityOutput JSON out")
    ap.add_argument("--target", required=True, help="SimilarityInput JSON (the set to score)")
    ap.add_argument("--reference", help="SimilarityInput JSON (default: the exercise's built-in reference)")
    ap.add_argument("--ref_attempt", type=int, help="reference attempt_no to use (default: medoid of correct reps)")
    ap.add_argument("--out", help="SimilarityOutput JSON (default: print)")
    ap.add_argument("--model", help="model bundle id or folder (default: $SIMILARITY_MODEL, then service_config.json)")
    args = ap.parse_args()
    target = load_input(args.target, "target")                  # an InputError becomes the error output
    reference = load_input(args.reference, "reference") if args.reference else None
    res = SimilarityService(model=args.model).process(target, reference, args.ref_attempt)
    if not args.out:
        print(json.dumps(res, indent=2))
        sys.exit(2 if res["status"] == "error" else 0)
    write_output(res, args.out)
    for w in res["warnings"]:
        print(f"warning: {w}")
    r = res["reference"] or {"reps": []}
    print(f"reference: {r.get('kind')} {r.get('source')}: "
          + ", ".join(f"{x['variant']} -> {x['attempt_no'] or x['label']} ({x['selection']})" for x in r["reps"]))
    for a in res["attempts"]:
        print(f"  attempt {a['attempt_no']} [{a['outcome']}]: "
              + (f"skipped ({a['skipped_reason']})" if a["score"] is None
                 else f"{a['score']} ({a['variant']}, vs ref {a['reference_rep']})"))
    print(f"{res['status']}{': ' + res['error'] if res['error'] else ''}  mean {res['summary']['mean_score']} "
          f"+/- {res['summary']['std_score']} -> {args.out}")
    sys.exit(2 if res["status"] == "error" else 0)     # 0 = ok / partial, 2 = error output written


if __name__ == "__main__":
    main()
