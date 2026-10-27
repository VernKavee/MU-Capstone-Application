"""
Built-in reference reps, one folder per exercise, so each exercise's reference can be replaced on its own.

  src/similarity/references/<exercise_key>/
    reference.json    manifest (below)
    <variant>.npy     one rep per variant: "any" (squat, pushup), "left" / "right" (lunge front leg, curl arm)

reference.json (reference_version 1):
{
  reference_version : 1
  exercise_key      : the folder name
  format            : the default format of the variants (each variant may name its own):
                      "lmc15"   (15,3,T) float32 3D joints in the 15-joint layout, LMC units, 30 fps (motion capture;
                                the service projects them with engine.pose.project_2d(..., "LMC", projection_scale))
                      "video15" (15,3,T) float32 MediaPipe world landmarks in the 15-joint layout (metres, hip
                                origin, y down), 30 fps (service 0.10)
                      "image15" (15,3,T) float32 MediaPipe IMAGE coordinates in pixels in the 15-joint layout,
                                z = 0, facing image-right, 30 fps: what the service (0.11+, 2D) uses; projected
                                exactly like the app's reps (engine.pose.project_image)
  projection_scale  : number    the body-size factor of the lmc15 projection: the training body size over the
                                source dataset's median (evaluate_invariance.dataset_scale), stored so the service
                                never needs the dataset; required when a variant is lmc15
  source_set        : the recording the reps come from; becomes the output's reference.source
  variants          : {variant: {file, label, frames, source, sha256, format (optional)}}
                      label: the name the output gives the rep (reference.reps[].label, attempts[].reference_rep)
  created           : ISO date
}

The service loads every exercise's folder when it starts and refuses (ReferenceStoreError, with what is wrong) a
missing folder or manifest, variants that are not the exercise's, a missing or non-positive projection_scale, a file
whose sha256 differs, or a motion that is not a finite (15, 3, T) array with T >= 16.

Replacing one exercise's reference: from a video of correct reps, python add_reference.py --video <video> --exercise
<exercise_key> (the rule engine must pass the reps; see its docstring); or rebuild it from the LMC data in the research
repository (scratch/similarity/build_service_references.py, local only). Then run tests/test_similarity_service.py.
"""
import os
import json
import datetime

import numpy as np

from model_bundle import sha256

REFS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "references")
REFERENCE_VERSION = 1
FORMAT = "lmc15"                       # the default (and older manifests' only) format
FORMATS = ("lmc15", "video15", "image15")
MANIFEST = "reference.json"


class ReferenceStoreError(RuntimeError):
    pass


def load_reference(exercise_key, variants, refs_dir=REFS_DIR, min_frames=16):
    """exercise_key, the variants it must have -> {"source_set", "projection_scale",
    "variants": {variant: {"motion", "label", "source"}}}. Raises ReferenceStoreError naming the problem."""
    folder = os.path.join(refs_dir, exercise_key)
    man_path = os.path.join(folder, MANIFEST)
    if not os.path.exists(man_path):
        raise ReferenceStoreError(f"no built-in reference for {exercise_key} ({man_path} missing); "
                                  f"see reference_store.py")
    try:
        with open(man_path, encoding="utf-8") as f:
            man = json.load(f)
    except (OSError, ValueError) as e:
        raise ReferenceStoreError(f"{man_path}: unreadable ({e})")
    if man.get("reference_version") != REFERENCE_VERSION:
        raise ReferenceStoreError(f"{man_path}: unsupported reference_version {man.get('reference_version')!r}")
    if man.get("exercise_key") != exercise_key:
        raise ReferenceStoreError(f"{man_path}: exercise_key {man.get('exercise_key')!r} != folder {exercise_key!r}")
    if man.get("format") not in FORMATS:
        raise ReferenceStoreError(f"{man_path}: unknown format {man.get('format')!r} (known: {list(FORMATS)})")
    have = man.get("variants") or {}
    formats = {v: e.get("format", man["format"]) for v, e in have.items()}
    for v, f in formats.items():
        if f not in FORMATS:
            raise ReferenceStoreError(f"{man_path}: variant {v}: unknown format {f!r} (known: {list(FORMATS)})")
    scale = man.get("projection_scale")
    if "lmc15" in formats.values() and (type(scale) not in (int, float) or not np.isfinite(scale) or scale <= 0):
        raise ReferenceStoreError(f"{man_path}: projection_scale must be a positive number, got {scale!r}")
    if set(have) != set(variants):
        raise ReferenceStoreError(f"{man_path}: variants {sorted(have)} != {sorted(variants)} needed by {exercise_key}")
    out = {}
    for v in variants:
        entry = have[v]
        path = os.path.join(folder, entry.get("file", ""))
        if not os.path.isfile(path):
            raise ReferenceStoreError(f"reference {exercise_key}/{v}: {path} missing")
        if sha256(path) != entry.get("sha256"):
            raise ReferenceStoreError(f"reference {exercise_key}/{v}: {entry['file']} does not match its sha256 in "
                                      f"{MANIFEST} (corrupt or replaced file; rebuild the reference)")
        motion = np.load(path, allow_pickle=False)
        if motion.ndim != 3 or motion.shape[:2] != (15, 3) or motion.shape[2] < min_frames \
                or not np.isfinite(motion).all():
            raise ReferenceStoreError(f"reference {exercise_key}/{v}: motion shape {motion.shape} is not a finite "
                                      f"(15, 3, T >= {min_frames}) array")
        out[v] = {"motion": motion.astype(np.float32), "label": entry.get("label"), "source": entry.get("source"),
                  "format": formats[v]}
    return {"source_set": man.get("source_set"), "projection_scale": float(scale) if scale else None, "variants": out}


def write_reference(exercise_key, source_set, projection_scale, reps, refs_dir=REFS_DIR):
    """reps: {variant: (label, motion (15,3,T), source[, format])} (format default lmc15) -> writes
    references/<exercise_key>/ (motion files first, the manifest last, so a half-written folder is refused by
    load_reference). projection_scale may be None when no variant is lmc15. Returns the folder."""
    folder = os.path.join(refs_dir, exercise_key)
    os.makedirs(folder, exist_ok=True)
    variants = {}
    for v, rep in reps.items():
        label, motion, source = rep[:3]
        fmt = rep[3] if len(rep) > 3 else FORMAT
        if fmt not in FORMATS:
            raise ReferenceStoreError(f"{exercise_key}/{v}: unknown format {fmt!r} (known: {list(FORMATS)})")
        name = f"{v}.npy"
        path = os.path.join(folder, name)
        np.save(path, np.asarray(motion, dtype=np.float32), allow_pickle=False)
        variants[v] = {"file": name, "label": label, "frames": int(motion.shape[-1]), "source": source,
                       "sha256": sha256(path)}
        if fmt != FORMAT:
            variants[v]["format"] = fmt
    man = {"reference_version": REFERENCE_VERSION, "exercise_key": exercise_key, "format": FORMAT,
           "projection_scale": float(projection_scale) if projection_scale else None, "source_set": source_set,
           "variants": variants,
           "created": datetime.date.today().isoformat()}
    tmp = os.path.join(folder, MANIFEST + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(man, f, indent=2)
        f.write("\n")
    os.replace(tmp, os.path.join(folder, MANIFEST))
    return folder
