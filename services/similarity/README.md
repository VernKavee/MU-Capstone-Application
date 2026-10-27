# src/similarity: motion similarity service

Scores how closely each rep of an exercise set matches a reference rep. A landmark package goes in: MediaPipe's
33 joints per frame, plus the set's attempts. The service reads only the 2D image coordinates (`x`, `y`, scaled to
pixels by `landmarks.frame_size`) and the visibility; each rep is mirrored to face image-right (the user may stand
on either side of the camera; the camera angle is fixed by the app's placement guide). A 0-100 score per attempt and per body part comes out. Exercises:
`squat`, `lunge`, `pushup`, `dumbbell_biceps_curls`.

This folder holds everything the service needs at run time: the code, the trained model and the built-in
reference reps. It finds all of them from its own location and imports nothing from elsewhere in the repository.
It needs Python 3.10 and three packages: `torch>=2.0` (CPU-only is enough), `numpy>=1.24` and `PyYAML`. It was
tested with torch 2.12.0, numpy 2.2.6 and PyYAML 6.0.3.

```python
import sys; sys.path.insert(0, "src/similarity")
from similarity_service import SimilarityService
service = SimilarityService()                                      # load once, reuse for every request
result = service.process(target_package, reference_package_or_None)   # never raises; check result["status"]
```

```bash
python src/similarity/similarity_service.py --target set.json [--reference coach.json] --out result.json
```

## Files

```
src/similarity/
├── similarity_service.py
├── model_bundle.py
├── reference_store.py
├── service_config.json
├── engine/
│   ├── __init__.py
│   ├── pose.py
│   ├── encoder.py
│   └── scoring.py
├── models/
│   └── bpe_v3_seed2026/
│       ├── model.json
│       ├── config.yaml
│       ├── autoencoder.pt
│       ├── meanpose.npy
│       └── stdpose.npy
└── references/
    ├── squat/                  reference.json, any.npy
    ├── pushup/                 reference.json, any.npy
    ├── lunge/                  reference.json, left.npy, right.npy
    └── dumbbell_biceps_curls/  reference.json, left.npy, right.npy
```

### Code

| File | What it does |
|---|---|
| `similarity_service.py` | **The entry point** (Python API and command line). Its module docstring defines the input and output package schemas field by field. It checks the input package (`validate`); cuts each attempt's frames (frames are read in order and a rep is a run of consecutive frames with the same attempt label, `frames[].attempt_no` or `.attempt`, cut where the label changes; without labels, `frame_start`/`frame_end`), drops lost frames and resamples to 30 fps, and resamples a rep shorter than 64 frames up to 64 (only when necessary: the encoder shortens time 8x, and a ~1 s app rep gave only 4 code steps; longer reps keep their length); works out the side (lunge front leg, curl arm); and picks the reference rep: the requested attempt, the medoid of the reference set's correct reps, or the built-in rep. It then scores every rep and builds the output package (`SimilarityService.process`). It also reads and writes packages (`read_package`, `write_output`) and checks an output against the contract (`check_output`). |
| `model_bundle.py` | Loads a model bundle from `models/<id>/` and checks it: the manifest version, that every file is present, every file's sha256, and that the formula is a known one. It decides which bundle to use: `SimilarityService(model=...)` or `--model`, then `$SIMILARITY_MODEL`, then `service_config.json`. `activate(id)` switches the active bundle. |
| `reference_store.py` | Loads and checks each exercise's built-in reference from `references/<exercise_key>/`: the manifest, the variants the exercise needs, `projection_scale`, sha256, and the array shape (15, 3, T) with T >= 16. `write_reference` writes a new one. |
| `add_reference.py` | Adds or replaces a built-in reference from a video of correct reps: the video goes through MediaPipe and the rule engine (needs the repository's `src/`), a variant is accepted when at least 3 of its reps pass the rules, and its most typical passing rep (REP_STARTED -> REP_COMPLETED) replaces that variant (format `image15`: MediaPipe image coordinates). The old folder is copied to `references/_replaced/` and put back if the service cannot load the new one. `python src/similarity/add_reference.py --video coach.mp4 --exercise squat [--dry_run]` |
| `service_config.json` | Names the active model (`"model": "bpe_v3_seed2026"`) and where bundles live (`"models_dir": "models"`, relative to this folder). Changing the model is an edit here, with no code change. |

### `engine/`: the scoring core

The files in `engine/` are copied from the research code in `scratch/similarity/`, so this folder runs on its
own. They must compute exactly what the originals compute; `scratch/similarity/tests/check_service_parity.py`
checks this. It is local only, like all of `scratch/similarity/`.

| File | What it does |
|---|---|
| `__init__.py` | Says where each file was copied from. |
| `pose.py` | Joint layout: MediaPipe's 33 joints become the model's 15 (`mp33_to_mixamo15`). Projection: the upright 2D view the model was trained on. `project_2d_video` builds a frontal virtual camera from the body's own left-right axis, and `project_2d` projects the LMC references with their stored body-size scale. Also the body parts of each exercise and which of them count towards the score (`EX_PARTS`, `score_parts`). |
| `encoder.py` | The motion encoder, the only part of the trained network the service runs. It builds the five per-body-part motion encoders and loads their weights from the bundle's checkpoint, refusing any missing or unexpected weight. Also the input normalisation: split into body parts, localise, then normalise with the bundle's `meanpose` / `stdpose`. |
| `scoring.py` | Compares the reference and target motion codes with DTW, giving the mean cosine and L2 along the warping path. Also the formula values (`code_spread`, `code_norm_ratio`) and the score: `cos * exp(-scale * value) * 100`, clipped to 0-100 (`compute_score_scaled`; a part moving against the reference has a negative cosine). |

### `models/`: the trained model

Each subfolder is one model bundle; the format is in the `model_bundle.py` docstring. The active one is
`bpe_v3_seed2026` (BodyPartAutoencoder3f v3, seed 2026, iteration 42000, built 2026-10-24).

| File | What it is |
|---|---|
| `model.json` | Manifest: id and name, file names, each file's sha256, the score formula (`norm_ratio`, scale 0.539362) and where the checkpoint came from (training run, iteration, git commit). |
| `config.yaml` | The training config. The encoder's architecture is rebuilt from it. |
| `autoencoder.pt` | The trained checkpoint, as a state dict (28 MB). Only the motion-encoder weights are used. |
| `meanpose.npy`, `stdpose.npy` | The normalisation statistics the model was trained with. |

### `references/`: built-in reference reps

The service uses these when a request sends no reference set. There is one folder per exercise and one rep per
variant, all from the LMC dataset. The format is in the `reference_store.py` docstring.

Each rep is a rep the rule-based module cuts, from the recording where the rules pass most
(`scratch/similarity/build_service_references.py`): every LMC take of the exercise (both subjects) went through the
same pipeline as the app (MediaPipe + the rule engine) in the exercise's camera view (squat and curl 45 deg, lunge
and pushup 90 deg side). Per variant, the take with the highest share of attempts passing the rules was used; its most
typical passing attempt, REP_STARTED -> REP_COMPLETED, is the reference, stored as MediaPipe's image coordinates of
that window (format `image15`, mirrored to face image-right), so it is the same kind of input as the app's reps. Each
manifest's `source` names the take, the attempt and the pass count.

| Folder | Variants (file: rep, frames at 30 fps, take) |
|---|---|
| `squat/` | `any.npy`: 49, boom-squats-00 45 deg (10/10 pass) |
| `pushup/` | `any.npy`: 39, boom-pushUP-00 90 deg (10/10) |
| `lunge/` | `left.npy`: left leg in front, 50, boom-lunge-02 90 deg (10/10); `right.npy`: right leg in front, 39, kavee-Lunge-02 90 deg (9/9) |
| `dumbbell_biceps_curls/` | `right.npy`: 38, kavee-curl-00 45 deg (9/9); `left.npy`: the right rep mirrored (left / right swapped): the LMC cameras film the subject's right, so the recorded left curl shows the far arm, while the app films the curling arm near the camera |

The service accepts only `image15` references; the older 3D formats (`lmc15` motion capture, `video15` world
landmarks) are refused with a message to rebuild them.

`reference.json` in each folder is the manifest: exercise, format, each variant's label, frame count and sha256.
Each `.npy` holds one rep.

## Related, outside this folder

Nothing outside this folder is needed to run the service, and nothing below is in git. `scratch/similarity/`
is the module owner's local research folder. It holds:

- `service/`: the acceptance test with sample packages (`tests/check_service_packages.py`, which must end with
  "all cases pass"), example input and output packages, `requirements.txt` and the setup and integration guide
  (`requirement.md`).
- The research code: it trains models, builds bundles (`make_model_bundle.py`) and references
  (`build_service_references.py`), and turns test videos into packages (`video_to_package.py`).
