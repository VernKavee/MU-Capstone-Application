"""MediaPipe's 33 joints -> the model's 15-joint layout, and the upright 2D view the model was trained on.

From lib/pose_input.py (joint layout) and evaluate_invariance.py (projection). One difference: project_2d takes the
body-size scale as an argument. evaluate_invariance.dataset_scale() computes a dataset's scale from the whole dataset
on disk; the built-in references store theirs in reference.json instead (reference_store.py)."""
import numpy as np

MP33_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "left_mouth", "right_mouth",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]
MP33_INDEX = {name: i for i, name in enumerate(MP33_NAMES)}

NECK = "neck"      # mean(left_shoulder, right_shoulder)
MIDHIP = "midhip"  # mean(left_hip, right_hip)

# Row i of the 15-joint skeleton <- MediaPipe index (or a derived midpoint).
# Person's right side goes to rows 2-4 / 9-11.
MP33_TO_MIXAMO15 = [0, NECK, 12, 14, 16, 11, 13, 15, MIDHIP, 24, 26, 28, 23, 25, 27]
MIXAMO15_ROOT = 8


def mp33_to_mixamo15(joints33, recenter=False):
    """(T,33,>=3) world landmarks -> (15,3,T) float32.
    recenter=True subtracts MidHip per frame so the hip is exactly the origin
    (MediaPipe world landmarks are already ~hip-centred)."""
    j = np.asarray(joints33, dtype=np.float32)[..., :3]
    if j.ndim != 3 or j.shape[1] != 33:
        raise ValueError(f"expected (T,33,3), got {j.shape}")
    T = j.shape[0]
    out = np.zeros((15, 3, T), dtype=np.float32)
    for row, src in enumerate(MP33_TO_MIXAMO15):
        if src == NECK:
            p = (j[:, 11] + j[:, 12]) / 2.0
        elif src == MIDHIP:
            p = (j[:, 23] + j[:, 24]) / 2.0
        else:
            p = j[:, src]
        out[row] = p.T
    if recenter:
        out -= out[MIXAMO15_ROOT:MIXAMO15_ROOT + 1]
    return out


# Which axis is vertical in each source's 3D data, and the sign that makes "down" positive. The model was trained on
# 2D image coordinates (x right, y DOWN), so every 3D rep is projected onto an upright view in that convention.
# LMC (Vicon) stores z-up; "video" = MediaPipe world landmarks, y-down.
VERTICAL_DOWN = {"LMC": (2, -1.0), "video": (1, 1.0)}

# Median neck-pelvis + thigh + shin length of the TRAINING 2D inputs (image coordinates).
TRAIN_BODY_CHAIN = 0.333

# The exercise's relevant body parts: the score averages these.
EX_PARTS = {
    "pushup": ['torso', 'left_arm', 'right_arm'],
    "squat": ['left_leg', 'right_leg', 'torso'],
    "lunge": ['left_leg', 'right_leg', 'torso'],
    "curl": ['left_arm', 'right_arm'],
}


# A push-up arm is judged by its elbow and wrist, the joints that move. At a side camera MediaPipe reports the far
# shoulder confidently (about 1.0) but guesses the far elbow and wrist: measured on the 90 and 45 deg push-up clips,
# far arm 0.07-0.45 per joint, near arm 0.93-0.99. 0.5 separates them in every rep.
ARM_FOCUS_JOINTS = ("elbow", "wrist")
ARM_VISIBLE_MIN = 0.5


def arm_visibility(conf):
    """(T,33) joint visibility of a rep's frames -> {"left": mean, "right": mean} over each arm's ARM_FOCUS_JOINTS."""
    return {s: float(np.mean([conf[:, MP33_INDEX[f"{s}_{j}"]] for j in ARM_FOCUS_JOINTS])) for s in ("left", "right")}


def score_parts(exercise, variant="any", arm_visible=None):
    """The parts a rep's score averages: EX_PARTS, except
    - a one-arm curl uses only its working arm (the other arm does not take part, and when the working side faces
      the camera it is also the hidden one);
    - a push-up with one arm hidden (arm_visible = arm_visibility(...): that side under ARM_VISIBLE_MIN, the other
      at or above it) uses the torso and the visible arm, so a guessed arm does not move the score."""
    if exercise == "curl" and variant in ("left", "right"):
        return [f"{variant}_arm"]
    if exercise == "pushup" and arm_visible:
        seen = [s for s in ("left", "right") if arm_visible[s] >= ARM_VISIBLE_MIN]
        if len(seen) == 1:
            return ["torso", f"{seen[0]}_arm"]
    return EX_PARTS[exercise]


def body_chain_length(motion):
    seg = lambda a, b: np.linalg.norm(motion[a] - motion[b], axis=0).mean()
    return seg(1, 8) + (seg(9, 10) + seg(12, 13)) / 2 + (seg(10, 11) + seg(13, 14)) / 2


def vertical_down(source):
    axis, sign = VERTICAL_DOWN[source]
    v = np.zeros(3)
    v[axis] = sign
    return v


def camera_basis(motion_3d, source):
    """A fixed virtual camera facing the body: (lateral, down) unit vectors. Lateral
    points from the right to the left side, matching the training images (people
    mostly face the camera, so the right shoulder has the smaller image x)."""
    down = vertical_down(source)
    lateral = (motion_3d[5] - motion_3d[2] + motion_3d[12] - motion_3d[9]).mean(axis=1)
    lateral = lateral - lateral.dot(down) * down
    return lateral / np.linalg.norm(lateral), down


def project_2d(motion_3d, source, scale):
    """3D rep (15,3,T) -> (15,2,T) model input: upright view, y-down, training units (x scale)."""
    lateral, down = camera_basis(motion_3d, source)
    proj = np.stack([np.einsum("jdt,d->jt", motion_3d, lateral),
                     np.einsum("jdt,d->jt", motion_3d, down)], axis=1)
    return (proj * scale).astype(np.float32)


def faces_left(motion15):
    """(15,3,T) image coordinates (x right, y down): True when the person faces image-left (head row 0 = nose left
    of the pelvis row 8, median over the rep). Side and 45 deg views only; a frontal view has no facing."""
    return bool(np.median(motion15[0, 0] - motion15[MIXAMO15_ROOT, 0]) < 0)


def to_facing_right(motion15):
    """Mirror a rep in x when it faces image-left, so every rep faces image-right (the app accepts the user on either
    side of the camera). Only x is negated; the left / right joint labels are kept (swapping them as well scored every
    fault high, FIX_LOG V7)."""
    if not faces_left(motion15):
        return motion15
    out = np.array(motion15, dtype=np.float32, copy=True)
    out[:, 0] = -out[:, 0]
    return out


def project_image(motion15):
    """(15,3,T) MediaPipe IMAGE coordinates in pixels (z = 0) -> (15,2,T) model input: faces image-right, y down, body
    size matched to the training data per rep. The model was trained on 2D image coordinates."""
    m = to_facing_right(motion15)
    return (m[:, :2] * (TRAIN_BODY_CHAIN / body_chain_length(m))).astype(np.float32)


def project_2d_video(motion_3d):
    """MediaPipe world landmarks (15,3,T) -> model input; body size matched to training per rep."""
    return project_2d(motion_3d, "video", TRAIN_BODY_CHAIN / body_chain_length(motion_3d))
